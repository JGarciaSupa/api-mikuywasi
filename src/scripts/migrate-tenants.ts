import 'dotenv/config';
import { masterDb } from '../db';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as tenantSchema from '../db/tenant/schema';
import * as path from 'path';

async function execute() {
  console.log('\n🚀 [Tenant Migrator] Iniciando ejecución de migraciones en todos los tenants...\n');

  try {
    // 1. Obtener todos los tenants registrados con sus respectivos servidores
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

      console.log(`\n⏳ [ID: ${tenant.id}] Procesando tenant: "${tenant.name}" (Slug: ${tenant.slug})`);
      console.log(`   Servidor: ${server.name} (${server.dbHost}:${server.dbPort})`);
      console.log(`   Base de datos: ${dbName}`);

      const connectionString = `postgres://${encodeURIComponent(server.dbUser)}:${encodeURIComponent(server.dbPassword)}@${server.dbHost}:${server.dbPort}/${dbName}`;
      
      const tempPool = new Pool({
        connectionString,
        max: 1,
      });

      const tempDb = drizzle(tempPool, { schema: tenantSchema });

      try {
        const migrationsPath = path.resolve(process.cwd(), 'drizzle/tenant');
        await migrate(tempDb, {
          migrationsFolder: migrationsPath,
        });
        console.log(`   ✅ Migraciones ejecutadas con éxito en "${dbName}".`);
        successCount++;
      } catch (error: any) {
        console.error(`   ❌ Fallo al ejecutar migraciones en "${dbName}":`, error.message || error);
        failureCount++;
      } finally {
        await tempPool.end();
      }
    }

    console.log('\n==================================================');
    console.log('📊 RESUMEN DE MIGRACIONES:');
    console.log(`   ✅ Completadas con éxito: ${successCount}`);
    console.log(`   ❌ Fallidas:               ${failureCount}`);
    console.log(`   📋 Total procesados:       ${allTenants.length}`);
    console.log('==================================================\n');

    if (failureCount > 0) {
      console.log('⚠️ El script terminó con algunos fallos. Revisa los logs anteriores.');
      process.exit(1);
    } else {
      console.log('🎉 ¡Todas las migraciones se completaron de forma excelente!');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('💥 Error crítico en el orquestador de migraciones:', error.message || error);
    process.exit(1);
  }
}

execute();
