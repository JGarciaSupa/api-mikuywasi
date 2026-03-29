import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { login, refreshAccessToken, logout, getProfile, AuthError } from '../../services/admin/auth.service';

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────
function getPlatform(c: Context): 'web' | 'mobile' {
  const platform = c.req.header('x-platform');
  return platform === 'mobile' ? 'mobile' : 'web';
}

function setRefreshTokenCookie(c: Context, refreshToken: string) {
  setCookie(c, 'refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'None',
    path: '/api/admin',
    maxAge: 15 * 24 * 60 * 60
  });
}

function clearRefreshTokenCookie(c: Context) {
  deleteCookie(c, 'refreshToken', {
    path: '/api/admin'
  });
}

// ────────────────────────────────────────────
// LOGIN
// ────────────────────────────────────────────
export async function loginController(c: Context) {
  try {
    const { email, password } = c.req.valid('json' as never);
    const platform = getPlatform(c);
    const userAgent = c.req.header('user-agent');
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '';

    const result = await login(email, password, userAgent, ipAddress);

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

    const userAgent = c.req.header('user-agent');
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '';

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
