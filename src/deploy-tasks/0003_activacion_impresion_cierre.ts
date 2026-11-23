import type { DeployTaskContext } from '../deploy/types';
import { masterDb } from '../db';
import { activations } from '../db/master/schema';
import { sql } from 'drizzle-orm';

// Activación por caja "Impresión automática al cerrar el turno" (23/11/2026): con ella y la
// impresora de reportes de la caja, el cierre imprime arqueo, paloteo y anulaciones sin preguntar.
// El catálogo de activaciones vive en la BD master; seed-activations.ts no corre al desplegar.
// Idempotente: si ya existe el código, solo se actualizan nombre y descripción.
export default async function run({ log }: DeployTaskContext) {
  const data = {
    code: 'CLOSE_AUTO_PRINT_REPORTS',
    name: 'Impresión automática al cerrar el turno',
    description: 'Al imprimir el cierre, saca el arqueo, el paloteo de producción y las anulaciones en la impresora de reportes de la caja, sin preguntar.',
    module: 'impresion',
    category: 'Cierre de turno',
    defaultEnabled: false,
    order: 1,
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
