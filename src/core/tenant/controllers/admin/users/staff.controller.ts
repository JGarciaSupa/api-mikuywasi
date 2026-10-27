import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import * as staffService from '../../../services/admin/users/staff.service';
import type { CreateStaffInput, StaffQueryInput, UpdateStaffInput } from '../../../validations/admin/users/staff.validation';

export const getStaffListController = async (c: Context) => {
  try {
    const { userId } = c.get('jwtPayload');
    const query = c.req.valid('query' as never) as StaffQueryInput;
    const result = await staffService.getStaffList(userId, query);
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener los usuarios') }, 500);
  }
};

export const createStaffController = async (c: Context) => {
  try {
    const body = await c.req.parseBody();
    const imageFile = body['image'] as File | undefined;
    const data = c.req.valid('form' as never) as CreateStaffInput;
    const result = await staffService.createStaff(data, imageFile, { roleCode: c.get('jwtPayload')?.role ?? null });
    const reactivated = (result as { reactivated?: boolean }).reactivated;
    return c.json({
      success: true,
      message: reactivated
        ? 'Este usuario había sido eliminado y fue reactivado con los nuevos datos'
        : 'Usuario creado con éxito',
      reactivated: !!reactivated,
      data: result,
    }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al crear el usuario') }, 400);
  }
};

export const updateStaffController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') ?? '');
    if (isNaN(id)) return c.json({ success: false, message: 'ID de usuario inválido' }, 400);
    const body = await c.req.parseBody();
    const imageFile = body['image'] as File | undefined;
    const data = c.req.valid('form' as never) as UpdateStaffInput;
    const result = await staffService.updateStaff(id, data, imageFile, { roleCode: c.get('jwtPayload')?.role ?? null });
    return c.json({ success: true, message: 'Usuario actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar el usuario') }, 400);
  }
};

export const deleteStaffController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') ?? '');
    if (isNaN(id)) return c.json({ success: false, message: 'ID de usuario inválido' }, 400);
    const { userId } = c.get('jwtPayload');
    if (id === userId) {
      return c.json({ success: false, message: 'No puedes eliminar tu propio usuario' }, 400);
    }
    const result = await staffService.deleteStaff(id, { roleCode: c.get('jwtPayload')?.role ?? null });
    return c.json({ success: true, message: 'Usuario eliminado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al eliminar el usuario') }, 400);
  }
};
