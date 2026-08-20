import { eq, and, isNull, or, ne } from 'drizzle-orm';
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
  const countryCondition = data.countryId ? eq(receiptTypes.countryId, data.countryId) : isNull(receiptTypes.countryId);

  const existing = await masterDb
    .select()
    .from(receiptTypes)
    .where(and(
      countryCondition,
      or(
        eq(receiptTypes.code, data.code),
        data.documentPrefix ? eq(receiptTypes.documentPrefix, data.documentPrefix) : undefined
      )
    ));

  if (existing.length > 0) {
    const duplicateCode = existing.find(rt => rt.code === data.code);
    if (duplicateCode) {
      throw new Error('El código ya está registrado para este país (o globalmente)');
    }
    const duplicatePrefix = existing.find(rt => data.documentPrefix && rt.documentPrefix === data.documentPrefix);
    if (duplicatePrefix) {
      throw new Error('El prefijo ya está registrado para este país (o globalmente)');
    }
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

  if (
    (data.code && data.code !== existing.code) || 
    (data.countryId !== undefined && data.countryId !== existing.countryId) ||
    (data.documentPrefix !== undefined && data.documentPrefix !== existing.documentPrefix)
  ) {
    const codeToCheck = data.code ?? existing.code;
    const countryIdToCheck = data.countryId !== undefined ? data.countryId : existing.countryId;
    const prefixToCheck = data.documentPrefix !== undefined ? data.documentPrefix : existing.documentPrefix;

    const countryCondition = countryIdToCheck ? eq(receiptTypes.countryId, countryIdToCheck) : isNull(receiptTypes.countryId);

    const existingConflicts = await masterDb
      .select()
      .from(receiptTypes)
      .where(and(
        ne(receiptTypes.id, id),
        countryCondition,
        or(
          eq(receiptTypes.code, codeToCheck),
          prefixToCheck ? eq(receiptTypes.documentPrefix, prefixToCheck) : undefined
        )
      ));

    if (existingConflicts.length > 0) {
      const duplicateCode = existingConflicts.find(rt => rt.code === codeToCheck);
      if (duplicateCode) {
        throw new Error('El código ya está registrado para este país (o globalmente)');
      }
      const duplicatePrefix = existingConflicts.find(rt => prefixToCheck && rt.documentPrefix === prefixToCheck);
      if (duplicatePrefix) {
        throw new Error('El prefijo ya está registrado para este país (o globalmente)');
      }
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
