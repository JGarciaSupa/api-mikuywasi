import { masterDb } from '../../../db';
import { brands } from '../../../db/master/schema';
import { eq } from 'drizzle-orm';
import type { CreateBrandInput, UpdateBrandInput } from '../validations/brands.validation';

export const getBrandsByTenant = async (tenantId: number) => {
  const result = await masterDb.query.brands.findMany({
    where: eq(brands.tenantId, tenantId),
    orderBy: (brands, { asc }) => [asc(brands.name)],
  });
  return result;
};

export const getBrandById = async (id: number) => {
  const brand = await masterDb.query.brands.findFirst({
    where: eq(brands.id, id),
    with: { tenant: true },
  });
  if (!brand) throw new Error('Marca no encontrada');
  return brand;
};

export const createBrand = async (data: CreateBrandInput) => {
  const [newBrand] = await masterDb.insert(brands).values({
    ...data,
    logoUrl: data.logoUrl || null,
    primaryColor: data.primaryColor || null,
    updatedAt: new Date(),
  }).returning();
  return newBrand;
};

export const updateBrand = async (id: number, data: UpdateBrandInput) => {
  const [updated] = await masterDb.update(brands)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(brands.id, id))
    .returning();

  if (!updated) throw new Error('Marca no encontrada');
  return updated;
};

export const deleteBrand = async (id: number) => {
  const [deleted] = await masterDb.delete(brands)
    .where(eq(brands.id, id))
    .returning();

  if (!deleted) throw new Error('Marca no encontrada');
  return { message: 'Marca eliminada correctamente' };
};
