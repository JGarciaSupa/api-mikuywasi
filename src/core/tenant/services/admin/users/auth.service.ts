import { eq, and, gt } from 'drizzle-orm';
import { createHash } from 'crypto';
import { users, refreshTokens, userBranches, branches } from '@/db/tenant/schema';
import { generateAccessToken } from '@/utils/jwt';
import { uploadToR2, deleteFromR2, getImageUrl } from '@/utils/r2';
import { getTenantDb } from '@/utils/tenant-context';
import { buildPermissionsForUser } from './rbac.service';

// Helper: obtener sucursales asignadas a un usuario
async function getUserBranches(userId: number, roleCode: string | null) {
  const db = getTenantDb();

  const allBranches = await db
    .select({
      id: branches.id,
      name: branches.name,
      code: branches.code,
      isMain: branches.isMain,
      isActive: branches.isActive,
      isDefault: branches.isMain,
    })
    .from(branches)
    .where(eq(branches.isActive, true));
  return allBranches;

}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ────────────────────────────────────────────
// LOGIN
// ────────────────────────────────────────────
export async function login(username: string, password: string, userAgent?: string, ipAddress?: string) {

  console.log("Login Service");

  const db = getTenantDb();
  const user = await db.query.users.findFirst({
    where: eq(users.username, username.trim()),
  });

  console.log("Users: ", user);

  if (!user) {
    throw new AuthError('Credenciales inválidas', 401);
  }

  // 2. Verificar password
  const validPassword = await Bun.password.verify(password, user.password, 'bcrypt');
  if (!validPassword) {
    throw new AuthError('Credenciales inválidas', 401);
  }

  // 3. Cargar permisos del usuario (si tiene rol RBAC asignado)
  const { roleId, roleCode, permissions } = await buildPermissionsForUser(user.id);

  // 4. Generar access token con permisos embebidos
  const accessToken = await generateAccessToken({
    userId: user.id,
    role: roleCode ?? 'guest',
    roleId,
    permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
  });

  // 5. Generar refresh token
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

  // 5. Obtener sucursales del usuario
  const userBranchesList = await getUserBranches(user.id, roleCode);
  const defaultBranch = userBranchesList.find(b => b.isDefault) || userBranchesList[0] || null;

  // 6. Retornar datos (sin password)
  const { password: _, ...safeUser } = user;

  return {
    success: true,
    accessToken,
    refreshToken: rawRefreshToken,
    user: {
      ...safeUser,
      image: getImageUrl(safeUser.image),
      roleId,
      permissions,
    },
    branches: userBranchesList,
    currentBranch: defaultBranch,
  }
}

// ────────────────────────────────────────────
// REFRESH
// ────────────────────────────────────────────
export async function refreshAccessToken(rawRefreshToken: string, userAgent?: string, ipAddress?: string) {
  const db = getTenantDb();
  // 1. Buscar el token por hash
  const tokenHash = hashToken(rawRefreshToken);

  const matchedToken = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      eq(refreshTokens.isRevoked, false),
      gt(refreshTokens.expiresAt, new Date())),
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

  // 5. Generar nuevos tokens (recargar permisos actualizados)
  const { roleId, roleCode, permissions } = await buildPermissionsForUser(user.id);
  const accessToken = await generateAccessToken({
    userId: user.id,
    role: roleCode ?? 'guest',
    roleId,
    permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
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

  const userBranchesList = await getUserBranches(user.id, roleCode);
  const defaultBranch = userBranchesList.find(b => b.isDefault) || userBranchesList[0] || null;

  const { password: _, ...safeUser } = user;

  return {
    success: true,
    accessToken,
    refreshToken: newRawRefreshToken,
    user: {
      ...safeUser,
      image: getImageUrl(safeUser.image),
      roleId,
      permissions,
    },
    branches: userBranchesList,
    currentBranch: defaultBranch,
  };
}

// ────────────────────────────────────────────
// LOGOUT
// ────────────────────────────────────────────
export async function logout(rawRefreshToken: string) {
  const db = getTenantDb();
  const tokenHash = hashToken(rawRefreshToken);

  await db.update(refreshTokens)
    .set({ isRevoked: true })
    .where(and(
      eq(refreshTokens.tokenHash, tokenHash),
      eq(refreshTokens.isRevoked, false)));
}

// ────────────────────────────────────────────
// PROFILE
// ────────────────────────────────────────────
export async function getProfile(userId: number) {
  const db = getTenantDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new AuthError('Usuario no encontrado', 404);
  }

  const { roleId, roleCode, permissions, roleName } = await buildPermissionsForUser(user.id);
  const userBranchesList = await getUserBranches(user.id, roleCode);
  const defaultBranch = userBranchesList.find(b => b.isDefault) || userBranchesList[0] || null;

  const { password: _, ...safeUser } = user;
  return {
    ...safeUser,
    image: getImageUrl(safeUser.image),
    branches: userBranchesList,
    currentBranch: defaultBranch,
    roleId,
    roleName,
    permissions,
  };
}

// ────────────────────────────────────────────
// UPDATE PROFILE
// ────────────────────────────────────────────
export async function updateProfile(userId: number, data: { name: string; image?: string | null }, imageFile?: File) {
  const db = getTenantDb();
  const existingUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!existingUser) {
    throw new AuthError("Usuario no encontrado", 404);
  }

  let imageKey = data.image ?? existingUser.image;

  if (imageFile) {
    if (existingUser.image) {
      await deleteFromR2(existingUser.image);
    }
    imageKey = await uploadToR2(imageFile, 'profile');
  }

  const [updatedUser] = await db
    .update(users)
    .set({
      name: data.name,
      image: imageKey,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) {
    throw new AuthError("Usuario no encontrado", 404);
  }

  const { password: _, ...safeUser } = updatedUser;
  return {
    ...safeUser,
    image: getImageUrl(safeUser.image)
  };
}

// ────────────────────────────────────────────
// UPDATE PASSWORD
// ────────────────────────────────────────────
export async function updatePassword(userId: number, data: { currentPassword: string; newPassword: string }) {
  const db = getTenantDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new AuthError("Usuario no encontrado", 404);
  }

  const validPassword = await Bun.password.verify(data.currentPassword, user.password, "bcrypt");
  if (!validPassword) {
    throw new AuthError("La contraseña actual es incorrecta", 400);
  }

  const hashedNewPassword = await Bun.password.hash(data.newPassword, {
    algorithm: "bcrypt",
    cost: 10,
  });

  await db
    .update(users)
    .set({
      password: hashedNewPassword,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { success: true, message: "Contraseña actualizada correctamente" };
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
