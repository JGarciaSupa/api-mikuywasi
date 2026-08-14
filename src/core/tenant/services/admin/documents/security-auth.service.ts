import { and, or, eq, sql } from 'drizzle-orm';
import { users, userRoles, roles } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';

// Valida una contraseña de AUTORIZACIÓN: confirma que exista un usuario ACTIVO cuyo login
// coincida con `password` y que tenga el permiso `subActionCode` (o sea rol_admin, que
// bypassa). Sirve para que un cajero (sin el permiso) autorice una acción sensible con la
// contraseña de un admin. Devuelve el userId autorizador, o null si nadie coincide.
export async function authorizeByPassword(
  subActionCode: string,
  password: string,
): Promise<{ userId: number } | null> {
  const db = getTenantDb();

  // Candidatos: usuarios activos (rol activo) que tengan el permiso vía rol o grant (menos
  // deny), MÁS los admins (bypassan permisos). Se filtra por permiso primero para no verificar
  // bcrypt sobre todos los usuarios.
  const hasViaRole = sql`EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions_catalog pc ON pc.id = rp.perm_catalog_id WHERE rp.role_id = ${roles.id} AND pc.sub_action_code = ${subActionCode})`;
  const hasViaGrant = sql`EXISTS (SELECT 1 FROM user_permission_overrides upo JOIN permissions_catalog pc ON pc.id = upo.perm_catalog_id WHERE upo.user_id = ${users.id} AND upo.type = 'grant' AND pc.sub_action_code = ${subActionCode})`;
  const hasDeny = sql`EXISTS (SELECT 1 FROM user_permission_overrides upo JOIN permissions_catalog pc ON pc.id = upo.perm_catalog_id WHERE upo.user_id = ${users.id} AND upo.type = 'deny' AND pc.sub_action_code = ${subActionCode})`;

  const candidates = await db
    .selectDistinct({ id: users.id, password: users.password })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.isActive, true)))
    .where(
      or(
        eq(roles.code, 'rol_admin'),
        and(or(hasViaRole, hasViaGrant), sql`NOT (${hasDeny})`),
      ),
    );

  // No hay ningún usuario que pueda autorizar esta acción: el permiso del módulo Seguridad
  // no está otorgado a ningún rol/usuario y no hay administradores. Ninguna contraseña
  // podría funcionar; se distingue de "contraseña incorrecta" para no confundir al operador.
  if (candidates.length === 0) {
    throw new Error(
      'No hay ningún usuario autorizado para esta acción. Otorga el permiso del módulo "Seguridad" a un rol (o usa la contraseña de un administrador).',
    );
  }

  const pwd = (password ?? '').trim();
  if (!pwd) return null;

  for (const u of candidates) {
    // Usuarios sin contraseña bcrypt (nula/vacía) no pueden autorizar; se omiten sin romper.
    if (!u.password) continue;
    let ok = false;
    try {
      ok = await Bun.password.verify(pwd, u.password, 'bcrypt');
    } catch {
      ok = false;
    }
    if (ok) return { userId: u.id };
  }
  return null;
}
