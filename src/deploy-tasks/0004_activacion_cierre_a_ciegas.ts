import type { DeployTaskContext } from '../deploy/types';
import { masterDb } from '../db';
import { activations } from '../db/master/schema';
import { sql } from 'drizzle-orm';

// Activación por caja "Cierre a ciegas" (25/11/2026): encendida, el cajero escribe lo que contó por
// medio de pago sin ver lo que hay en el sistema; apagada, el cierre declara tal cual lo registrado.
// El catálogo de activaciones vive en la BD master; seed-activations.ts no corre al desplegar.
// Idempotente: si ya existe el código, solo se actualizan nombre y descripción.
export default async function run({ log }: DeployTaskContext) {
  const data = {
    code: 'CLOSE_BLIND_COUNT',
    name: 'Cierre a ciegas',
    description: 'Al cerrar el turno, el cajero escribe el efectivo y lo cobrado con cada tarjeta o medio de pago sin ver lo registrado en el sistema. Apagado: se declara tal cual lo registrado.',
    module: 'caja_chica',
    category: 'Cierre de turno',
    defaultEnabled: false,
    order: 2,
    isActive: true,
  };
  // El seed inserta ids fijos: se alinea la secuencia antes de insertar sin id
  await masterDb.execute(
    sql`SELECT setval(pg_get_serial_sequence('activations', 'id'), COALESCE((SELECT MAX(id) FROM activations), 0) + 1, false)`
  );
  await masterDb
    .insert(activations)
    .values(data)
    .onConflictDoUpdate({
      target: activations.code,
      set: { name: data.name, description: data.description, module: data.module, category: data.category },
    });
  log(`Activación ${data.code} registrada`);
}
