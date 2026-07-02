import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { currencies } from '../../../db/master/schema';
import type { CreateCurrencyInput, UpdateCurrencyInput } from '../validations/currencies.validation';

export const getAllCurrencies = async () => {
  return await db.select().from(currencies).orderBy(currencies.name);
};

export const getCurrencyById = async (id: number) => {
  const result = await db.select().from(currencies).where(eq(currencies.id, id));
  if (result.length === 0) throw new Error('Moneda no encontrada');
  return result[0];
};

export const createCurrency = async (data: CreateCurrencyInput) => {
  try {
    const [newCurrency] = await db.insert(currencies).values(data).returning();
    return newCurrency;
  } catch (error: any) {
    if (error.code === '23505') {
      throw new Error('El código ISO ya existe');
    }
    throw error;
  }
};

export const updateCurrency = async (id: number, data: UpdateCurrencyInput) => {
  try {
    const [updatedCurrency] = await db.update(currencies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(currencies.id, id))
      .returning();
    if (!updatedCurrency) throw new Error('Moneda no encontrada');
    return updatedCurrency;
  } catch (error: any) {
    if (error.code === '23505') {
      throw new Error('El código ISO ya existe');
    }
    throw error;
  }
};

export const deleteCurrency = async (id: number) => {
  const result = await db.delete(currencies).where(eq(currencies.id, id)).returning();
  if (result.length === 0) throw new Error('Moneda no encontrada');
  return { message: 'Moneda eliminada correctamente' };
};
