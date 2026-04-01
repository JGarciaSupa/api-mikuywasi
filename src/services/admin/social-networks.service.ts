import { db } from '../../db';
import { socialLinks } from '../../db/schema';
import { eq, asc, and, sql } from 'drizzle-orm';

/**
 * Obtener todas las redes sociales de un tenant
 */
export async function getAllSocialNetworks(tenantId: number) {
  return await db.select().from(socialLinks)
    .where(eq(socialLinks.tenantId, tenantId))
    .orderBy(asc(socialLinks.order));
}

/**
 * Obtener una red social por ID
 */
export async function getSocialNetworkById(id: number) {
  const [socialNetwork] = await db.select().from(socialLinks).where(eq(socialLinks.id, id));
  return socialNetwork;
}

/**
 * Crear una nueva red social
 */
export async function createSocialNetwork(data: any) {
  // Verificar si ya existe esa plataforma para el tenant
  const [existing] = await db.select().from(socialLinks)
    .where(and(
      eq(socialLinks.tenantId, data.tenantId),
      eq(socialLinks.platform, data.platform)
    ));

  if (existing) {
    throw new Error(`La plataforma ${data.platform} ya está registrada para este tenant`);
  }

  const [newSocialNetwork] = await db.insert(socialLinks).values(data).returning();
  return newSocialNetwork;
}

/**
 * Actualizar una red social existente
 */
export async function updateSocialNetwork(id: number, data: any) {
  const [updatedSocialNetwork] = await db
    .update(socialLinks)
    .set({ ...data })
    .where(eq(socialLinks.id, id))
    .returning();
  return updatedSocialNetwork;
}

/**
 * Eliminar una red social (hard delete)
 */
export async function deleteSocialNetwork(id: number) {
  const [deletedSocialNetwork] = await db
    .delete(socialLinks)
    .where(eq(socialLinks.id, id))
    .returning();
  return deletedSocialNetwork;
}

/**
 * Reordenar redes sociales
 */
export async function reorderSocialNetworks(list: { id: number; order: number }[]) {
  return await db.transaction(async (tx) => {
    const results = [];
    for (const item of list) {
      const [updated] = await tx
        .update(socialLinks)
        .set({ order: item.order })
        .where(eq(socialLinks.id, item.id))
        .returning();
      results.push(updated);
    }
    return results;
  });
}
