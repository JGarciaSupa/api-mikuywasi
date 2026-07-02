import { eq } from 'drizzle-orm';
import { masterDb } from '../../../db';
import { countries } from '../../../db/master/schema';
import type { CreateCountryInput, UpdateCountryInput } from '../validations/countries.validation';

export const getCountries = async () => {
  return await masterDb.query.countries.findMany({
    orderBy: (c, { asc }) => [asc(c.name)],
  });
};

export const getCountryById = async (id: number) => {
  const [country] = await masterDb
    .select()
    .from(countries)
    .where(eq(countries.id, id));

  if (!country) throw new Error('País no encontrado');
  return country;
};

export const createCountry = async (data: CreateCountryInput) => {
  const [existingIsoCode] = await masterDb
    .select()
    .from(countries)
    .where(eq(countries.isoCode, data.isoCode));

  if (existingIsoCode) {
    throw new Error('El código ISO ya está registrado en otro país');
  }

  const [newCountry] = await masterDb
    .insert(countries)
    .values(data)
    .returning();

  return newCountry;
};

export const updateCountry = async (id: number, data: UpdateCountryInput) => {
  const [existing] = await masterDb
    .select()
    .from(countries)
    .where(eq(countries.id, id));

  if (!existing) throw new Error('País no encontrado');

  if (data.isoCode && data.isoCode !== existing.isoCode) {
    const [existingIso] = await masterDb
      .select()
      .from(countries)
      .where(eq(countries.isoCode, data.isoCode));

    if (existingIso) throw new Error('El código ISO ya está registrado en otro país');
  }

  const [updatedCountry] = await masterDb
    .update(countries)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(countries.id, id))
    .returning();

  return updatedCountry;
};

export const deleteCountry = async (id: number) => {
  const [existing] = await masterDb
    .select()
    .from(countries)
    .where(eq(countries.id, id));

  if (!existing) throw new Error('País no encontrado');

  await masterDb
    .delete(countries)
    .where(eq(countries.id, id));

  return { message: 'País eliminado correctamente' };
};
