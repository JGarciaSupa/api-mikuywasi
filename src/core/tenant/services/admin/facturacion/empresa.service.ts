import { eq } from 'drizzle-orm';
import { branches, tenantConfigs } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import {
  crearEmpresa,
  actualizarEmpresa,
  obtenerEmpresa,
  type FacturadorEmpresaInput,
} from '../../../../../utils/facturador-client';

function isDuplicateRucError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /23000|duplicate key|duplicate entry/i.test(msg);
}

// ── Tenant-level empresa (Caso A) ─────────────────────────────────────────────

export async function getTenantEmpresa() {
  const db = getTenantDb();
  const [config] = await db
    .select({
      facturadorEmpresaId: tenantConfigs.facturadorEmpresaId,
      facturadorRuc: tenantConfigs.facturadorRuc,
    })
    .from(tenantConfigs);

  if (!config?.facturadorEmpresaId) {
    return null;
  }

  const empresa = await obtenerEmpresa(config.facturadorEmpresaId);
  return { ...empresa, facturadorEmpresaId: config.facturadorEmpresaId };
}

export async function upsertTenantEmpresa(data: FacturadorEmpresaInput) {
  const db = getTenantDb();
  const [config] = await db
    .select({ facturadorEmpresaId: tenantConfigs.facturadorEmpresaId })
    .from(tenantConfigs);

  let empresaId = config?.facturadorEmpresaId ?? null;

  if (empresaId) {
    await actualizarEmpresa(empresaId, data);
  } else {
    try {
      const created = await crearEmpresa(data);
      empresaId = created.id;
    } catch (err: any) {
      if (isDuplicateRucError(err)) {
        throw new Error(`El RUC ${data.ruc} ya está registrado en el sistema de facturación. Si eliminaste la empresa anteriormente, contacta a soporte para reconectar el registro existente.`);
      }
      throw err;
    }
  }

  await db
    .update(tenantConfigs)
    .set({ facturadorEmpresaId: empresaId, facturadorRuc: data.ruc, updatedAt: new Date() });

  return obtenerEmpresa(empresaId);
}

// ── Branch-level empresa (Caso B) ─────────────────────────────────────────────

export async function getBranchEmpresa(branchId: number) {
  const db = getTenantDb();
  const [branch] = await db
    .select({ facturadorEmpresaId: branches.facturadorEmpresaId })
    .from(branches)
    .where(eq(branches.id, branchId));

  if (!branch) throw new Error('Sucursal no encontrada');
  if (!branch.facturadorEmpresaId) return null;

  return obtenerEmpresa(branch.facturadorEmpresaId);
}

export async function upsertBranchEmpresa(branchId: number, data: FacturadorEmpresaInput) {
  const db = getTenantDb();
  const [branch] = await db
    .select({ facturadorEmpresaId: branches.facturadorEmpresaId })
    .from(branches)
    .where(eq(branches.id, branchId));

  if (!branch) throw new Error('Sucursal no encontrada');

  let empresaId = branch.facturadorEmpresaId ?? null;

  if (empresaId) {
    await actualizarEmpresa(empresaId, data);
  } else {
    try {
      const created = await crearEmpresa(data);
      empresaId = created.id;
    } catch (err: any) {
      if (isDuplicateRucError(err)) {
        throw new Error(`El RUC ${data.ruc} ya está registrado en el sistema de facturación. Si eliminaste la empresa anteriormente, contacta a soporte para reconectar el registro existente.`);
      }
      throw err;
    }
  }

  await db
    .update(branches)
    .set({ facturadorEmpresaId: empresaId, fiscalId: data.ruc, fiscalName: data.razon_social ?? null, updatedAt: new Date() })
    .where(eq(branches.id, branchId));

  return obtenerEmpresa(empresaId);
}

/**
 * Reutiliza la empresa de otra sucursal: establece el mismo facturadorEmpresaId
 * en la sucursal destino. Ambas sucursales comparten las mismas credenciales SUNAT.
 */
export async function reuseBranchEmpresa(branchId: number, sourceBranchId: number) {
  const db = getTenantDb();

  if (branchId === sourceBranchId) {
    throw new Error('La sucursal origen y destino no pueden ser la misma');
  }

  const [source] = await db
    .select({ facturadorEmpresaId: branches.facturadorEmpresaId, name: branches.name })
    .from(branches)
    .where(eq(branches.id, sourceBranchId));

  if (!source) throw new Error('Sucursal origen no encontrada');
  if (!source.facturadorEmpresaId) {
    throw new Error(`La sucursal "${source.name}" no tiene empresa de facturación configurada`);
  }

  await db
    .update(branches)
    .set({ facturadorEmpresaId: source.facturadorEmpresaId, updatedAt: new Date() })
    .where(eq(branches.id, branchId));
}

export async function deleteBranchEmpresa(branchId: number) {
  const db = getTenantDb();
  const [branch] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.id, branchId));

  if (!branch) throw new Error('Sucursal no encontrada');

  await db
    .update(branches)
    .set({ facturadorEmpresaId: null, updatedAt: new Date() })
    .where(eq(branches.id, branchId));
}
