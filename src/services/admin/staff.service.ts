import { db } from '../../db';
import { users } from '../../db/schema';
import { eq, and, like, ne, desc, count } from 'drizzle-orm';
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from '../../utils/s3';
import { CreateStaffInput, UpdateStaffInput } from '../../validations/admin/staff.validation';

const s3Client = getS3Client();
const BUCKET_NAME = process.env.R2_BUCKET!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

/**
 * Subir imagen a Cloudflare R2
 */
async function uploadToR2(file: File): Promise<string> {
  const fileExtension = file.name.split('.').pop();
  const fileName = `profile/${crypto.randomUUID()}.${fileExtension}`;
  const arrayBuffer = await file.arrayBuffer();

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: Buffer.from(arrayBuffer),
    ContentType: file.type,
  });

  await s3Client.send(command);
  return `${PUBLIC_URL}/${fileName}`;
}

/**
 * Eliminar imagen de Cloudflare R2
 */
async function deleteFromR2(url: string) {
  try {
    const key = url.replace(`${PUBLIC_URL}/`, '');
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error('Error deleting from R2:', error);
  }
}

/**
 * Crear un nuevo miembro del staff
 */
export async function createStaff(tenantId: number, data: CreateStaffInput, imageFile?: File) {
  let imageUrl = null;
  if (imageFile) {
    imageUrl = await uploadToR2(imageFile);
  }

  const hashedPassword = await Bun.password.hash(data.password, 'bcrypt');

  const [newUser] = await db.insert(users).values({
    tenantId,
    email: data.email,
    password: hashedPassword,
    name: data.name,
    role: data.role,
    image: imageUrl,
  }).returning();

  const { password: _, ...safeUser } = newUser;
  return safeUser;
}

/**
 * Obtener lista de staff paginada y filtrada
 * No incluye al usuario actual
 */
export async function getStaffList(
  tenantId: number,
  currentUserId: number,
  params: { name?: string; page: number; limit: number }
) {
  const offset = (params.page - 1) * params.limit;

  const whereClause = and(
    eq(users.tenantId, tenantId),
    ne(users.id, currentUserId),
    params.name ? like(users.name, `%${params.name}%`) : undefined
  );

  const [totalResult] = await db
    .select({ total: count() })
    .from(users)
    .where(whereClause);

  const items = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      image: users.image,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(whereClause)
    .limit(params.limit)
    .offset(offset)
    .orderBy(desc(users.createdAt));

  return {
    items,
    total: totalResult.total,
    pages: Math.ceil(totalResult.total / params.limit),
    currentPage: params.page,
    limit: params.limit,
  };
}

/**
 * Actualizar un miembro del staff
 */
export async function updateStaff(
  id: number,
  tenantId: number,
  data: UpdateStaffInput,
  imageFile?: File
) {
  const [existingUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.tenantId, tenantId)));

  if (!existingUser) {
    throw new Error('Usuario no encontrado');
  }

  let imageUrl = existingUser.image;
  if (imageFile) {
    if (existingUser.image) {
      await deleteFromR2(existingUser.image);
    }
    imageUrl = await uploadToR2(imageFile);
  }

  const updateData: any = {
    name: data.name ?? existingUser.name,
    email: data.email ?? existingUser.email,
    role: data.role ?? existingUser.role,
    image: imageUrl,
    updatedAt: new Date(),
  };

  if (data.password) {
    updateData.password = await Bun.password.hash(data.password, 'bcrypt');
  }

  const [updatedUser] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();

  const { password: _, ...safeUser } = updatedUser;
  return safeUser;
}

/**
 * Eliminar un miembro del staff
 */
export async function deleteStaff(id: number, tenantId: number) {
  const [existingUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.tenantId, tenantId)));

  if (!existingUser) {
    throw new Error('Usuario no encontrado');
  }

  if (existingUser.image) {
    await deleteFromR2(existingUser.image);
  }

  const [deletedUser] = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning();

  const { password: _, ...safeUser } = deletedUser;
  return safeUser;
}
