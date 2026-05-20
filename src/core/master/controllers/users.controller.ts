import type { Context } from 'hono';
import * as usersService from '../services/users.service';

export const loginController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await usersService.loginUser(data);
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al iniciar sesión' }, 401);
  }
};

export const getMeController = async (c: Context) => {
  try {
    const payload = c.get('jwtPayload' as never) as any;
    const result = await usersService.getUserById(payload.id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener el perfil' }, 404);
  }
};

export const getAllUsersController = async (c: Context) => {
  try {
    const result = await usersService.getAllUsers();
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener usuarios' }, 500);
  }
};

export const getUserByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await usersService.getUserById(id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Usuario no encontrado' }, 404);
  }
};

export const createUserController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await usersService.createUser(data);
    return c.json({ success: true, message: 'Usuario creado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear el usuario' }, 400);
  }
};

export const updateUserController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await usersService.updateUser(id, data);
    return c.json({ success: true, message: 'Usuario actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el usuario' }, 400);
  }
};

export const updatePasswordController = async (c: Context) => {
  try {
    const payload = c.get('jwtPayload' as never) as any;
    const data = c.req.valid('json' as never);
    const result = await usersService.updatePassword(payload.id, data);
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al cambiar la contraseña' }, 400);
  }
};

export const deleteUserController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const payload = c.get('jwtPayload' as never) as any;
    if (payload.id === id) {
      return c.json({ success: false, message: 'No puedes eliminar tu propio usuario' }, 400);
    }
    const result = await usersService.deleteUser(id);
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el usuario' }, 400);
  }
};
