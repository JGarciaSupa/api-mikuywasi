import { db } from '../../db';
import { banners } from '../../db/schema';
import { eq, asc, count } from 'drizzle-orm';
import { uploadToR2, deleteFromR2, getImageUrl } from '../../utils/r2';

/**
 * Obtener todos los banners de un tenant
 */
export async function getAllBanners(tenantId: number) {
  const result = await db.select().from(banners)
    .where(eq(banners.tenantId, tenantId))
    .orderBy(asc(banners.order));

  return result.map(banner => ({
    ...banner,
    url: getImageUrl(banner.url)
  }));
}

/**
 * Obtener un banner por ID
 */
export async function getBannerById(id: number) {
  const [banner] = await db.select().from(banners).where(eq(banners.id, id));
  if (!banner) return null;

  return {
    ...banner,
    url: getImageUrl(banner.url)
  };
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

  const imageKey = await uploadToR2(imageFile, 'banners', 1280);

  const [newBanner] = await db.insert(banners).values({
    tenantId,
    url: imageKey,
    order: data.order || 0,
  }).returning();

  return {
    ...newBanner,
    url: getImageUrl(newBanner.url)
  };
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
    imageUrl = await uploadToR2(imageFile, 'banners', 1280);
  }

  const [updatedBanner] = await db
    .update(banners)
    .set({ 
      url: imageUrl,
      order: data.order ?? existingBanner.order,
    })
    .where(eq(banners.id, id))
    .returning();

  return {
    ...updatedBanner,
    url: getImageUrl(updatedBanner.url)
  };
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
