import 'dotenv/config';
import * as path from 'path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

// Aplica las migraciones pendientes de la BD master (drizzle/master). Lleva el registro en
// drizzle.__drizzle_migrations, el mismo que usa `drizzle-kit migrate`: solo corre lo pendiente.
// Todo va en una transacción: si una falla, no queda nada a medias.

async function execute() {
  console.log('\n🏛️ [Master Migrator] Aplicando migraciones pendientes de la BD master...');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const countApplied = async () => {
      const { rows } = await pool.query(`SELECT to_regclass('drizzle.__drizzle_migrations') AS t`);
      if (!rows[0]?.t) return 0;
      return (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0].n;
    };
    const applied = await countApplied();

    await migrate(drizzle(pool), { migrationsFolder: path.resolve(process.cwd(), 'drizzle/master') });

    const now = await countApplied();
    console.log(`✅ Master al día: ${now} migraciones (${now - applied} nuevas).`);
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Falló la migración de la BD master (se revirtió):', error?.message || error);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

execute();
