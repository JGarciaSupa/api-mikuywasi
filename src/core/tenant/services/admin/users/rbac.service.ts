import { eq, asc, and } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import {
  permissionsCatalog, roles, rolePermissions, userRoles, users, userPermissionOverrides,
} from '@/db/tenant/schema';
import type { PermissionsMap } from '@/utils/jwt';

// ──────────────────────────────────────────
// CATÁLOGO DE PERMISOS (solo lectura)
// ──────────────────────────────────────────

export async function listPermissionsCatalog() {
  const db = getTenantDb();
  const catalog = await db
    .select()
    .from(permissionsCatalog)
    .orderBy(asc(permissionsCatalog.actionCode), asc(permissionsCatalog.order));

  // Agrupar por acción para facilitar el consumo en el frontend
  const grouped: Record<string, { actionCode: string; actionName: string; subActions: typeof catalog }> = {};
  for (const entry of catalog) {
    if (!grouped[entry.actionCode]) {
      grouped[entry.actionCode] = {
        actionCode: entry.actionCode,
        actionName: entry.actionName,
        subActions: [],
      };
    }
    grouped[entry.actionCode].subActions.push(entry);
  }
  return Object.values(grouped);
}

// ──────────────────────────────────────────
// ROLES
// ──────────────────────────────────────────

export async function listRoles() {
  const db = getTenantDb();
  return db.query.roles.findMany({
    with: {
      permissions: {
        with: { permCatalog: true },
      },
    },
    orderBy: asc(roles.name),
  });
}

export async function getRoleById(id: number) {
  const db = getTenantDb();
  const role = await db.query.roles.findFirst({
    where: eq(roles.id, id),
    with: {
      permissions: {
        with: { permCatalog: true },
      },
    },
  });
  if (!role) throw new Error('Rol no encontrado');
  return role;
}

export async function createCustomRole(data: {
  code: string;
  name: string;
  description?: string;
  permCatalogIds: number[];
}) {
  const db = getTenantDb();

  const existing = await db.query.roles.findFirst({ where: eq(roles.code, data.code) });
  if (existing) throw new Error(`Ya existe un rol con el código "${data.code}"`);

  // Validar que todos los permCatalogIds existen en el catálogo local
  if (data.permCatalogIds.length > 0) {
    const catalog = await db.select({ id: permissionsCatalog.id }).from(permissionsCatalog);
    const validIds = new Set(catalog.map((c) => c.id));
    const invalid = data.permCatalogIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new Error(`Permisos no disponibles para este tenant: [${invalid.join(', ')}]`);
    }
  }

  return db.transaction(async (tx) => {
    const [role] = await tx.insert(roles).values({
      code: data.code,
      name: data.name,
      description: data.description,
      isCustom: true,
      masterRoleId: null,
      isActive: true,
    }).returning();

    if (data.permCatalogIds.length > 0) {
      await tx.insert(rolePermissions).values(
        data.permCatalogIds.map((permCatalogId) => ({ roleId: role.id, permCatalogId })),
      );
    }
    return role;
  });
}

export async function updateRole(id: number, data: {
  name?: string;
  description?: string;
  isActive?: boolean;
  permCatalogIds?: number[];
}) {
  const db = getTenantDb();
  const { permCatalogIds, ...headerData } = data;

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(roles)
      .set({ ...headerData, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();
    if (!updated) throw new Error('Rol no encontrado');

    if (permCatalogIds !== undefined) {
      // Validar permisos contra catálogo local
      if (permCatalogIds.length > 0) {
        const catalog = await tx.select({ id: permissionsCatalog.id }).from(permissionsCatalog);
        const validIds = new Set(catalog.map((c) => c.id));
        const invalid = permCatalogIds.filter((id) => !validIds.has(id));
        if (invalid.length > 0) throw new Error(`Permisos no disponibles: [${invalid.join(', ')}]`);
      }

      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      if (permCatalogIds.length > 0) {
        await tx.insert(rolePermissions).values(
          permCatalogIds.map((permCatalogId) => ({ roleId: id, permCatalogId })),
        ).onConflictDoNothing();
      }
    }
    return updated;
  });
}

export async function deleteRole(id: number) {
  const db = getTenantDb();

  // No eliminar si hay usuarios con este rol
  const assigned = await db.query.userRoles.findFirst({ where: eq(userRoles.roleId, id) });
  if (assigned) throw new Error('No se puede eliminar un rol que tiene usuarios asignados');

  const [deleted] = await db.delete(roles).where(eq(roles.id, id)).returning();
  if (!deleted) throw new Error('Rol no encontrado');
  return deleted;
}

// ──────────────────────────────────────────
// ASIGNACIÓN USUARIO → ROL
// ──────────────────────────────────────────

export async function assignRoleToUser(userId: number, roleId: number, assignedBy?: number) {
  const db = getTenantDb();

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error('Usuario no encontrado');

  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role) throw new Error('Rol no encontrado');
  if (!role.isActive) throw new Error('El rol está inactivo');

  // Upsert: si ya tiene rol, lo reemplaza
  const [result] = await db.insert(userRoles)
    .values({ userId, roleId, assignedBy: assignedBy ?? null, assignedAt: new Date() })
    .onConflictDoUpdate({
      target: userRoles.userId,
      set: { roleId, assignedBy: assignedBy ?? null, assignedAt: new Date() },
    })
    .returning();

  return result;
}

export async function removeRoleFromUser(userId: number) {
  const db = getTenantDb();
  const [deleted] = await db.delete(userRoles).where(eq(userRoles.userId, userId)).returning();
  if (!deleted) throw new Error('El usuario no tiene rol asignado');
  return deleted;
}

export async function getUserRole(userId: number) {
  const db = getTenantDb();
  return db.query.userRoles.findFirst({
    where: eq(userRoles.userId, userId),
    with: {
      role: {
        with: {
          permissions: { with: { permCatalog: true } },
        },
      },
    },
  });
}

// ──────────────────────────────────────────
// USER PERMISSION OVERRIDES
// ──────────────────────────────────────────

export async function getUserOverrides(userId: number) {
  const db = getTenantDb();
  return db.query.userPermissionOverrides.findMany({
    where: eq(userPermissionOverrides.userId, userId),
    with: { permCatalog: true },
  });
}

export async function setUserOverrides(
  userId: number,
  overrides: { permCatalogId: number; type: 'grant' | 'deny' }[],
  grantedBy?: number,
) {
  const db = getTenantDb();

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error('Usuario no encontrado');

  if (overrides.length > 0) {
    const catalog = await db.select({ id: permissionsCatalog.id }).from(permissionsCatalog);
    const validIds = new Set(catalog.map((c) => c.id));
    const invalid = overrides.filter((o) => !validIds.has(o.permCatalogId));
    if (invalid.length > 0) {
      throw new Error(`Permisos no disponibles: [${invalid.map((o) => o.permCatalogId).join(', ')}]`);
    }
  }

  return db.transaction(async (tx) => {
    // Replace all overrides for this user
    await tx.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, userId));
    if (overrides.length > 0) {
      await tx.insert(userPermissionOverrides).values(
        overrides.map((o) => ({
          userId,
          permCatalogId: o.permCatalogId,
          type: o.type,
          grantedBy: grantedBy ?? null,
        })),
      );
    }
    return getUserOverrides(userId);
  });
}

export async function removeUserOverride(userId: number, permCatalogId: number) {
  const db = getTenantDb();
  const [deleted] = await db
    .delete(userPermissionOverrides)
    .where(and(
      eq(userPermissionOverrides.userId, userId),
      eq(userPermissionOverrides.permCatalogId, permCatalogId),
    ))
    .returning();
  if (!deleted) throw new Error('Override no encontrado');
  return deleted;
}

// ──────────────────────────────────────────
// HELPER: construir mapa de permisos para JWT
// effective = (role_perms ∪ grants) − denies
// ──────────────────────────────────────────

export async function buildPermissionsForUser(userId: number): Promise<{
  roleId: number | null;
  permissions: PermissionsMap;
}> {
  const db = getTenantDb();

  const [userRole, overrides] = await Promise.all([
    getUserRole(userId),
    db.query.userPermissionOverrides.findMany({
      where: eq(userPermissionOverrides.userId, userId),
      with: { permCatalog: true },
    }),
  ]);

  // Build a map of catalog entries from role permissions
  const permMap: Map<number, { actionCode: string; subActionCode: string }> = new Map();

  if (userRole) {
    for (const rp of userRole.role.permissions) {
      permMap.set(rp.permCatalogId, {
        actionCode: rp.permCatalog.actionCode,
        subActionCode: rp.permCatalog.subActionCode,
      });
    }
  }

  // Apply grants (add entries not in role)
  for (const ov of overrides) {
    if (ov.type === 'grant') {
      permMap.set(ov.permCatalogId, {
        actionCode: ov.permCatalog.actionCode,
        subActionCode: ov.permCatalog.subActionCode,
      });
    }
  }

  // Apply denies (remove entries)
  for (const ov of overrides) {
    if (ov.type === 'deny') {
      permMap.delete(ov.permCatalogId);
    }
  }

  const permissions: PermissionsMap = {};
  for (const { actionCode, subActionCode } of Array.from(permMap.values())) {
    if (!permissions[actionCode]) permissions[actionCode] = [];
    permissions[actionCode].push(subActionCode);
  }

  return { roleId: userRole?.roleId ?? null, permissions };
}
