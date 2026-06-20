import 'dotenv/config';
import { masterDb } from '../db';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as tenantSchema from '../db/tenant/schema';

async function execute() {
  console.log('\n🧹 [Clear Sessions] Iniciando limpieza de sesiones (refreshTokens) en todos los tenants...\n');

  try {
    const allTenants = await masterDb.query.tenants.findMany({
      with: {
        server: true,
      },
    });

    if (allTenants.length === 0) {
      console.log('ℹ️ No se encontraron tenants registrados en la base de datos maestra.');
      process.exit(0);
    }

    console.log(`📊 Se encontraron ${allTenants.length} tenants para procesar.`);
    console.log('--------------------------------------------------');

    let successCount = 0;
    let failureCount = 0;

    for (const tenant of allTenants) {
      const server = tenant.server;
      const dbName = tenant.dbName;

      const dbHost = process.env.DB_HOST_OVERRIDE || server.dbHost;
      console.log(`\n⏳ [ID: ${tenant.id}] Procesando tenant: "${tenant.name}"`);

      const connectionString = `postgres://${encodeURIComponent(server.dbUser)}:${encodeURIComponent(server.dbPassword)}@${dbHost}:${server.dbPort}/${dbName}`;

      const tempPool = new Pool({
        connectionString,
        max: 1,
      });

      const tempDb = drizzle(tempPool, { schema: tenantSchema });

      try {
        await tempDb.delete(tenantSchema.refreshTokens);
        console.log(`   ✅ Sesiones eliminadas con éxito en "${dbName}".`);
        successCount++;
      } catch (error: any) {
        console.error(`   ❌ Fallo al limpiar sesiones en "${dbName}":`, error);
        failureCount++;
      } finally {
        await tempPool.end();
      }
    }

    console.log('\n==================================================');
    console.log('📊 RESUMEN DE LIMPIEZA:');
    console.log(`   ✅ Tenants limpiados con éxito: ${successCount}`);
    console.log(`   ❌ Fallos:                      ${failureCount}`);
    console.log('==================================================\n');

    if (failureCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error: any) {
    console.error('💥 Error crítico en el limpiador de sesiones:', error.message || error);
    process.exit(1);
  }
}

execute();
