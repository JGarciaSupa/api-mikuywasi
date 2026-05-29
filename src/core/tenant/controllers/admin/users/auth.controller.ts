import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getClientIp } from '../../../../../utils/ip';
import { login, refreshAccessToken, logout, getProfile, updateProfile, updatePassword, AuthError } from '../../../services/admin/users/auth.service';
import redisApi from '@/redis/index';
import { getTenantDb } from '@/db';

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────
function getPlatform(c: Context): 'web' | 'mobile' {
  const platform = c.req.header('x-platform');
  return platform === 'mobile' ? 'mobile' : 'web';
}

function setRefreshTokenCookie(c: Context, refreshToken: string) {
  const isSecure = c.req.url.startsWith('https://');
  setCookie(c, 'refreshToken', refreshToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'None' : 'Lax',
    path: '/',
    maxAge: 15 * 24 * 60 * 60 // 15 días
  });
}

function clearRefreshTokenCookie(c: Context) {
  const isSecure = c.req.url.startsWith('https://');
  deleteCookie(c, 'refreshToken', { 
    path: '/',
    secure: isSecure,
    sameSite: isSecure ? 'None' : 'Lax'
  });
}

// ────────────────────────────────────────────
// LOGIN
// ────────────────────────────────────────────
export async function loginController(c: Context) {
  console.log("Login Controller");

  try {
    const { username, password } = c.req.valid('json' as never);

    const platform = getPlatform(c);
    const userAgent = c.req.header('user-agent') || '';
    const ipAddress = getClientIp(c);

    const result = await login(username, password, userAgent, ipAddress);

    if (platform === 'web') {
      setRefreshTokenCookie(c, result.refreshToken);
      return c.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user
        }
      });
    }

    return c.json({
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return c.json({
        success: false,
        message: error.message
      }, error.status as any);
    }
    console.error("Login Error:", error);
    return c.json({
      success: false,
      message: 'Error interno del servidor'
    }, 500);
  }
}

// ────────────────────────────────────────────
// REFRESH
// ────────────────────────────────────────────
export async function refreshController(c: Context) {
  try {
    const platform = getPlatform(c);
    let rawRefreshToken: string = '';

    if (platform === 'web') {
      const refreshToken = getCookie(c, 'refreshToken');
      rawRefreshToken = refreshToken || '';
    } else {
      const refreshToken = c.req.header('x-refresh-token');
      rawRefreshToken = refreshToken || '';
    }

    if (!rawRefreshToken) {
      return c.json({
        success: false,
        message: 'Refresh token no proporcionado'
      }, 401);
    }

    const userAgent = c.req.header('user-agent') || '';
    const ipAddress = getClientIp(c);

    const result = await refreshAccessToken(rawRefreshToken, userAgent, ipAddress);

    if (platform === 'web') {
      setRefreshTokenCookie(c, result.refreshToken);
      return c.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user
        }
      });
    }

    return c.json({
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user
      }
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return c.json({
        success: false,
        message: error.message
      }, error.status as any);
    }
    return c.json({
      success: false,
      message: 'Error interno del servidor'
    }, 500);
  }
}

// ────────────────────────────────────────────
// LOGOUT
// ────────────────────────────────────────────
export async function logoutController(c: Context) {
  try {
    const platform = getPlatform(c);
    let rawRefreshToken: string | undefined;

    if (platform === 'web') {
      rawRefreshToken = getCookie(c, 'refreshToken');
    } else {
      const body = await c.req.json().catch(() => ({}));
      rawRefreshToken = body.refreshToken;
    }

    if (rawRefreshToken) {
      await logout(rawRefreshToken);
    }

    if (platform === 'web') {
      clearRefreshTokenCookie(c);
    }

    return c.json({ success: true, message: 'Sesión cerrada exitosamente' });
  } catch {
    return c.json({ success: true, message: 'Sesión cerrada exitosamente' });
  }
}

// ────────────────────────────────────────────
// PROFILE
// ────────────────────────────────────────────
export async function profileController(c: Context) {
  try {
    const { userId } = c.get('jwtPayload');
    const user = await getProfile(userId);

    return c.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof AuthError) {
      return c.json({ success: false, message: error.message }, error.status as any);
    }
    return c.json({ success: false, message: 'Error interno del servidor' }, 500);
  }
}

// ────────────────────────────────────────────
// UPDATE PROFILE
// ────────────────────────────────────────────
export async function updateProfileController(c: Context) {
  try {
    const { userId } = c.get('jwtPayload');
    const body = await c.req.parseBody();
    const data = c.req.valid('form' as never) as { name: string };
    const imageFile = body['image'] as File | undefined;

    const user = await updateProfile(userId, { name: data.name }, imageFile);

    return c.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof AuthError) {
      return c.json({ success: false, message: error.message }, error.status as any);
    }
    console.error("Update Profile Error:", error);
    return c.json({ success: false, message: 'Error interno del servidor' }, 500);
  }
}

// ────────────────────────────────────────────
// UPDATE PASSWORD
// ────────────────────────────────────────────
export async function updatePasswordController(c: Context) {
  try {
    const { userId } = c.get('jwtPayload');
    const { currentPassword, newPassword } = c.req.valid('json' as never);

    const result = await updatePassword(userId, { currentPassword, newPassword });

    return c.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return c.json({ success: false, message: error.message }, error.status as any);
    }
    console.error("Update Password Error:", error);
    return c.json({ success: false, message: 'Error interno del servidor' }, 500);
  }
}
