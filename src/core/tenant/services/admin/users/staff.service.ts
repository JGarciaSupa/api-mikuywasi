import { users, userRoles, roles } from '@/db/tenant/schema';
import { eq, and, like, desc, count } from 'drizzle-orm';
import { uploadToR2, deleteFromR2, getImageUrl } from '@/utils/r2';
import { getTenantDb } from '@/utils/tenant-context';
import type { CreateStaffInput, UpdateStaffInput, StaffQueryInput } from '../../../validations/admin/users/staff.validation';

export async function createStaff(data: CreateStaffInput, imageFile?: File) {
  const db = getTenantDb();

  const [existing] = await db.select().from(users).where(eq(users.username, data.username));
  if (existing) throw new Error('El username ya está en uso');

  let imageKey = null;
  if (imageFile) {
    imageKey = await uploadToR2(imageFile, 'profile', 250);
  }

  const hashedPassword = await Bun.password.hash(data.password, 'bcrypt');

  const [newUser] = await db.insert(users).values({
    username: data.username,
    password: hashedPassword,
    name: data.name,
    image: imageKey,
  }).returning();

  if (data.roleId) {
    await db.insert(userRoles).values({
      userId: newUser.id,
      roleId: data.roleId,
    });
  }

  const { password: _, ...safeUser } = newUser;
  return { ...safeUser, image: getImageUrl(safeUser.image) };
}

export async function getStaffList(currentUserId: number, params: StaffQueryInput) {
  const db = getTenantDb();
  const offset = (params.page - 1) * params.limit;

  const whereClause = and(
    params.name ? like(users.name, `%${params.name}%`) : undefined,
    params.roleCode ? eq(roles.code, params.roleCode) : undefined
  );

  // El join a roles se necesita también acá cuando se filtra por roleCode.
  // userRoles.userId es unique, así que el left join no duplica filas del count.
  const [totalResult] = await db
    .select({ total: count() })
    .from(users)
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .leftJoin(roles, eq(userRoles.roleId, roles.id))
    .where(whereClause);

  const items = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      image: users.image,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      role: {
        id: roles.id,
        name: roles.name,
        code: roles.code,
      }
    })
    .from(users)
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .leftJoin(roles, eq(userRoles.roleId, roles.id))
    .where(whereClause)
    .limit(params.limit)
    .offset(offset)
    .orderBy(desc(users.createdAt));

  return {
    items: items.map(item => ({ ...item, image: getImageUrl(item.image) })),
    total: totalResult.total,
    pages: Math.ceil(totalResult.total / params.limit),
    currentPage: params.page,
    limit: params.limit,
  };
}

export async function updateStaff(id: number, data: UpdateStaffInput, imageFile?: File) {
  const db = getTenantDb();

  const [existingUser] = await db.select().from(users).where(eq(users.id, id));
  if (!existingUser) throw new Error('Usuario no encontrado');

  if (data.username && data.username !== existingUser.username) {
    const [taken] = await db.select().from(users).where(eq(users.username, data.username));
    if (taken) throw new Error('El username ya está en uso');
  }

  let imageKey = existingUser.image;
  if (imageFile) {
    if (existingUser.image) await deleteFromR2(existingUser.image);
    imageKey = await uploadToR2(imageFile, 'profile', 250);
  }

  const [updatedUser] = await db
    .update(users)
    .set({
      name: data.name ?? existingUser.name,
      username: data.username ?? existingUser.username,
      image: imageKey,
      updatedAt: new Date(),
      ...(data.password ? { password: await Bun.password.hash(data.password, 'bcrypt') } : {}),
    })
    .where(eq(users.id, id))
    .returning();

  if (data.roleId) {
    const [existingUserRole] = await db.select().from(userRoles).where(eq(userRoles.userId, id));
    if (existingUserRole) {
      await db.update(userRoles).set({ roleId: data.roleId }).where(eq(userRoles.userId, id));
    } else {
      await db.insert(userRoles).values({ userId: id, roleId: data.roleId });
    }
  }

  const { password: _, ...safeUser } = updatedUser;
  return { ...safeUser, image: getImageUrl(safeUser.image) };
}

export async function deleteStaff(id: number) {
  const db = getTenantDb();

  const [existingUser] = await db.select().from(users).where(eq(users.id, id));
  if (!existingUser) throw new Error('Usuario no encontrado');

  if (existingUser.image) await deleteFromR2(existingUser.image);

  const [deletedUser] = await db.delete(users).where(eq(users.id, id)).returning();
  const { password: _, ...safeUser } = deletedUser;
  return safeUser;
}
