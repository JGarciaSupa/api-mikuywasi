import { masterDb } from '../../../db';
import { countries } from '../../../db/master/schema';
import { eq } from 'drizzle-orm';
import type { CreateCountryInput, UpdateCountryInput } from '../validations/countries.validation';

export const getAllCountries = async (includeInactive = false) => {
  const result = await masterDb.query.countries.findMany({
    where: includeInactive ? undefined : eq(countries.isActive, true),
    orderBy: (countries, { asc }) => [asc(countries.name)],
  });
  return result;
};

export const getCountryById = async (id: number) => {
  const country = await masterDb.query.countries.findFirst({
    where: eq(countries.id, id),
  });
  if (!country) throw new Error('País no encontrado');
  return country;
};

export const createCountry = async (data: CreateCountryInput) => {
  const [newCountry] = await masterDb.insert(countries).values({
    ...data,
    updatedAt: new Date(),
  }).returning();
  return newCountry;
};

export const updateCountry = async (id: number, data: UpdateCountryInput) => {
  const [updated] = await masterDb.update(countries)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(countries.id, id))
    .returning();

  if (!updated) throw new Error('País no encontrado');
  return updated;
};

export const deleteCountry = async (id: number) => {
  const [deleted] = await masterDb.delete(countries)
    .where(eq(countries.id, id))
    .returning();

  if (!deleted) throw new Error('País no encontrado');
  return { message: 'País eliminado correctamente' };
};
