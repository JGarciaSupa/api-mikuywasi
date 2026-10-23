/**
 * Agrega UNA sub-acción (permiso) nueva a todos los tenants sin tocar el resto del RBAC.
 * Alternativa quirúrgica a seed-master-rbac.ts, que al final re-otorga TODAS las
 * sub-acciones a TODOS los tenants (devolvería funciones revocadas desde el super admin).
 *
 * Uso:
 *   bun run src/scripts/grant-sub-action.ts <codigo> "<nombre>" "<descripcion>" <orden> [rol_base ...]
 * Ej.:
 *   bun run src/scripts/grant-sub-action.ts facturacion.pago_pendiente "Ventas con pago pendiente" "Marcar una venta como cliente no pagó y luego como cobrada" 7 rol_admin
 *
 * Pasos (todos idempotentes):
 *   1. Crea la sub-acción en master si no existe (la acción padre es el prefijo del código).
 *   2. La otorga a todos los tenants y sincroniza solo su catálogo de permisos.
 *   3. La agrega a los roles base indicados (por defecto rol_admin) en master y en cada
 *      tenant, sin reconstruir los permisos de ningún rol.
 * Los usuarios ven el permiso nuevo al recargar el panel (se recalcula en /profile).
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { masterDb } from '../db';
import { actions, baseRolePermissions, baseRoles, subActions, tenants } from '../db/master/schema';
import * as s from '../db/tenant/schema';
import { grantAndSyncToAllTenants } from '../core/master/services/rbac-sync.service';

const [code, name, description, orderArg, ...roleArgs] = process.argv.slice(2);
if (!code || !code.includes('.') || !name) {
  console.error('❌ Uso: bun run src/scripts/grant-sub-action.ts <codigo> "<nombre>" "<descripcion>" <orden> [rol_base ...]');
  process.exit(1);
}
const roleCodes = roleArgs.length > 0 ? roleArgs : ['rol_admin'];

async function main() {
  const actionCode = code.split('.')[0];
  const action = await masterDb.query.actions.findFirst({ where: eq(actions.code, actionCode) });
  if (!action) throw new Error(`No existe la acción "${actionCode}" en master`);

  // 1. Sub-acción
  let sub = await masterDb.query.subActions.findFirst({ where: eq(subActions.code, code) });
  if (!sub) {
    [sub] = await masterDb.insert(subActions).values({
      actionId: action.id,
      code,
      name,
      description: description || undefined,
      order: Number(orderArg) || 0,
    }).returning();
    console.log(`✅ Sub-acción creada: ${code} (id ${sub.id})`);
  } else {
    console.log(`ℹ️  La sub-acción ${code} ya existía (id ${sub.id})`);
  }

  // 2. Grant a todos los tenants + catálogo
  const granted = await grantAndSyncToAllTenants(sub.id);
  console.log(`✅ Otorgada a ${granted.granted} tenant(s); errores de sync: ${granted.errors}`);

  // 3. Roles base (master)
  const roles = await Promise.all(roleCodes.map((rc) => masterDb.query.baseRoles.findFirst({ where: eq(baseRoles.code, rc) })));
  for (const [i, role] of roles.entries()) {
    if (!role) { console.log(`⚠️  Rol base ${roleCodes[i]} no existe; se omite`); continue; }
    await masterDb.insert(baseRolePermissions).values({ baseRoleId: role.id, subActionId: sub.id }).onConflictDoNothing();
  }

  // 3b. Roles en cada tenant (solo agregar la fila; no se reconstruye nada)
  const allTenants = await masterDb.query.tenants.findMany({ with: { server: true } });
  for (const tenant of allTenants) {
    if (!tenant.server) { console.log(`⚠️  ${tenant.slug}: sin servidor`); continue; }
    const host = process.env.DB_HOST_OVERRIDE || tenant.server.dbHost;
    const pool = new Pool({
      connectionString: `postgres://${encodeURIComponent(tenant.server.dbUser)}:${encodeURIComponent(tenant.server.dbPassword)}@${host}:${tenant.server.dbPort}/${tenant.dbName}`,
      max: 1,
    });
    const db = drizzle(pool, { schema: s });
    try {
      const [catalog] = await db.select({ id: s.permissionsCatalog.id }).from(s.permissionsCatalog)
        .where(eq(s.permissionsCatalog.masterSubActionId, sub.id));
      if (!catalog) { console.log(`⚠️  ${tenant.slug}: el catálogo no tiene ${code}`); continue; }
      let added = 0;
      for (const rc of roleCodes) {
        const [localRole] = await db.select({ id: s.roles.id }).from(s.roles).where(and(eq(s.roles.code, rc), eq(s.roles.isCustom, false)));
        if (!localRole) continue;
        const rows = await db.insert(s.rolePermissions).values({ roleId: localRole.id, permCatalogId: catalog.id }).onConflictDoNothing().returning();
        added += rows.length;
      }
      console.log(`✅ ${tenant.slug}: ${added} rol(es) actualizados`);
    } catch (error) {
      console.error(`❌ ${tenant.slug}:`, error);
    } finally {
      await pool.end();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error('❌', error); process.exit(1); });
