import { brands } from '@/db/tenant/schema';
import { eq } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import { uploadToR2, deleteFromR2, getImageUrl } from '@/utils/r2';
import { masterDb } from '@/db';
import { tenants } from '@/db/master/schema';
import { getTenantId } from '@/utils/tenant-context';

function mapBrand(brand: typeof brands.$inferSelect) {
  return { ...brand, logo: getImageUrl(brand.logo) };
}

export async function getAllBrands() {
  const db = getTenantDb();
  const rows = await db.select().from(brands).orderBy(brands.createdAt);
  return rows.map(mapBrand);
}

export async function getBrandById(id: number) {
  const db = getTenantDb();
  const [brand] = await db.select().from(brands).where(eq(brands.id, id));
  if (!brand) throw new Error('Marca no encontrada');
  return mapBrand(brand);
}

export interface CreateBrandInput {
  name: string;
  code: string;
  email?: string | null;
  category?: string | null;
  primaryColor?: string | null;
  isActive?: boolean;
}

export async function createBrand(data: CreateBrandInput) {
  const db = getTenantDb();
  const [brand] = await db.insert(brands).values({
    name: data.name,
    code: data.code.toUpperCase(),
    email: data.email ?? null,
    category: data.category ?? null,
    primaryColor: data.primaryColor ?? '#000000',
    isActive: data.isActive ?? true,
  }).returning();
  return mapBrand(brand);
}

export async function updateBrand(id: number, data: Partial<CreateBrandInput>) {
  const db = getTenantDb();
  const [existing] = await db.select().from(brands).where(eq(brands.id, id));
  if (!existing) throw new Error('Marca no encontrada');

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code.toUpperCase();
  if (data.email !== undefined) updateData.email = data.email ?? null;
  if (data.category !== undefined) updateData.category = data.category ?? null;
  if (data.primaryColor !== undefined) updateData.primaryColor = data.primaryColor ?? null;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const [updated] = await db.update(brands).set(updateData).where(eq(brands.id, id)).returning();
  return mapBrand(updated);
}

export async function deleteBrand(id: number) {
  const db = getTenantDb();
  const [existing] = await db.select().from(brands).where(eq(brands.id, id));
  if (!existing) throw new Error('Marca no encontrada');

  // Prevent deleting the only brand
  const allBrands = await db.select({ id: brands.id }).from(brands);
  if (allBrands.length <= 1) {
    throw new Error('No se puede eliminar la única marca del negocio');
  }

  const [deleted] = await db.delete(brands).where(eq(brands.id, id)).returning();
  if (deleted.logo) {
    await deleteFromR2(deleted.logo);
  }
  return mapBrand(deleted);
}

export async function updateBrandLogo(id: number, file: File) {
  const db = getTenantDb();
  const tenantId = getTenantId();

  const [existing] = await db.select().from(brands).where(eq(brands.id, id));
  if (!existing) throw new Error('Marca no encontrada');

  const tenantMaster = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  const slug = tenantMaster?.slug ?? 'brand';
  const oldLogo = existing.logo;
  const logoKey = await uploadToR2(file, `${slug}/logos`, 256);

  try {
    const [updated] = await db
      .update(brands)
      .set({ logo: logoKey, updatedAt: new Date() })
      .where(eq(brands.id, id))
      .returning();

    if (oldLogo) await deleteFromR2(oldLogo);
    return mapBrand(updated);
  } catch (error) {
    await deleteFromR2(logoKey);
    throw error;
  }
}

export async function deleteBrandLogo(id: number) {
  const db = getTenantDb();
  const [existing] = await db.select().from(brands).where(eq(brands.id, id));
  if (!existing) throw new Error('Marca no encontrada');

  const [updated] = await db
    .update(brands)
    .set({ logo: null, updatedAt: new Date() })
    .where(eq(brands.id, id))
    .returning();

  if (existing.logo) await deleteFromR2(existing.logo);
  return mapBrand(updated);
}
