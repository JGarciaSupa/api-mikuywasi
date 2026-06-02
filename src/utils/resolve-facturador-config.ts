import { eq } from 'drizzle-orm';
import { branches, tenantConfigs } from '../db/tenant/schema';
import type { TenantDb } from './tenant-context';

export interface FacturadorConfig {
  empresaId: number;
  ruc: string;
}

/**
 * Resuelve qué empresa del facturador usar para una sucursal dada.
 *
 * Prioridad:
 *   1. Empresa propia de la sucursal (Caso B): branches.facturadorEmpresaId + branches.fiscalId
 *   2. Empresa del tenant (Caso A / fallback): tenantConfigs.facturadorEmpresaId + tenantConfigs.facturadorRuc
 *
 * Lanza un error 422 si ninguna configuración está completa.
 */
export async function resolveFacturadorConfig(
  db: TenantDb,
  branchId: number,
): Promise<FacturadorConfig> {
  const [branch] = await db
    .select({
      facturadorEmpresaId: branches.facturadorEmpresaId,
      fiscalId: branches.fiscalId,
    })
    .from(branches)
    .where(eq(branches.id, branchId));

  if (branch?.facturadorEmpresaId && branch?.fiscalId) {
    return { empresaId: branch.facturadorEmpresaId, ruc: branch.fiscalId };
  }

  const [config] = await db
    .select({
      facturadorEmpresaId: tenantConfigs.facturadorEmpresaId,
      facturadorRuc: tenantConfigs.facturadorRuc,
    })
    .from(tenantConfigs);

  if (config?.facturadorEmpresaId && config?.facturadorRuc) {
    return { empresaId: config.facturadorEmpresaId, ruc: config.facturadorRuc };
  }

  const detail = branch?.facturadorEmpresaId
    ? 'La sucursal tiene empresaId pero le falta el RUC fiscal (fiscalId).'
    : 'Configure una empresa de facturación en la sucursal o en la configuración general del tenant.';

  const err = new Error(`Facturación electrónica no configurada para sucursal ${branchId}. ${detail}`);
  (err as any).status = 422;
  throw err;
}
