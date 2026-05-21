import { masterDb } from '../../../db';
import { users, refreshTokens } from '../../../db/master/schema';
import { eq } from 'drizzle-orm';
import type { CreateUserInput, UpdateUserInput, UpdatePasswordInput, LoginInput } from '../validations/users.validation';
import { generateAccessToken } from '../utils/jwt';

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export const loginUser = async (data: LoginInput) => {
  const user = await masterDb.query.users.findFirst({
    where: eq(users.userName, data.userName),
  });

  if (!user) throw new Error('Credenciales inválidas');

  const isValid = await Bun.password.verify(data.password, user.password);
  if (!isValid) throw new Error('Credenciales inválidas');

  const accessToken = await generateAccessToken({
    id: user.id,
    userId: user.id,
    userName: user.userName,
    role: 'super-admin',
  });

  const refreshToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 días

  await masterDb.insert(refreshTokens).values({
    userId: user.id,
    token: refreshToken,
    expiresAt,
  });

  const { password: _, ...safeUser } = user;

  return { accessToken, refreshToken, user: safeUser };
};

export const refreshSession = async (token: string) => {
  const record = await masterDb.query.refreshTokens.findFirst({
    where: eq(refreshTokens.token, token),
    with: {
      user: true,
    },
  });

  if (!record) {
    throw new Error('Refresh token no válido');
  }

  if (new Date() > new Date(record.expiresAt)) {
    await masterDb.delete(refreshTokens).where(eq(refreshTokens.id, record.id));
    throw new Error('Refresh token expirado');
  }

  const newAccessToken = await generateAccessToken({
    id: record.user.id,
    userId: record.user.id,
    userName: record.user.userName,
    role: 'super-admin',
  });

  const newRefreshToken = crypto.randomUUID();
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 7); // 7 días

  // Rotación: Eliminar el token viejo e insertar el nuevo
  await masterDb.delete(refreshTokens).where(eq(refreshTokens.id, record.id));
  await masterDb.insert(refreshTokens).values({
    userId: record.user.id,
    token: newRefreshToken,
    expiresAt: newExpiresAt,
  });

  const { password: _, ...safeUser } = record.user;

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: safeUser,
  };
};

export const logoutSession = async (token: string) => {
  await masterDb.delete(refreshTokens).where(eq(refreshTokens.token, token));
};


// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const getAllUsers = async () => {
  const result = await masterDb.query.users.findMany({
    orderBy: (users, { desc }) => [desc(users.createdAt)],
  });

  return result.map(({ password: _, ...user }) => user);
};

export const getUserById = async (id: number) => {
  const user = await masterDb.query.users.findFirst({
    where: eq(users.id, id),
  });

  if (!user) throw new Error('Usuario no encontrado');
  const { password: _, ...safeUser } = user;
  return safeUser;
};

export const createUser = async (data: CreateUserInput) => {
  const existing = await masterDb.query.users.findFirst({
    where: eq(users.userName, data.userName),
  });

  if (existing) throw new Error('El nombre de usuario ya está en uso');

  const hashed = await Bun.password.hash(data.password, 'bcrypt');

  const [newUser] = await masterDb.insert(users).values({
    ...data,
    password: hashed,
    updatedAt: new Date(),
  }).returning();

  const { password: _, ...safeUser } = newUser;
  return safeUser;
};

export const updateUser = async (id: number, data: UpdateUserInput) => {
  if (data.userName) {
    const existing = await masterDb.query.users.findFirst({
      where: eq(users.userName, data.userName),
    });
    if (existing && existing.id !== id) throw new Error('El nombre de usuario ya está en uso');
  }

  const [updated] = await masterDb.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  if (!updated) throw new Error('Usuario no encontrado');
  const { password: _, ...safeUser } = updated;
  return safeUser;
};

export const updatePassword = async (id: number, data: UpdatePasswordInput) => {
  const user = await masterDb.query.users.findFirst({
    where: eq(users.id, id),
  });

  if (!user) throw new Error('Usuario no encontrado');

  const isValid = await Bun.password.verify(data.currentPassword, user.password);
  if (!isValid) throw new Error('La contraseña actual es incorrecta');

  const hashed = await Bun.password.hash(data.newPassword, 'bcrypt');

  await masterDb.update(users)
    .set({ password: hashed, updatedAt: new Date() })
    .where(eq(users.id, id));

  return { message: 'Contraseña actualizada correctamente' };
};

export const deleteUser = async (id: number) => {
  const [deleted] = await masterDb.delete(users)
    .where(eq(users.id, id))
    .returning();

  if (!deleted) throw new Error('Usuario no encontrado');
  return { message: 'Usuario eliminado correctamente' };
};
