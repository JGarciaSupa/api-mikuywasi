import { masterDb } from '../../../db';
import { locales } from '../../../db/master/schema';
import { eq } from 'drizzle-orm';
import type { CreateLocalInput, UpdateLocalInput } from '../validations/locales.validation';

export const getLocalesByBrand = async (brandId: number) => {
  const result = await masterDb.query.locales.findMany({
    where: eq(locales.brandId, brandId),
    with: { country: true, baseCurrency: true, foreignCurrency: true },
    orderBy: (locales, { asc }) => [asc(locales.name)],
  });
  return result;
};

export const getLocalById = async (id: number) => {
  const local = await masterDb.query.locales.findFirst({
    where: eq(locales.id, id),
    with: { brand: true, country: true, baseCurrency: true, foreignCurrency: true },
  });
  if (!local) throw new Error('Local no encontrado');
  return local;
};

export const createLocal = async (data: CreateLocalInput) => {
  const [newLocal] = await masterDb.insert(locales).values({
    ...data,
    address: data.address || null,
    phone: data.phone || null,
    foreignCurrencyId: data.foreignCurrencyId || null,
    updatedAt: new Date(),
  }).returning();
  return newLocal;
};

export const updateLocal = async (id: number, data: UpdateLocalInput) => {
  const [updated] = await masterDb.update(locales)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(locales.id, id))
    .returning();

  if (!updated) throw new Error('Local no encontrado');
  return updated;
};

export const deleteLocal = async (id: number) => {
  const [deleted] = await masterDb.delete(locales)
    .where(eq(locales.id, id))
    .returning();

  if (!deleted) throw new Error('Local no encontrado');
  return { message: 'Local eliminado correctamente' };
};
