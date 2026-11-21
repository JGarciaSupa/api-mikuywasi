import 'dotenv/config';
import { syncMissingRbac } from '../core/master/services/rbac-add-missing.service';

// RBAC solo aditivo.
//   bun run rbac:add-missing                       → simulación, no escribe
//   bun run rbac:add-missing --apply               → aplica
//   bun run rbac:add-missing --apply --revoke-mozo-caja
//       además quita a rol_mozo los permisos de caja del seed

const APPLY = process.argv.includes('--apply');
const REVOKE_MOZO_CAJA = process.argv.includes('--revoke-mozo-caja');

async function run() {
  console.log(`\n🔐 [RBAC aditivo] ${APPLY ? 'APLICANDO cambios' : 'SIMULACIÓN (sin escribir; usa --apply para aplicar)'}\n`);
  try {
    const report = await syncMissingRbac({ apply: APPLY, revokeMozoCaja: REVOKE_MOZO_CAJA });
    console.log(`Master — sub-acciones nuevas (${report.missingPermissions.length}): ${report.missingPermissions.map((p) => p.code).join(', ') || 'ninguna'}`);
    console.log(`Master — roles base nuevos (${report.missingRoles.length}): ${report.missingRoles.map((r) => r.code).join(', ') || 'ninguno'}`);
    for (const tenant of report.tenants) {
      console.log(`\n• ${tenant.name} (${tenant.dbName})`);
      console.log(tenant.changes.length > 0 ? tenant.changes.map((l) => `   ${l}`).join('\n') : '   sin cambios');
    }
    console.log(`\n✅ ${APPLY ? 'Aplicado. Los usuarios deben volver a iniciar sesión.' : 'Simulación terminada.'}\n`);
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ [RBAC aditivo] Error:', error?.message || error);
    process.exit(1);
  }
}

run();
