import type { DeployTaskContext } from '../deploy/types';
import { forEachTenant } from '../deploy/tenants';
import { branches } from '../db/tenant/schema';
import { ensureDefaultReasons } from '../core/tenant/services/shared/tenant-defaults.service';

// Categorías estándar de egresos e ingresos de caja (25/11/2026): las sucursales nuevas ya las traen
// (DEFAULT_REASONS); a las existentes se les añaden solo si no tienen ninguna de ese tipo.
// Idempotente: si se corre otra vez, la sucursal ya tiene categorías y no se inserta nada.
export default async function run({ log }: DeployTaskContext) {
  let total = 0;
  await forEachTenant(async (db) => {
    for (const branch of await db.select({ id: branches.id }).from(branches)) {
      total += await ensureDefaultReasons(db, branch.id, ['cash_expense', 'cash_income']);
    }
  }, log);
  log(`Categorías de movimientos de caja creadas: ${total}`);
}
