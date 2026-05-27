/**
 * RBAC Sync Service
 * -----------------
 * Propaga los grants del Superadmin (BD Master) hacia la BD del Tenant.
 *
 * ESTRATEGIA: Replicación selectiva del catálogo.
 * El catálogo de acciones/sub-acciones habilitadas se copia a la BD del tenant
 * en la tabla `permissions_catalog`. Esto elimina cualquier dependencia en
 * tiempo de ejecución con la BD Master para la validación de permisos.
 *
 * REDIS (cuando se integre):
 *   - Al terminar la sincronización, invalidar la clave:
 *       `perms:<tenantId>:*`
 *   - Actualmente la invalidación es implícita porque los permisos
 *     se reconstruyen en el siguiente login/refresh del usuario.
 */

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, inArray, and, notInArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { masterDb } from '../../../db';
import * as tenantSchema from '../../../db/tenant/schema';
import {
  tenants as tenantsTable,
  dbServers,
  subActions,
  actions,
  baseRoles,
  baseRolePermissions,
  tenantFeatureGrants,
  tenantRoleGrants,
} from '../../../db/master/schema';

// ── Helper: conexión directa a la BD del tenant ──────────────────────────────

async function connectToTenantDb(tenantId: number) {
  const tenantData = await masterDb.query.tenants.findFirst({
    where: eq(tenantsTable.id, tenantId),
    with: { server: true },
  });
  if (!tenantData) throw new Error(`Tenant ${tenantId} no encontrado`);

  const server = tenantData.server;
  const host = process.env.DB_HOST_OVERRIDE || server.dbHost;
  const connStr = `postgres://${encodeURIComponent(server.dbUser)}:${encodeURIComponent(server.dbPassword)}@${host}:${server.dbPort}/${tenantData.dbName}`;

  const pool = new Pool({ connectionString: connStr, max: 2 });
  const db = drizzle(pool, { schema: tenantSchema });
  return { db, pool };
}

// ── Sync completo de grants → permissions_catalog ────────────────────────────

/**
 * Lee todos los grants del tenant en la BD Master y replica el catálogo
 * completo en la BD del tenant (upsert + limpia los revocados).
 *
 * Llamar desde:
 *   - createTenant (post-migrations)
 *   - Endpoint PATCH /master/rbac/tenants/:id/grants (después de grant/revoke)
 */
export async function syncPermissionsCatalog(tenantId: number): Promise<void> {
  const grants = await masterDb
    .select({
      subActionId: subActions.id,
      actionCode: actions.code,
      actionName: actions.name,
      subActionCode: subActions.code,
      subActionName: subActions.name,
      order: subActions.order,
    })
    .from(tenantFeatureGrants)
    .innerJoin(subActions, eq(tenantFeatureGrants.subActionId, subActions.id))
    .innerJoin(actions, eq(subActions.actionId, actions.id))
    .where(eq(tenantFeatureGrants.tenantId, tenantId));

  const { db, pool } = await connectToTenantDb(tenantId);

  try {
    if (grants.length === 0) {
      // Si no hay grants, vaciar el catálogo local
      await db.delete(tenantSchema.permissionsCatalog);
      return;
    }

    // Upsert: insertar o actualizar cada sub-acción habilitada
    await db.insert(tenantSchema.permissionsCatalog)
      .values(grants.map((g) => ({
        masterSubActionId: g.subActionId,
        actionCode: g.actionCode,
        actionName: g.actionName,
        subActionCode: g.subActionCode,
        subActionName: g.subActionName,
        order: g.order,
        syncedAt: new Date(),
      })))
      .onConflictDoUpdate({
        target: tenantSchema.permissionsCatalog.masterSubActionId,
        set: {
          actionCode: sql`excluded.action_code`,
          actionName: sql`excluded.action_name`,
          subActionCode: sql`excluded.sub_action_code`,
          subActionName: sql`excluded.sub_action_name`,
          order: sql`excluded.order`,
          syncedAt: sql`now()`,
        },
      });

    // Eliminar entradas del catálogo que ya no tienen grant
    const grantedIds = grants.map((g) => g.subActionId);
    await db.delete(tenantSchema.permissionsCatalog).where(
      notInArray(tenantSchema.permissionsCatalog.masterSubActionId, grantedIds),
    );

  } finally {
    await pool.end();
  }
}

// ── Clonación de Roles Base → Roles locales del tenant ───────────────────────

/**
 * Para cada baseRoleId habilitado para el tenant, crea (si no existe) un rol
 * local en la BD del tenant y asigna los permisos del catálogo local.
 *
 * Reglas:
 *  - Si el rol ya fue clonado (masterRoleId match), actualiza sus permisos
 *    filtrando solo los que estén en permissions_catalog (pool habilitado).
 *  - Los roles personalizados (isCustom = true) no se tocan.
 *
 * Llamar desde:
 *   - syncPermissionsCatalog (para refrescar permisos de roles clonados)
 *   - Endpoint POST /master/rbac/tenants/:id/role-grants
 */
export async function syncBaseRolesToTenant(
  tenantId: number,
  baseRoleIds?: number[],
): Promise<void> {
  // Obtener roles concedidos al tenant desde la BD Master
  const roleGrantsQuery = masterDb
    .select({
      baseRoleId: baseRoles.id,
      baseRoleCode: baseRoles.code,
      baseRoleName: baseRoles.name,
      baseRoleDesc: baseRoles.description,
      subActionId: subActions.id,
    })
    .from(tenantRoleGrants)
    .innerJoin(baseRoles, eq(tenantRoleGrants.baseRoleId, baseRoles.id))
    .leftJoin(baseRolePermissions, eq(baseRolePermissions.baseRoleId, baseRoles.id))
    .leftJoin(subActions, eq(baseRolePermissions.subActionId, subActions.id))
    .where(
      baseRoleIds && baseRoleIds.length > 0
        ? and(
            eq(tenantRoleGrants.tenantId, tenantId),
            inArray(tenantRoleGrants.baseRoleId, baseRoleIds),
          )
        : eq(tenantRoleGrants.tenantId, tenantId),
    );

  const rows = await roleGrantsQuery;

  if (!rows.length) return;

  // Agrupar por baseRoleId
  type RoleGroup = {
    baseRoleId: number;
    code: string;
    name: string;
    description: string | null | undefined;
    subActionIds: number[];
  };

  const roleMap = new Map<number, RoleGroup>();
  for (const row of rows) {
    if (!roleMap.has(row.baseRoleId)) {
      roleMap.set(row.baseRoleId, {
        baseRoleId: row.baseRoleId,
        code: row.baseRoleCode,
        name: row.baseRoleName,
        description: row.baseRoleDesc,
        subActionIds: [],
      });
    }
    if (row.subActionId != null) {
      roleMap.get(row.baseRoleId)!.subActionIds.push(row.subActionId);
    }
  }

  const { db, pool } = await connectToTenantDb(tenantId);

  try {
    // Obtener catálogo local para mapear masterSubActionId → permCatalogId
    const catalog = await db
      .select({
        id: tenantSchema.permissionsCatalog.id,
        masterSubActionId: tenantSchema.permissionsCatalog.masterSubActionId,
      })
      .from(tenantSchema.permissionsCatalog);

    const catalogMap = new Map(catalog.map((c) => [c.masterSubActionId, c.id]));

    for (const roleGroup of Array.from(roleMap.values())) {
      // Upsert del rol (por code único)
      const [localRole] = await db.insert(tenantSchema.roles)
        .values({
          masterRoleId: roleGroup.baseRoleId,
          code: roleGroup.code,
          name: roleGroup.name,
          description: roleGroup.description ?? undefined,
          isCustom: false,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: tenantSchema.roles.code,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            updatedAt: sql`now()`,
          },
        })
        .returning();

      // Reconstruir permisos del rol: filtrar solo lo que está en el catálogo local
      const permCatalogIds = roleGroup.subActionIds
        .map((id) => catalogMap.get(id))
        .filter((id): id is number => id !== undefined);

      await db.delete(tenantSchema.rolePermissions).where(
        eq(tenantSchema.rolePermissions.roleId, localRole.id),
      );

      if (permCatalogIds.length > 0) {
        await db.insert(tenantSchema.rolePermissions).values(
          permCatalogIds.map((permCatalogId) => ({
            roleId: localRole.id,
            permCatalogId,
          })),
        ).onConflictDoNothing();
      }
    }
  } finally {
    await pool.end();
  }
}

/**
 * Sync completo: primero sincroniza el catálogo de permisos,
 * luego actualiza los roles base clonados.
 * Punto de entrada principal — llamar al crear tenant o tras cambios de grants.
 */
export async function fullSyncTenant(tenantId: number): Promise<void> {
  await syncPermissionsCatalog(tenantId);
  await syncBaseRolesToTenant(tenantId);
}
