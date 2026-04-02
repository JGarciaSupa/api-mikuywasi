import type { Context } from 'hono';
import * as staffService from '../../services/admin/staff.service';
import type { CreateStaffInput, UpdateStaffInput } from '../../validations/admin/staff.validation';

/**
 * GET /admin/staff
 * Obtener lista de usuarios (paginado y filtrado)
 */
export const getStaffListController = async (c: Context) => {
  try {
    const payload = c.get('jwtPayload');
    const userId = payload.userId;
    const tenantId = payload.tenantId;
    const query = c.req.valid('query' as never);

    const result = await staffService.getStaffList(tenantId!, userId, query);

    return c.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener los usuarios'
    }, 500);
  }
};

/**
 * POST /admin/staff
 * Crear nuevo usuario
 */
export const createStaffController = async (c: Context) => {
  try {
    const { tenantId } = c.get('jwtPayload');
    const body = await c.req.parseBody();
    const imageFile = body['image'] as File | undefined;
    const data = c.req.valid('form' as never) as CreateStaffInput;

    const result = await staffService.createStaff(tenantId!, data, imageFile);

    return c.json({
      success: true,
      message: 'Usuario creado con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear el usuario'
    }, 400);
  }
};

/**
 * PATCH /admin/staff/:id
 * Editar usuario (incluyendo password y foto)
 */
export const updateStaffController = async (c: Context) => {
  try {
    const { tenantId } = c.get('jwtPayload');
    const idParam = c.req.param('id');
    if (!idParam) throw new Error('ID requerido');
    const id = parseInt(idParam);
    const body = await c.req.parseBody();
    const imageFile = body['image'] as File | undefined;
    const data = c.req.valid('form' as never) as UpdateStaffInput;

    const result = await staffService.updateStaff(id, tenantId!, data, imageFile);

    return c.json({
      success: true,
      message: 'Usuario actualizado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el usuario'
    }, 400);
  }
};

/**
 * DELETE /admin/staff/:id
 * Eliminar usuario (y su foto de R2)
 */
export const deleteStaffController = async (c: Context) => {
  try {
    const { tenantId } = c.get('jwtPayload');
    const idParam = c.req.param('id');
    if (!idParam) throw new Error('ID requerido');
    const id = parseInt(idParam);

    await staffService.deleteStaff(id, tenantId!);

    return c.json({
      success: true,
      message: 'Usuario eliminado con éxito'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar el usuario'
    }, 400);
  }
};
