import type { Context } from 'hono';
import type { JwtPayload, PermissionsMap } from './jwt';
import { getTenantId } from './tenant-context';
import { buildPermissionsForUser } from '../core/tenant/services/admin/users/rbac.service';

// Helpers de autorización reutilizables (antes duplicados en cada controller).
// permissions = Record<actionCode, subActionCode[]>. El rol_admin siempre pasa.

// ── Versión token (síncrona) ────────────────────────────────────────────────
// Lee los permisos que vienen "horneados" en el JWT. Rápida, pero NO refleja
// cambios de rol/permisos hasta que el usuario renueva su token (re-login).

export function hasPermission(c: Context, subActionCode: string): boolean {
  const payload = c.get('jwtPayload') as JwtPayload | undefined;
  if (!payload) return false;
  if (payload.role === 'rol_admin') return true;
  const [actionCode] = subActionCode.split('.');
  return payload.permissions?.[actionCode]?.includes(subActionCode) ?? false;
}

export function getCurrentUserId(c: Context): number | undefined {
  return (c.get('jwtPayload') as JwtPayload | undefined)?.userId;
}

// ── Versión "en vivo" con caché (asíncrona) ──────────────────────────────────
// Resuelve rol y permisos frescos desde la BD (buildPermissionsForUser), pero
// cachea el resultado ~90s por (tenant, usuario) para no pegar a la BD en cada
// request. Así un cambio de permisos aplica solo dentro de 1–2 min sin re-login.

const PERM_CACHE_TTL_MS = 90_000; // 1.5 min

interface CachedPerms {
  roleCode: string | null;
  permissions: PermissionsMap;
  expiresAt: number;
}

const permCache = new Map<string, CachedPerms>();

async function getLivePerms(userId: number): Promise<CachedPerms> {
  const key = `${getTenantId()}:${userId}`;
  const now = Date.now();
  const cached = permCache.get(key);
  if (cached && cached.expiresAt > now) return cached;

  const { roleCode, permissions } = await buildPermissionsForUser(userId);
  const fresh: CachedPerms = { roleCode, permissions, expiresAt: now + PERM_CACHE_TTL_MS };
  permCache.set(key, fresh);

  // Limpieza oportunista de entradas vencidas para no crecer sin límite.
  if (permCache.size > 500) {
    for (const [k, v] of permCache) if (v.expiresAt <= now) permCache.delete(k);
  }
  return fresh;
}

// Igual que hasPermission pero contra los permisos vigentes en BD (cacheados).
export async function hasPermissionLive(c: Context, subActionCode: string): Promise<boolean> {
  const userId = getCurrentUserId(c);
  if (!userId) return false;
  const { roleCode, permissions } = await getLivePerms(userId);
  if (roleCode === 'rol_admin') return true;
  const [actionCode] = subActionCode.split('.');
  return permissions[actionCode]?.includes(subActionCode) ?? false;
}

// Invalida la caché de un usuario (llamar tras cambiarle rol/permisos para que
// el cambio aplique al instante en vez de esperar el TTL).
export function invalidateUserPermissions(tenantId: number, userId: number): void {
  permCache.delete(`${tenantId}:${userId}`);
}
