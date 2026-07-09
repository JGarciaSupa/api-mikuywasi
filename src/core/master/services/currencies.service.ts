import { masterDb } from '../../../db';
import { currencies } from '../../../db/master/schema';
import { eq } from 'drizzle-orm';
import type { CreateCurrencyInput, UpdateCurrencyInput } from '../validations/currencies.validation';

export const getAllCurrencies = async (includeInactive = false) => {
  const result = await masterDb.query.currencies.findMany({
    where: includeInactive ? undefined : eq(currencies.isActive, true),
    orderBy: (currencies, { asc }) => [asc(currencies.name)],
  });
  return result;
};

export const getCurrencyById = async (id: number) => {
  const currency = await masterDb.query.currencies.findFirst({
    where: eq(currencies.id, id),
  });
  if (!currency) throw new Error('Moneda no encontrada');
  return currency;
};

export const createCurrency = async (data: CreateCurrencyInput) => {
  const [newCurrency] = await masterDb.insert(currencies).values({
    ...data,
    updatedAt: new Date(),
  }).returning();
  return newCurrency;
};

export const updateCurrency = async (id: number, data: UpdateCurrencyInput) => {
  const [updated] = await masterDb.update(currencies)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(currencies.id, id))
    .returning();

  if (!updated) throw new Error('Moneda no encontrada');
  return updated;
};

export const deleteCurrency = async (id: number) => {
  const [deleted] = await masterDb.delete(currencies)
    .where(eq(currencies.id, id))
    .returning();

  if (!deleted) throw new Error('Moneda no encontrada');
  return { message: 'Moneda eliminada correctamente' };
};
