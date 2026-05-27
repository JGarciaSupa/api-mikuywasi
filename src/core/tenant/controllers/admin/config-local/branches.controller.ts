import type { Context } from 'hono';
import {
  getAllBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
  getMyBranches,
} from '../../../services/admin/config-local/branches.service';

/**
 * Listar todas las sucursales del tenant
 */
export const getAllBranchesController = async (c: Context) => {
  try {
    const results = await getAllBranches();
    return c.json({ success: true, data: results });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener las sucursales'
    }, 500);
  }
};

/**
 * Obtener sucursal por ID
 */
export const getBranchByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '');
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de sucursal inválido' }, 400);
    }

    const branch = await getBranchById(id);
    if (!branch) {
      return c.json({ success: false, message: 'Sucursal no encontrada' }, 404);
    }

    return c.json({ success: true, data: branch });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener la sucursal'
    }, 500);
  }
};

/**
 * Crear nueva sucursal
 */
export const createBranchController = async (c: Context) => {
  try {
    const body = c.req.valid('json' as never);
    const result = await createBranch(body);

    return c.json({
      success: true,
      message: 'Sucursal creada con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear la sucursal'
    }, 400);
  }
};

/**
 * Actualizar sucursal
 */
export const updateBranchController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '');
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de sucursal inválido' }, 400);
    }

    const body = c.req.valid('json' as never);
    const result = await updateBranch(id, body);

    if (!result) {
      return c.json({ success: false, message: 'Sucursal no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Sucursal actualizada con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar la sucursal'
    }, 400);
  }
};

/**
 * Eliminar sucursal
 */
export const deleteBranchController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '');
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de sucursal inválido' }, 400);
    }

    const result = await deleteBranch(id);
    if (!result) {
      return c.json({ success: false, message: 'Sucursal no encontrada' }, 404);
    }

    return c.json({
      success: true,
      message: 'Sucursal eliminada con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar la sucursal'
    }, 400);
  }
};

/**
 * Obtener sucursales asignadas al usuario logueado
 */
export const getMyBranchesController = async (c: Context) => {
  try {
    const { userId } = c.get('jwtPayload');
    const results = await getMyBranches(userId);
    return c.json({ success: true, data: results });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener tus sucursales'
    }, 500);
  }
};
