import type { DeployTaskContext } from '../deploy/types';
import { forEachTenant } from '../deploy/tenants';
import { branches } from '../db/tenant/schema';
import { ensureDefaultReasons } from '../core/tenant/services/shared/tenant-defaults.service';

// Motivos estándar de "cambio de forma de pago" (12/11/2026): las sucursales nuevas ya los traen
// (DEFAULT_REASONS); a las existentes se les añaden solo si no tienen ningún motivo de ese tipo.
// Solo toca el tipo payment_change: no recrea motivos de anulación que un restaurante haya borrado.
// Idempotente: si se corre otra vez, la sucursal ya tiene motivos de ese tipo y no se inserta nada.
export default async function run({ log }: DeployTaskContext) {
  let total = 0;
  await forEachTenant(async (db) => {
    for (const branch of await db.select({ id: branches.id }).from(branches)) {
      total += await ensureDefaultReasons(db, branch.id, ['payment_change']);
    }
  }, log);
  log(`Motivos de cambio de forma de pago creados: ${total}`);
}
