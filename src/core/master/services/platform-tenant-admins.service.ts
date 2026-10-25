/**
 * Cuentas Admin de plataforma en tenants
 * --------------------------------------
 * Un usuario de plataforma marcado con `provisionToTenants` se crea como
 * `rol_admin` en cada tenant nuevo (y, bajo demanda, en los existentes).
 *
 * - La cuenta del tenant reutiliza el hash bcrypt del usuario de plataforma:
 *   la contraseña nunca viaja en claro.
 * - Cada cuenta creada se registra en `platform_user_tenant_links`. Solo esas
 *   cuentas reciben cambios de contraseña y bajas; si el tenant ya tiene un
 *   usuario propio con el mismo username, se omite (conflicto) y no se toca.
 */
import { masterDb } from '../../../db';
import { users, tenants, platformUserTenantLinks } from '../../../db/master/schema';
import * as tenantSchema from '../../../db/tenant/schema';
import { and, eq } from 'drizzle-orm';
import { getTenantDatabaseInstance } from './tenants.service';

// Longitud máxima de `users.username` en la BD del tenant
const TENANT_USERNAME_MAX = 50;
const ADMIN_ROLE_CODE = 'rol_admin';

type PlatformUser = typeof users.$inferSelect;

export type ProvisionStatus = 'created' | 'existing' | 'conflict' | 'failed';

export interface ProvisionResult {
  tenantId: number;
  tenantName: string;
  status: ProvisionStatus;
  message?: string;
}

export interface PropagationResult {
  tenantId: number;
  status: 'updated' | 'failed';
  message?: string;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Error desconocido';

/**
 * Crea (o reactiva) la cuenta Admin del usuario de plataforma en un tenant.
 */
export const provisionUserToTenant = async (
  user: PlatformUser,
  tenant: { id: number; name: string },
): Promise<ProvisionResult> => {
  const base = { tenantId: tenant.id, tenantName: tenant.name };

  if (user.userName.length > TENANT_USERNAME_MAX) {
    return { ...base, status: 'conflict', message: `El username supera ${TENANT_USERNAME_MAX} caracteres` };
  }

  try {
    const db = await getTenantDatabaseInstance(tenant.id);

    const [adminRole] = await db
      .select({ id: tenantSchema.roles.id })
      .from(tenantSchema.roles)
      .where(and(eq(tenantSchema.roles.code, ADMIN_ROLE_CODE), eq(tenantSchema.roles.isActive, true)));
    if (!adminRole) {
      return { ...base, status: 'failed', message: 'El tenant no tiene el rol rol_admin activo' };
    }

    const link = await masterDb.query.platformUserTenantLinks.findFirst({
      where: and(
        eq(platformUserTenantLinks.userId, user.id),
        eq(platformUserTenantLinks.tenantId, tenant.id),
      ),
    });

    // Ya se creó antes: se asegura que siga activa, con la contraseña y el rol vigentes
    if (link) {
      const [linkedUser] = await db
        .update(tenantSchema.users)
        .set({ password: user.password, deletedAt: null, updatedAt: new Date() })
        .where(eq(tenantSchema.users.id, link.tenantUserId))
        .returning({ id: tenantSchema.users.id });

      if (linkedUser) {
        await db
          .insert(tenantSchema.userRoles)
          .values({ userId: linkedUser.id, roleId: adminRole.id })
          .onConflictDoUpdate({ target: tenantSchema.userRoles.userId, set: { roleId: adminRole.id } });
        return { ...base, status: 'existing' };
      }

      // La cuenta vinculada ya no existe en el tenant: se descarta el vínculo y se crea de nuevo
      await masterDb.delete(platformUserTenantLinks).where(eq(platformUserTenantLinks.id, link.id));
    }

    const [taken] = await db
      .select({ id: tenantSchema.users.id })
      .from(tenantSchema.users)
      .where(eq(tenantSchema.users.username, user.userName));
    if (taken) {
      return { ...base, status: 'conflict', message: 'El tenant ya tiene un usuario propio con ese username' };
    }

    const newUser = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(tenantSchema.users)
        .values({ username: user.userName, password: user.password, name: user.name })
        .returning({ id: tenantSchema.users.id });

      await tx.insert(tenantSchema.userRoles).values({ userId: inserted.id, roleId: adminRole.id });
      return inserted;
    });

    try {
      await masterDb.insert(platformUserTenantLinks).values({
        userId: user.id,
        tenantId: tenant.id,
        tenantUserId: newUser.id,
      });
    } catch (linkError) {
      // Sin vínculo la cuenta quedaría huérfana: se deshace en el tenant
      await db.delete(tenantSchema.users).where(eq(tenantSchema.users.id, newUser.id));
      throw linkError;
    }

    return { ...base, status: 'created' };
  } catch (error) {
    return { ...base, status: 'failed', message: errorMessage(error) };
  }
};

/**
 * Al crear un tenant: provisiona a todos los usuarios de plataforma marcados.
 */
export const provisionFlaggedUsersToTenant = async (tenantId: number) => {
  const tenant = await masterDb.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  if (!tenant) throw new Error('Tenant no encontrado');

  const flagged = await masterDb.query.users.findMany({
    where: eq(users.provisionToTenants, true),
  });

  const results: ProvisionResult[] = [];
  for (const user of flagged) {
    results.push(await provisionUserToTenant(user, tenant));
  }
  return results;
};

/**
 * Al clonar un tenant: la copia trae los usuarios del origen con los mismos ids,
 * así que se replican sus vínculos para que esas cuentas sigan reconociéndose.
 */
export const copyLinksFromSourceTenant = async (sourceTenantId: number, targetTenantId: number) => {
  const sourceLinks = await masterDb.query.platformUserTenantLinks.findMany({
    where: eq(platformUserTenantLinks.tenantId, sourceTenantId),
  });
  if (sourceLinks.length === 0) return;

  await masterDb.insert(platformUserTenantLinks)
    .values(sourceLinks.map((l) => ({ userId: l.userId, tenantId: targetTenantId, tenantUserId: l.tenantUserId })))
    .onConflictDoNothing();
};

/**
 * Bajo demanda: provisiona un usuario de plataforma en todos los tenants activos.
 */
export const provisionUserToAllTenants = async (userId: number) => {
  const user = await masterDb.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error('Usuario no encontrado');
  if (!user.provisionToTenants) {
    throw new Error('Activa "Admin en tenants" en el usuario antes de aplicarlo a los tenants existentes');
  }

  const activeTenants = await masterDb.query.tenants.findMany({
    where: eq(tenants.status, 'active'),
    orderBy: (t, { asc }) => [asc(t.id)],
  });

  const results: ProvisionResult[] = [];
  for (const tenant of activeTenants) {
    results.push(await provisionUserToTenant(user, tenant));
  }

  return {
    total: results.length,
    created: results.filter((r) => r.status === 'created').length,
    existing: results.filter((r) => r.status === 'existing').length,
    conflict: results.filter((r) => r.status === 'conflict').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };
};

/**
 * Copia el nuevo hash de contraseña a las cuentas vinculadas y revoca sus sesiones.
 */
export const propagatePasswordToTenants = async (userId: number, passwordHash: string) => {
  const links = await masterDb.query.platformUserTenantLinks.findMany({
    where: eq(platformUserTenantLinks.userId, userId),
  });

  const results: PropagationResult[] = [];
  for (const link of links) {
    try {
      const db = await getTenantDatabaseInstance(link.tenantId);
      await db
        .update(tenantSchema.users)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(tenantSchema.users.id, link.tenantUserId));
      await db
        .update(tenantSchema.refreshTokens)
        .set({ isRevoked: true })
        .where(eq(tenantSchema.refreshTokens.userId, link.tenantUserId));
      results.push({ tenantId: link.tenantId, status: 'updated' });
    } catch (error) {
      results.push({ tenantId: link.tenantId, status: 'failed', message: errorMessage(error) });
    }
  }
  return results;
};

/**
 * Antes de eliminar un usuario de plataforma: baja lógica de sus cuentas vinculadas.
 */
export const deactivateLinkedTenantUsers = async (userId: number) => {
  const links = await masterDb.query.platformUserTenantLinks.findMany({
    where: eq(platformUserTenantLinks.userId, userId),
  });

  const results: PropagationResult[] = [];
  for (const link of links) {
    try {
      const db = await getTenantDatabaseInstance(link.tenantId);
      await db
        .update(tenantSchema.users)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(tenantSchema.users.id, link.tenantUserId));
      await db
        .update(tenantSchema.refreshTokens)
        .set({ isRevoked: true })
        .where(eq(tenantSchema.refreshTokens.userId, link.tenantUserId));
      results.push({ tenantId: link.tenantId, status: 'updated' });
    } catch (error) {
      results.push({ tenantId: link.tenantId, status: 'failed', message: errorMessage(error) });
    }
  }
  return results;
};
