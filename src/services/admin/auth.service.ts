import { eq, and, gt } from 'drizzle-orm';
import { createHash } from 'crypto';
import { db } from '../../db';
import { users, refreshTokens } from '../../db/schema';
import { generateAccessToken } from '../../utils/jwt';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ────────────────────────────────────────────
// LOGIN
// ────────────────────────────────────────────
export async function login(email: string, password: string, userAgent?: string, ipAddress?: string) {
  // 1. Buscar usuario
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    throw new AuthError('Credenciales inválidas', 401);
  }

  // 2. Verificar password
  const validPassword = await Bun.password.verify(password, user.password, 'bcrypt');
  if (!validPassword) {
    throw new AuthError('Credenciales inválidas', 401);
  }

  // 3. Generar access token
  const accessToken = await generateAccessToken({
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId,
  });

  // 4. Generar refresh token
  const rawRefreshToken = crypto.randomUUID();
  const tokenHash = hashToken(rawRefreshToken);

  const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 días

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash,
    userAgent: userAgent?.slice(0, 255),
    ipAddress: ipAddress?.slice(0, 100),
    expiresAt,
  });

  // 5. Retornar datos (sin password)
  const { password: _, ...safeUser } = user;

  return {
    success: true,
    accessToken,
    refreshToken: rawRefreshToken,
    user: safeUser
  }
}

// ────────────────────────────────────────────
// REFRESH
// ────────────────────────────────────────────
export async function refreshAccessToken(rawRefreshToken: string, userAgent?: string, ipAddress?: string) {
  // 1. Buscar el token por hash
  const tokenHash = hashToken(rawRefreshToken);

  const matchedToken = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      eq(refreshTokens.isRevoked, false),
      gt(refreshTokens.expiresAt, new Date()),
    ),
  });

  if (!matchedToken) {
    throw new AuthError('Refresh token inválido o expirado', 401);
  }

  // 3. Revocar el token viejo
  await db.update(refreshTokens)
    .set({ isRevoked: true })
    .where(eq(refreshTokens.id, matchedToken.id));

  // 4. Obtener usuario
  const user = await db.query.users.findFirst({
    where: eq(users.id, matchedToken.userId),
  });

  if (!user) {
    throw new AuthError('Usuario no encontrado', 401);
  }

  // 5. Generar nuevos tokens
  const accessToken = await generateAccessToken({
    userId: user.id,
    role: user.role as 'super-admin' | 'admin',
    tenantId: user.tenantId,
  });

  const newRawRefreshToken = crypto.randomUUID();
  const newTokenHash = hashToken(newRawRefreshToken);
  const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: newTokenHash,
    userAgent: userAgent?.slice(0, 255),
    ipAddress: ipAddress?.slice(0, 100),
    expiresAt,
  });

  const { password: _, ...safeUser } = user;

  return {
    success: true,
    accessToken,
    refreshToken: newRawRefreshToken,
    user: safeUser
  };
}

// ────────────────────────────────────────────
// LOGOUT
// ────────────────────────────────────────────
export async function logout(rawRefreshToken: string) {
  const tokenHash = hashToken(rawRefreshToken);

  await db.update(refreshTokens)
    .set({ isRevoked: true })
    .where(and(
      eq(refreshTokens.tokenHash, tokenHash),
      eq(refreshTokens.isRevoked, false),
    ));
}

// ────────────────────────────────────────────
// PROFILE
// ────────────────────────────────────────────
export async function getProfile(userId: number) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new AuthError('Usuario no encontrado', 404);
  }

  const { password: _, ...safeUser } = user;
  return safeUser;
}

// ────────────────────────────────────────────
// AUTH ERROR
// ────────────────────────────────────────────
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
