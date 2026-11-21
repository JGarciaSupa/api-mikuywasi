import { and, eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { masterDb } from '../../../db';
import {
  actions,
  subActions,
  baseRoles,
  baseRolePermissions,
  tenantFeatureGrants,
  tenantRoleGrants,
} from '../../../db/master/schema';
import * as tenantSchema from '../../../db/tenant/schema';
import { RBAC_ACTIONS, RBAC_ROLES } from '../../../scripts/seed-master-rbac';

// Misma operación que `bun run rbac:add-missing`: solo agrega lo que falta.
// No borra permisos ni reescribe roles personalizados.

const MOZO_CAJA_CODES = ['caja.ver_sesiones', 'caja.abrir_sesion', 'caja.cerrar_sesion'];

type TenantRow = {
  id: number;
  name: string;
  dbName: string;
  server: { dbHost: string; dbPort: number; dbUser: string; dbPassword: string };
};

export interface MissingRbacReport {
  applied: boolean;
  missingPermissions: { code: string; name: string }[];
  missingRoles: { code: string; name: string }[];
  tenants: { name: string; dbName: string; changes: string[] }[];
}

const roleSeedByCode = new Map(RBAC_ROLES.map((r) => [r.code, r]));
const subSeedByCode = new Map(
  RBAC_ACTIONS.flatMap((a) => a.subActions.map((s) => [s.code, { action: a, sub: s }] as const)),
);

function connectTenant(tenant: TenantRow) {
  const host = process.env.DB_HOST_OVERRIDE || tenant.server.dbHost;
  const connStr = `postgres://${encodeURIComponent(tenant.server.dbUser)}:${encodeURIComponent(tenant.server.dbPassword)}@${host}:${tenant.server.dbPort}/${tenant.dbName}`;
  const pool = new Pool({ connectionString: connStr, max: 1 });
  return { pool, db: drizzle(pool, { schema: tenantSchema }) };
}

async function findMissingInMaster() {
  const existingSubs = new Set((await masterDb.select({ code: subActions.code }).from(subActions)).map((r) => r.code));
  const existingRoles = new Set((await masterDb.select({ code: baseRoles.code }).from(baseRoles)).map((r) => r.code));
  return {
    missingSubCodes: [...subSeedByCode.keys()].filter((code) => !existingSubs.has(code)),
    missingRoleCodes: RBAC_ROLES.map((r) => r.code).filter((code) => !existingRoles.has(code)),
  };
}

async function applyMaster(missingSubCodes: string[], missingRoleCodes: string[], tenantIds: number[]) {
  for (const code of missingSubCodes) {
    const { action, sub } = subSeedByCode.get(code)!;
    let [actionRow] = await masterDb.select().from(actions).where(eq(actions.code, action.code));
    if (!actionRow) {
      [actionRow] = await masterDb.insert(actions).values({
        code: action.code,
        name: action.name,
        description: action.description,
        icon: action.icon,
        order: action.order,
        isActive: true,
      }).returning();
    }
    await masterDb.insert(subActions).values({
      actionId: actionRow.id,
      code: sub.code,
      name: sub.name,
      description: sub.description,
      order: sub.order,
      isActive: true,
    }).onConflictDoNothing();
  }

  for (const code of missingRoleCodes) {
    const seed = roleSeedByCode.get(code)!;
    await masterDb.insert(baseRoles).values({
      code: seed.code,
      name: seed.name,
      description: seed.description,
      isActive: true,
    }).onConflictDoNothing();
  }

  const subIdByCode = new Map(
    (await masterDb.select({ id: subActions.id, code: subActions.code }).from(subActions)).map((r) => [r.code, r.id]),
  );
  const roleIdByCode = new Map(
    (await masterDb.select({ id: baseRoles.id, code: baseRoles.code }).from(baseRoles)).map((r) => [r.code, r.id]),
  );

  const permRows: { baseRoleId: number; subActionId: number }[] = [];
  for (const role of RBAC_ROLES) {
    const roleId = roleIdByCode.get(role.code);
    if (!roleId) continue;
    const isNewRole = missingRoleCodes.includes(role.code);
    for (const code of role.subActionCodes) {
      const subId = subIdByCode.get(code);
      if (subId && (isNewRole || missingSubCodes.includes(code))) permRows.push({ baseRoleId: roleId, subActionId: subId });
    }
  }
  if (permRows.length > 0) await masterDb.insert(baseRolePermissions).values(permRows).onConflictDoNothing();

  const newSubIds = missingSubCodes.map((code) => subIdByCode.get(code)!).filter(Boolean);
  const newRoleIds = missingRoleCodes.map((code) => roleIdByCode.get(code)!).filter(Boolean);
  for (const tenantId of tenantIds) {
    if (newSubIds.length > 0) {
      await masterDb.insert(tenantFeatureGrants)
        .values(newSubIds.map((subActionId) => ({ tenantId, subActionId })))
        .onConflictDoNothing();
    }
    if (newRoleIds.length > 0) {
      await masterDb.insert(tenantRoleGrants)
        .values(newRoleIds.map((baseRoleId) => ({ tenantId, baseRoleId })))
        .onConflictDoNothing();
    }
  }

  return { subIdByCode, roleIdByCode };
}

async function processTenant(
  tenant: TenantRow,
  missingSubCodes: string[],
  missingRoleCodes: string[],
  ids: { subIdByCode: Map<string, number>; roleIdByCode: Map<string, number> } | null,
  apply: boolean,
  revokeMozoCaja: boolean,
) {
  const { pool, db } = connectTenant(tenant);
  const report: string[] = [];

  try {
    await db.transaction(async (tx) => {
      const catalog = await tx.select().from(tenantSchema.permissionsCatalog);
      const catalogCodes = new Set(catalog.map((c) => c.subActionCode));
      const toAdd = missingSubCodes.filter((code) => !catalogCodes.has(code));
      if (toAdd.length > 0) report.push(`catálogo +${toAdd.length}: ${toAdd.join(', ')}`);

      if (apply && ids && toAdd.length > 0) {
        await tx.insert(tenantSchema.permissionsCatalog).values(toAdd.map((code) => {
          const { action, sub } = subSeedByCode.get(code)!;
          return {
            masterSubActionId: ids.subIdByCode.get(code)!,
            actionCode: action.code,
            actionName: action.name,
            subActionCode: sub.code,
            subActionName: sub.name,
            order: sub.order,
          };
        })).onConflictDoNothing();
      }

      const catalogIdByCode = new Map(
        (await tx.select({ id: tenantSchema.permissionsCatalog.id, code: tenantSchema.permissionsCatalog.subActionCode })
          .from(tenantSchema.permissionsCatalog)).map((r) => [r.code, r.id]),
      );

      const localRoles = await tx.select().from(tenantSchema.roles);
      for (const code of missingRoleCodes) {
        if (localRoles.some((r) => r.code === code)) continue;
        const seed = roleSeedByCode.get(code)!;
        report.push(`rol nuevo ${code} (${seed.subActionCodes.length} permisos del seed)`);
        if (apply && ids) {
          const [created] = await tx.insert(tenantSchema.roles).values({
            masterRoleId: ids.roleIdByCode.get(code)!,
            code: seed.code,
            name: seed.name,
            description: seed.description,
            isCustom: false,
            isActive: true,
          }).returning();
          const permIds = seed.subActionCodes.map((c) => catalogIdByCode.get(c)).filter((id): id is number => id !== undefined);
          if (permIds.length > 0) {
            await tx.insert(tenantSchema.rolePermissions)
              .values(permIds.map((permCatalogId) => ({ roleId: created.id, permCatalogId })))
              .onConflictDoNothing();
          }
        }
      }

      for (const role of localRoles.filter((r) => !r.isCustom && roleSeedByCode.has(r.code))) {
        const codes = roleSeedByCode.get(role.code)!.subActionCodes.filter((c) => missingSubCodes.includes(c));
        if (codes.length === 0) continue;
        report.push(`${role.code} +${codes.join(', ')}`);
        if (apply) {
          const permIds = codes.map((c) => catalogIdByCode.get(c)).filter((id): id is number => id !== undefined);
          if (permIds.length > 0) {
            await tx.insert(tenantSchema.rolePermissions)
              .values(permIds.map((permCatalogId) => ({ roleId: role.id, permCatalogId })))
              .onConflictDoNothing();
          }
        }
      }

      if (revokeMozoCaja) {
        const mozo = localRoles.find((r) => r.code === 'rol_mozo' && !r.isCustom);
        const permIds = MOZO_CAJA_CODES.map((c) => catalogIdByCode.get(c)).filter((id): id is number => id !== undefined);
        if (mozo && permIds.length > 0) {
          const current = await tx.select({ id: tenantSchema.rolePermissions.id })
            .from(tenantSchema.rolePermissions)
            .where(and(eq(tenantSchema.rolePermissions.roleId, mozo.id), inArray(tenantSchema.rolePermissions.permCatalogId, permIds)));
          if (current.length > 0) {
            report.push(`rol_mozo -${current.length} permiso(s) de caja`);
            if (apply) {
              await tx.delete(tenantSchema.rolePermissions)
                .where(inArray(tenantSchema.rolePermissions.id, current.map((r) => r.id)));
            }
          }
        }
      }
    });
  } finally {
    await pool.end();
  }

  return report;
}

export async function syncMissingRbac(options: { apply?: boolean; revokeMozoCaja?: boolean } = {}): Promise<MissingRbacReport> {
  const apply = options.apply === true;
  const revokeMozoCaja = options.revokeMozoCaja === true;
  const { missingSubCodes, missingRoleCodes } = await findMissingInMaster();
  const allTenants = (await masterDb.query.tenants.findMany({ with: { server: true } })) as TenantRow[];
  const ids = apply ? await applyMaster(missingSubCodes, missingRoleCodes, allTenants.map((t) => t.id)) : null;

  const tenants: MissingRbacReport['tenants'] = [];
  const failed: string[] = [];
  for (const tenant of allTenants) {
    try {
      const changes = await processTenant(tenant, missingSubCodes, missingRoleCodes, ids, apply, revokeMozoCaja);
      tenants.push({ name: tenant.name, dbName: tenant.dbName, changes });
    } catch (error: any) {
      failed.push(`${tenant.name}: ${error?.message || error}`);
    }
  }
  if (failed.length > 0) throw new Error(failed.join(' | '));

  return {
    applied: apply,
    missingPermissions: missingSubCodes.map((code) => ({
      code,
      name: subSeedByCode.get(code)?.sub.name ?? code,
    })),
    missingRoles: missingRoleCodes.map((code) => ({
      code,
      name: roleSeedByCode.get(code)?.name ?? code,
    })),
    tenants,
  };
}
