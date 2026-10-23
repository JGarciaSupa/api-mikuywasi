/**
 * Completa los datos estándar en tenants que ya existen (los nuevos los reciben al crearse):
 * método de pago Efectivo, motivos de eliminación/anulación por sucursal y series de
 * boleta, factura y cuenta interna en las cajas que no tienen ninguna, y los nombres
 * de impuestos que siguen con el valor por defecto antiguo ("Aplica Impuesto 1" → "IGV").
 *
 * Uso: bun run src/scripts/seed-tenant-defaults.ts <tenantId | all>
 *
 * Es IDEMPOTENTE: solo crea lo que falta y solo renombra impuestos que nadie editó;
 * no borra ni cambia nada de lo configurado por el restaurante.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { masterDb } from '../db';
import { tenants } from '../db/master/schema';
import * as s from '../db/tenant/schema';
import {
  ensureDefaultPaymentMethods,
  ensureDefaultReasons,
  ensureDefaultTaxLabels,
  ensureDefaultRegisterSeries,
} from '../core/tenant/services/shared/tenant-defaults.service';

const arg = process.argv[2];
if (!arg || (arg !== 'all' && isNaN(parseInt(arg)))) {
  console.error('❌ Uso: bun run src/scripts/seed-tenant-defaults.ts <tenantId | all>');
  process.exit(1);
}

async function seedTenant(tenantId: number) {
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    with: { server: true },
  });
  if (!tenant?.server) {
    console.error(`❌ Tenant ${tenantId}: no encontrado o sin servidor`);
    return;
  }

  const { server } = tenant;
  const dbHost = process.env.DB_HOST_OVERRIDE || server.dbHost;
  const connectionString = `postgres://${encodeURIComponent(server.dbUser)}:${encodeURIComponent(server.dbPassword)}@${dbHost}:${server.dbPort}/${tenant.dbName}`;
  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool, { schema: s });

  try {
    const methods = await ensureDefaultPaymentMethods(db);
    let reasonCount = 0;
    let labelCount = 0;
    for (const branch of await db.select({ id: s.branches.id }).from(s.branches)) {
      reasonCount += await ensureDefaultReasons(db, branch.id);
      labelCount += await ensureDefaultTaxLabels(db, branch.id);
    }
    let seriesCount = 0;
    for (const register of await db.select({ id: s.cashRegisters.id }).from(s.cashRegisters)) {
      seriesCount += await ensureDefaultRegisterSeries(db, register.id);
    }
    console.log(`✅ ${tenant.slug}: ${methods} método(s) de pago, ${reasonCount} motivo(s), ${seriesCount} serie(s), ${labelCount} nombre(s) de impuesto`);
  } catch (error) {
    console.error(`❌ ${tenant.slug}:`, error);
  } finally {
    await pool.end();
  }
}

async function main() {
  const ids = arg === 'all'
    ? (await masterDb.select({ id: tenants.id }).from(tenants)).map((t) => t.id)
    : [parseInt(arg)];
  for (const id of ids) await seedTenant(id);
  process.exit(0);
}

main();
