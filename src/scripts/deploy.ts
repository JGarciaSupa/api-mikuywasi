import { flag, runDeploy } from '../deploy/runner';

// Arranque del contenedor (docker/start.sh): ejecuta los pasos de despliegue habilitados
// (ver src/deploy/runner.ts). Sale con código 1 solo si MIGRATIONS_STRICT=true y fallan las
// migraciones (la API no arranca); en cualquier otro caso la API arranca y /health lo informa.

async function main() {
  const status = await runDeploy({ trigger: 'startup' });
  const migrationsFailed = status.steps.some((s) => s.name.endsWith('migrations') && s.status === 'failed');
  if (migrationsFailed && flag('MIGRATIONS_STRICT', false)) {
    console.error('[deploy] ❌ Fallaron migraciones y MIGRATIONS_STRICT=true: la API no arranca.');
    process.exit(1);
  }
  process.exit(0);
}

main();
