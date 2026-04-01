import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import { validationHook } from '../../../validations/hook';
import { 
  createStaffSchema, 
  updateStaffSchema, 
  staffQuerySchema,
  CreateStaffInput,
  UpdateStaffInput
} from '../../../validations/admin/staff.validation';
import * as staffService from '../../../services/admin/staff.service';

const routes = new Hono();

// Solo el rol admin puede acceder a estas APIs
routes.use('*', authMiddleware, roleMiddleware(['admin']));

/**
 * GET /admin/staff
 * Obtener lista de usuarios (paginado y filtrado)
 */
routes.get('/', zValidator('query', staffQuerySchema, validationHook), async (c) => {
  try {
    const payload = c.get('jwtPayload');
    const userId = payload.userId;
    const tenantId = payload.tenantId;
    const query = c.req.valid('query');

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
});

/**
 * POST /admin/staff
 * Crear nuevo usuario
 */
routes.post('/', zValidator('form', createStaffSchema, validationHook), async (c) => {
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
});

/**
 * PATCH /admin/staff/:id
 * Editar usuario (incluyendo password y foto)
 */
routes.patch('/:id', zValidator('form', updateStaffSchema, validationHook), async (c) => {
  try {
    const { tenantId } = c.get('jwtPayload');
    const id = parseInt(c.req.param('id'));
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
});

/**
 * DELETE /admin/staff/:id
 * Eliminar usuario (y su foto de R2)
 */
routes.delete('/:id', async (c) => {
  try {
    const { tenantId } = c.get('jwtPayload');
    const id = parseInt(c.req.param('id'));

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
});

export default routes;
