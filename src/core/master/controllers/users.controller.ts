import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import * as usersService from '../services/users.service';

export const loginController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const { accessToken, refreshToken, user } = await usersService.loginUser(data);

    // Establecer la cookie segura del refresh token
    const isSecure = c.req.url.startsWith('https://');
    setCookie(c, 'refresh_token', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'None' : 'Lax',
      maxAge: 7 * 24 * 60 * 60, // 7 días
      path: '/api/master/users',
    });

    return c.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        accessToken,
        user
      }
    });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al iniciar sesión', data: null }, 401);
  }
};

export const refreshController = async (c: Context) => {
  try {
    const refreshToken = getCookie(c, 'refresh_token');

    if (!refreshToken) {
      return c.json({ success: false, message: 'Refresh token no proporcionado', data: null }, 401);
    }

    const { accessToken, refreshToken: newRefreshToken, user } = await usersService.refreshSession(refreshToken);

    // Establecer la nueva cookie con rotación
    const isSecure = c.req.url.startsWith('https://');
    setCookie(c, 'refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'None' : 'Lax',
      maxAge: 7 * 24 * 60 * 60, // 7 días
      path: '/api/master/users',
    });

    return c.json({
      success: true,
      message: 'Token renovado con éxito',
      data: {
        accessToken,
        user
      }
    });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al renovar sesión', data: null }, 401);
  }
};

export const logoutController = async (c: Context) => {
  try {
    const refreshToken = getCookie(c, 'refresh_token');

    if (refreshToken) {
      await usersService.logoutSession(refreshToken);
    }

    // Limpiar la cookie del refresh token
    const isSecure = c.req.url.startsWith('https://');
    deleteCookie(c, 'refresh_token', {
      path: '/api/master/users',
      secure: isSecure,
      sameSite: isSecure ? 'None' : 'Lax',
    });

    return c.json({
      success: true,
      message: 'Sesión cerrada con éxito',
      data: null
    });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al cerrar sesión', data: null }, 500);
  }
};


export const getMeController = async (c: Context) => {
  try {
    const payload = c.get('jwtPayload' as never) as any;
    const result = await usersService.getUserById(payload.id);
    return c.json({ success: true, message: 'Perfil obtenido con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener el perfil', data: null }, 404);
  }
};

export const getAllUsersController = async (c: Context) => {
  try {
    const result = await usersService.getAllUsers();
    return c.json({ success: true, message: 'Usuarios obtenidos con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener usuarios', data: null }, 500);
  }
};

export const getUserByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await usersService.getUserById(id);
    return c.json({ success: true, message: 'Usuario obtenido con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Usuario no encontrado', data: null }, 404);
  }
};

export const createUserController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await usersService.createUser(data);
    return c.json({ success: true, message: 'Usuario creado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear el usuario', data: null }, 400);
  }
};

export const updateUserController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await usersService.updateUser(id, data);
    return c.json({ success: true, message: 'Usuario actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el usuario', data: null }, 400);
  }
};

export const updatePasswordController = async (c: Context) => {
  try {
    const payload = c.get('jwtPayload' as never) as any;
    const data = c.req.valid('json' as never);
    const result = await usersService.updatePassword(payload.id, data);
    return c.json({ success: true, message: result.message || 'Contraseña actualizada correctamente', data: null });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al cambiar la contraseña', data: null }, 400);
  }
};

export const deleteUserController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const payload = c.get('jwtPayload' as never) as any;
    if (payload.id === id) {
      return c.json({ success: false, message: 'No puedes eliminar tu propio usuario', data: null }, 400);
    }
    const result = await usersService.deleteUser(id);
    return c.json({ success: true, message: result.message || 'Usuario eliminado correctamente', data: null });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el usuario', data: null }, 400);
  }
};
