import { eq, inArray, and, asc } from 'drizzle-orm';
import { masterDb } from '../../../db';
import {
  actions, subActions, baseRoles, baseRolePermissions,
  tenantFeatureGrants, tenantRoleGrants, tenants,
} from '../../../db/master/schema';

// ──────────────────────────────────────────
// ACTIONS (Módulos del sistema)
// ──────────────────────────────────────────

export async function listActions() {
  return masterDb.query.actions.findMany({
    with: { subActions: { orderBy: asc(subActions.order) } },
    orderBy: asc(actions.order),
  });
}

export async function getActionById(id: number) {
  const action = await masterDb.query.actions.findFirst({
    where: eq(actions.id, id),
    with: { subActions: { orderBy: asc(subActions.order) } },
  });
  if (!action) throw new Error('Acción no encontrada');
  return action;
}

export async function createAction(data: {
  code: string;
  name: string;
  description?: string;
  icon?: string;
  order?: number;
}) {
  const existing = await masterDb.query.actions.findFirst({ where: eq(actions.code, data.code) });
  if (existing) throw new Error(`Ya existe una acción con el código "${data.code}"`);

  const [created] = await masterDb.insert(actions).values(data).returning();
  return created;
}

export async function updateAction(id: number, data: Partial<{
  code: string;
  name: string;
  description: string;
  icon: string;
  order: number;
  isActive: boolean;
}>) {
  const [updated] = await masterDb.update(actions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(actions.id, id))
    .returning();
  if (!updated) throw new Error('Acción no encontrada');
  return updated;
}

// ──────────────────────────────────────────
// SUB-ACTIONS (Operaciones específicas)
// ──────────────────────────────────────────

export async function listSubActions(actionId?: number) {
  if (actionId) {
    return masterDb.query.subActions.findMany({
      where: eq(subActions.actionId, actionId),
      with: { action: true },
      orderBy: asc(subActions.order),
    });
  }
  return masterDb.query.subActions.findMany({
    with: { action: true },
    orderBy: [asc(subActions.actionId), asc(subActions.order)],
  });
}

export async function createSubAction(data: {
  actionId: number;
  code: string;
  name: string;
  description?: string;
  order?: number;
}) {
  const action = await masterDb.query.actions.findFirst({ where: eq(actions.id, data.actionId) });
  if (!action) throw new Error('Acción padre no encontrada');

  const existing = await masterDb.query.subActions.findFirst({ where: eq(subActions.code, data.code) });
  if (existing) throw new Error(`Ya existe una sub-acción con el código "${data.code}"`);

  const [created] = await masterDb.insert(subActions).values(data).returning();
  return created;
}

export async function updateSubAction(id: number, data: Partial<{
  code: string;
  name: string;
  description: string;
  order: number;
  isActive: boolean;
}>) {
  const [updated] = await masterDb.update(subActions)
    .set(data)
    .where(eq(subActions.id, id))
    .returning();
  if (!updated) throw new Error('Sub-acción no encontrada');
  return updated;
}

// ──────────────────────────────────────────
// BASE ROLES (Roles Plantilla)
// ──────────────────────────────────────────

export async function listBaseRoles() {
  return masterDb.query.baseRoles.findMany({
    with: {
      permissions: {
        with: { subAction: { with: { action: true } } },
      },
    },
    orderBy: asc(baseRoles.code),
  });
}

export async function getBaseRoleById(id: number) {
  const role = await masterDb.query.baseRoles.findFirst({
    where: eq(baseRoles.id, id),
    with: {
      permissions: {
        with: { subAction: { with: { action: true } } },
      },
    },
  });
  if (!role) throw new Error('Rol base no encontrado');
  return role;
}

export async function createBaseRole(data: {
  code: string;
  name: string;
  description?: string;
  subActionIds: number[];
}) {
  const existing = await masterDb.query.baseRoles.findFirst({ where: eq(baseRoles.code, data.code) });
  if (existing) throw new Error(`Ya existe un rol con el código "${data.code}"`);

  return masterDb.transaction(async (tx) => {
    const [role] = await tx.insert(baseRoles).values({
      code: data.code,
      name: data.name,
      description: data.description,
    }).returning();

    if (data.subActionIds.length > 0) {
      await tx.insert(baseRolePermissions).values(
        data.subActionIds.map((subActionId) => ({ baseRoleId: role.id, subActionId })),
      );
    }
    return role;
  });
}

export async function updateBaseRole(id: number, data: {
  name?: string;
  description?: string;
  isActive?: boolean;
  subActionIds?: number[];
}) {
  const { subActionIds, ...headerData } = data;

  return masterDb.transaction(async (tx) => {
    const [updated] = await tx.update(baseRoles)
      .set({ ...headerData, updatedAt: new Date() })
      .where(eq(baseRoles.id, id))
      .returning();
    if (!updated) throw new Error('Rol base no encontrado');

    if (subActionIds !== undefined) {
      await tx.delete(baseRolePermissions).where(eq(baseRolePermissions.baseRoleId, id));
      if (subActionIds.length > 0) {
        await tx.insert(baseRolePermissions).values(
          subActionIds.map((subActionId) => ({ baseRoleId: id, subActionId })),
        );
      }
    }
    return updated;
  });
}

// ──────────────────────────────────────────
// TENANT FEATURE GRANTS
// ──────────────────────────────────────────

export async function getTenantGrants(tenantId: number) {
  const tenant = await masterDb.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  if (!tenant) throw new Error('Tenant no encontrado');

  const [featureGrants, roleGrants] = await Promise.all([
    masterDb.query.tenantFeatureGrants.findMany({
      where: eq(tenantFeatureGrants.tenantId, tenantId),
      with: { subAction: { with: { action: true } } },
    }),
    masterDb.query.tenantRoleGrants.findMany({
      where: eq(tenantRoleGrants.tenantId, tenantId),
      with: {
        baseRole: {
          with: {
            permissions: {
              with: { subAction: { with: { action: true } } },
            },
          },
        },
      },
    }),
  ]);

  return { featureGrants, roleGrants };
}

export async function grantFeaturesToTenant(
  tenantId: number,
  subActionIds: number[],
  grantedBy?: number,
) {
  if (!subActionIds.length) return [];

  const values = subActionIds.map((subActionId) => ({
    tenantId,
    subActionId,
    grantedBy: grantedBy ?? null,
  }));

  return masterDb.insert(tenantFeatureGrants)
    .values(values)
    .onConflictDoNothing()
    .returning();
}

export async function revokeFeatureFromTenant(tenantId: number, subActionIds: number[]) {
  if (!subActionIds.length) return;
  await masterDb.delete(tenantFeatureGrants).where(
    and(
      eq(tenantFeatureGrants.tenantId, tenantId),
      inArray(tenantFeatureGrants.subActionId, subActionIds),
    ),
  );
}

export async function grantRolesToTenant(
  tenantId: number,
  baseRoleIds: number[],
  grantedBy?: number,
) {
  if (!baseRoleIds.length) return [];

  const values = baseRoleIds.map((baseRoleId) => ({
    tenantId,
    baseRoleId,
    grantedBy: grantedBy ?? null,
  }));

  return masterDb.insert(tenantRoleGrants)
    .values(values)
    .onConflictDoNothing()
    .returning();
}

export async function revokeRoleFromTenant(tenantId: number, baseRoleIds: number[]) {
  if (!baseRoleIds.length) return;
  await masterDb.delete(tenantRoleGrants).where(
    and(
      eq(tenantRoleGrants.tenantId, tenantId),
      inArray(tenantRoleGrants.baseRoleId, baseRoleIds),
    ),
  );
}
