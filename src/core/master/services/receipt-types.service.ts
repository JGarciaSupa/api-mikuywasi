import { eq, and } from 'drizzle-orm';
import { masterDb } from '../../../db';
import { receiptTypes } from '../../../db/master/schema';
import type { CreateReceiptTypeInput, UpdateReceiptTypeInput } from '../validations/receipt-types.validation';

export const getReceiptTypes = async () => {
  return await masterDb.query.receiptTypes.findMany({
    with: {
      country: true,
    },
    orderBy: (rt, { asc }) => [asc(rt.name)],
  });
};

export const getReceiptTypeById = async (id: number) => {
  const receiptType = await masterDb.query.receiptTypes.findFirst({
    where: eq(receiptTypes.id, id),
    with: { country: true }
  });

  if (!receiptType) throw new Error('Tipo de comprobante no encontrado');
  return receiptType;
};

export const createReceiptType = async (data: CreateReceiptTypeInput) => {
  const [existingCode] = await masterDb
    .select()
    .from(receiptTypes)
    .where(and(
      eq(receiptTypes.code, data.code),
      eq(receiptTypes.countryId, data.countryId)
    ));

  if (existingCode) {
    throw new Error('El código ya está registrado para este país');
  }

  const [newReceiptType] = await masterDb
    .insert(receiptTypes)
    .values(data)
    .returning();

  return newReceiptType;
};

export const updateReceiptType = async (id: number, data: UpdateReceiptTypeInput) => {
  const [existing] = await masterDb
    .select()
    .from(receiptTypes)
    .where(eq(receiptTypes.id, id));

  if (!existing) throw new Error('Tipo de comprobante no encontrado');

  if ((data.code && data.code !== existing.code) || (data.countryId && data.countryId !== existing.countryId)) {
    const codeToCheck = data.code ?? existing.code;
    const countryIdToCheck = data.countryId ?? existing.countryId;

    const [existingCode] = await masterDb
      .select()
      .from(receiptTypes)
      .where(and(
        eq(receiptTypes.code, codeToCheck),
        eq(receiptTypes.countryId, countryIdToCheck)
      ));

    if (existingCode && existingCode.id !== id) {
      throw new Error('El código ya está registrado para este país');
    }
  }

  const [updatedReceiptType] = await masterDb
    .update(receiptTypes)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(receiptTypes.id, id))
    .returning();

  return updatedReceiptType;
};

export const deleteReceiptType = async (id: number) => {
  const [existing] = await masterDb
    .select()
    .from(receiptTypes)
    .where(eq(receiptTypes.id, id));

  if (!existing) throw new Error('Tipo de comprobante no encontrado');

  await masterDb
    .delete(receiptTypes)
    .where(eq(receiptTypes.id, id));

  return { message: 'Tipo de comprobante eliminado correctamente' };
};
