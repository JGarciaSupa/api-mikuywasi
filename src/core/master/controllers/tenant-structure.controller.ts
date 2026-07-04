import type { Context } from 'hono';
import * as tenantStructureService from '../services/tenant-structure.service';

// ── ESTRUCTURA (MARCAS + SUCURSALES) ─────────────────────────────────────────

export const getTenantStructureController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const result = await tenantStructureService.getTenantStructure(tenantId);
    return c.json({ success: true, message: 'Estructura obtenida con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener la estructura', data: null }, 500);
  }
};

// ── MARCAS ───────────────────────────────────────────────────────────────────

export const createTenantBrandController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantStructureService.createTenantBrand(tenantId, data);
    return c.json({ success: true, message: 'Marca creada con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear la marca', data: null }, 400);
  }
};

export const updateTenantBrandController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const brandId = parseInt(c.req.param('brandId') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantStructureService.updateTenantBrand(tenantId, brandId, data);
    return c.json({ success: true, message: 'Marca actualizada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la marca', data: null }, 400);
  }
};

export const deleteTenantBrandController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const brandId = parseInt(c.req.param('brandId') || '0');
    const result = await tenantStructureService.deleteTenantBrand(tenantId, brandId);
    return c.json({ success: true, message: result.message, data: null });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar la marca', data: null }, 400);
  }
};

// ── SUCURSALES ───────────────────────────────────────────────────────────────

export const createTenantBranchController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantStructureService.createTenantBranch(tenantId, data);
    return c.json({ success: true, message: 'Sucursal creada con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear la sucursal', data: null }, 400);
  }
};

export const updateTenantBranchController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const branchId = parseInt(c.req.param('branchId') || '0');
    const data = c.req.valid('json' as never);
    const result = await tenantStructureService.updateTenantBranch(tenantId, branchId, data);
    return c.json({ success: true, message: 'Sucursal actualizada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la sucursal', data: null }, 400);
  }
};

export const deleteTenantBranchController = async (c: Context) => {
  try {
    const tenantId = parseInt(c.req.param('id') || '0');
    const branchId = parseInt(c.req.param('branchId') || '0');
    const result = await tenantStructureService.deleteTenantBranch(tenantId, branchId);
    return c.json({ success: true, message: result.message, data: null });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar la sucursal', data: null }, 400);
  }
};
