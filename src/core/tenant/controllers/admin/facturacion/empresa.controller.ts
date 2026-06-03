import type { Context } from 'hono';
import * as empresaService from '../../../services/admin/facturacion/empresa.service';

// ── Tenant-level (Caso A) ──────────────────────────────────────────────────────

export const getTenantEmpresaController = async (c: Context) => {
  try {
    const data = await empresaService.getTenantEmpresa();
    if (!data) return c.json({ success: true, data: null, message: 'Sin empresa configurada a nivel tenant' });
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener empresa' }, 500);
  }
};

export const upsertTenantEmpresaController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await empresaService.upsertTenantEmpresa(body);
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('no encontrad') ? 404 : 500;
    return c.json({ success: false, message: error.message || 'Error al guardar empresa' }, status as any);
  }
};

// ── Branch-level (Caso B) ──────────────────────────────────────────────────────

export const getBranchEmpresaController = async (c: Context) => {
  try {
    const branchId = Number(c.req.param('id'));
    const data = await empresaService.getBranchEmpresa(branchId);
    if (!data) return c.json({ success: true, data: null, message: 'La sucursal no tiene empresa propia configurada' });
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('no encontrad') ? 404 : 500;
    return c.json({ success: false, message: error.message || 'Error al obtener empresa de sucursal' }, status as any);
  }
};

export const upsertBranchEmpresaController = async (c: Context) => {
  try {
    const branchId = Number(c.req.param('id'));
    const body = await c.req.json();
    const data = await empresaService.upsertBranchEmpresa(branchId, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('no encontrad') ? 404 : 500;
    return c.json({ success: false, message: error.message || 'Error al guardar empresa de sucursal' }, status as any);
  }
};

export const reuseBranchEmpresaController = async (c: Context) => {
  try {
    const branchId = Number(c.req.param('id'));
    const { sourceBranchId } = await c.req.json();
    if (!sourceBranchId) return c.json({ success: false, message: 'sourceBranchId requerido' }, 400);
    await empresaService.reuseBranchEmpresa(branchId, Number(sourceBranchId));
    return c.json({ success: true, message: 'Empresa reutilizada correctamente' });
  } catch (error: any) {
    const status = error.message?.includes('no encontrada') ? 404
      : error.message?.includes('no tiene') || error.message?.includes('misma') ? 422 : 500;
    return c.json({ success: false, message: error.message || 'Error al reutilizar empresa' }, status as any);
  }
};

export const deleteBranchEmpresaController = async (c: Context) => {
  try {
    const branchId = Number(c.req.param('id'));
    await empresaService.deleteBranchEmpresa(branchId);
    return c.json({ success: true, message: 'Empresa de sucursal eliminada. La sucursal usará la empresa del tenant.' });
  } catch (error: any) {
    const status = error.message?.includes('no encontrad') ? 404 : 500;
    return c.json({ success: false, message: error.message || 'Error al eliminar empresa de sucursal' }, status as any);
  }
};
