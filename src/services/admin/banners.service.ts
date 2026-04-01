import { db } from '../../db';
import { banners } from '../../db/schema';
import { eq, asc, count, and } from 'drizzle-orm';
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from '../../utils/s3';

const s3Client = getS3Client();
const BUCKET_NAME = process.env.R2_BUCKET!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

async function uploadToR2(file: File): Promise<string> {
  const fileExtension = file.name.split('.').pop();
  const fileName = `banners/${crypto.randomUUID()}.${fileExtension}`;
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
 * Obtener todos los banners de un tenant
 */
export async function getAllBanners(tenantId: number) {
  return await db.select().from(banners)
    .where(eq(banners.tenantId, tenantId))
    .orderBy(asc(banners.order));
}

/**
 * Obtener un banner por ID
 */
export async function getBannerById(id: number) {
  const [banner] = await db.select().from(banners).where(eq(banners.id, id));
  return banner;
}

/**
 * Crear un nuevo banner
 */
export async function createBanner(tenantId: number, data: { order?: number }, imageFile: File) {
  // Verificar límite de 3 banners
  const [totalResult] = await db.select({ count: count() })
    .from(banners)
    .where(eq(banners.tenantId, tenantId));

  if (totalResult.count >= 3) {
    throw new Error('Solo se permite un máximo de 3 banners por tenant');
  }

  const imageUrl = await uploadToR2(imageFile);

  const [newBanner] = await db.insert(banners).values({
    tenantId,
    url: imageUrl,
    order: data.order || 0,
  }).returning();

  return newBanner;
}

/**
 * Actualizar un banner existente
 */
export async function updateBanner(id: number, data: { order?: number }, imageFile?: File) {
  const [existingBanner] = await db.select().from(banners).where(eq(banners.id, id));
  if (!existingBanner) {
    throw new Error('Banner no encontrado');
  }

  let imageUrl = existingBanner.url;
  if (imageFile) {
    // Eliminar imagen anterior
    await deleteFromR2(existingBanner.url);
    // Subir nueva imagen
    imageUrl = await uploadToR2(imageFile);
  }

  const [updatedBanner] = await db
    .update(banners)
    .set({ 
      url: imageUrl,
      order: data.order ?? existingBanner.order,
    })
    .where(eq(banners.id, id))
    .returning();

  return updatedBanner;
}

/**
 * Eliminar un banner
 */
export async function deleteBanner(id: number) {
  const [existingBanner] = await db.select().from(banners).where(eq(banners.id, id));
  if (!existingBanner) {
    throw new Error('Banner no encontrado');
  }

  // Eliminar imagen de R2
  await deleteFromR2(existingBanner.url);

  // Eliminar registro
  const [deletedBanner] = await db
    .delete(banners)
    .where(eq(banners.id, id))
    .returning();

  return deletedBanner;
}

/**
 * Reordenar banners
 */
export async function reorderBanners(list: { id: number; order: number }[]) {
  return await db.transaction(async (tx) => {
    const results = [];
    for (const item of list) {
      const [updated] = await tx
        .update(banners)
        .set({ order: item.order })
        .where(eq(banners.id, item.id))
        .returning();
      results.push(updated);
    }
    return results;
  });
}
