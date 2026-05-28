import { redis } from '../utils/redis';

async function main() {
  console.log('🧹 Buscando y limpiando claves de tenant en Redis...');
  const keys = await redis.keys('tenant:*');
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log(`✅ Claves eliminadas con éxito: ${keys.join(', ')}`);
  } else {
    console.log('ℹ️ No se encontraron claves de "tenant:*" en Redis.');
  }
  process.exit(0);
}

main().catch(err => {
  console.error('💥 Error al limpiar caché de Redis:', err);
  process.exit(1);
});
