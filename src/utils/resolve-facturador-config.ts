import { eq } from 'drizzle-orm';
import { branches } from '../db/tenant/schema';
import type { TenantDb } from './tenant-context';

export interface FacturadorConfig {
  empresaId: number;
  ruc: string;
  // Anexo/código de establecimiento SUNAT de la sucursal (4 dígitos). Null = la
  // sucursal no tiene anexo propio configurado; el facturador usa '0000' por defecto.
  anexo: string | null;
}

/**
 * Resuelve qué empresa del facturador usar para una sucursal dada.
 * Cada sucursal debe tener configurada su propia empresa (branches.facturadorEmpresaId + branches.fiscalId).
 * Lanza un error 422 si la sucursal no tiene la configuración completa.
 */
export async function resolveFacturadorConfig(
  db: TenantDb,
  branchId: number,
): Promise<FacturadorConfig> {
  const [branch] = await db
    .select({
      facturadorEmpresaId: branches.facturadorEmpresaId,
      fiscalId: branches.fiscalId,
      sunatAnexo: branches.sunatAnexo,
    })
    .from(branches)
    .where(eq(branches.id, branchId));

  if (branch?.facturadorEmpresaId && branch?.fiscalId) {
    return { empresaId: branch.facturadorEmpresaId, ruc: branch.fiscalId, anexo: branch.sunatAnexo ?? null };
  }

  const detail = branch?.facturadorEmpresaId
    ? 'La sucursal tiene empresaId pero le falta el RUC fiscal (fiscalId).'
    : 'Configure una empresa de facturación en la sucursal.';

  const err = new Error(`Facturación electrónica no configurada para sucursal ${branchId}. ${detail}`);
  (err as any).status = 422;
  throw err;
}
