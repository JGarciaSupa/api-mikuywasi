import { eq } from 'drizzle-orm';
import { masterDb } from '../../../db';
import { activations } from '../../../db/master/schema';
import type { CreateActivationInput, UpdateActivationInput } from '../validations/activations.validation';

export const getActivations = async () => {
  return await masterDb.query.activations.findMany({
    orderBy: (a, { asc }) => [asc(a.category), asc(a.order), asc(a.name)],
  });
};

export const getActivationById = async (id: number) => {
  const activation = await masterDb.query.activations.findFirst({
    where: eq(activations.id, id),
  });

  if (!activation) throw new Error('Activación no encontrada');
  return activation;
};

export const createActivation = async (data: CreateActivationInput) => {
  const [existingCode] = await masterDb
    .select()
    .from(activations)
    .where(eq(activations.code, data.code));

  if (existingCode) {
    throw new Error('El código ya está registrado');
  }

  const [newActivation] = await masterDb
    .insert(activations)
    .values(data)
    .returning();

  return newActivation;
};

export const updateActivation = async (id: number, data: UpdateActivationInput) => {
  const [existing] = await masterDb
    .select()
    .from(activations)
    .where(eq(activations.id, id));

  if (!existing) throw new Error('Activación no encontrada');

  if (data.code && data.code !== existing.code) {
    const [existingCode] = await masterDb
      .select()
      .from(activations)
      .where(eq(activations.code, data.code));

    if (existingCode && existingCode.id !== id) {
      throw new Error('El código ya está registrado');
    }
  }

  const [updatedActivation] = await masterDb
    .update(activations)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(activations.id, id))
    .returning();

  return updatedActivation;
};

export const deleteActivation = async (id: number) => {
  const [existing] = await masterDb
    .select()
    .from(activations)
    .where(eq(activations.id, id));

  if (!existing) throw new Error('Activación no encontrada');

  await masterDb
    .delete(activations)
    .where(eq(activations.id, id));

  return { message: 'Activación eliminada correctamente' };
};
