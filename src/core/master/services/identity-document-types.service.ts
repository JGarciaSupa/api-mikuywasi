import { eq, and } from 'drizzle-orm';
import { masterDb } from '../../../db';
import { identityDocumentTypes } from '../../../db/master/schema';
import type { CreateIdentityDocumentTypeInput, UpdateIdentityDocumentTypeInput } from '../validations/identity-document-types.validation';

export const getIdentityDocumentTypes = async () => {
  return await masterDb.query.identityDocumentTypes.findMany({
    with: {
      country: true,
    },
    orderBy: (idt, { asc }) => [asc(idt.name)],
  });
};

export const getIdentityDocumentTypeById = async (id: number) => {
  const document = await masterDb.query.identityDocumentTypes.findFirst({
    where: eq(identityDocumentTypes.id, id),
    with: { country: true }
  });

  if (!document) throw new Error('Tipo de documento de identidad no encontrado');
  return document;
};

export const createIdentityDocumentType = async (data: CreateIdentityDocumentTypeInput) => {
  const [existingCode] = await masterDb
    .select()
    .from(identityDocumentTypes)
    .where(and(
      eq(identityDocumentTypes.code, data.code),
      eq(identityDocumentTypes.countryId, data.countryId)
    ));

  if (existingCode) {
    throw new Error('El código ya está registrado para este país');
  }

  const [newDocument] = await masterDb
    .insert(identityDocumentTypes)
    .values(data)
    .returning();

  return newDocument;
};

export const updateIdentityDocumentType = async (id: number, data: UpdateIdentityDocumentTypeInput) => {
  const [existing] = await masterDb
    .select()
    .from(identityDocumentTypes)
    .where(eq(identityDocumentTypes.id, id));

  if (!existing) throw new Error('Tipo de documento de identidad no encontrado');

  if ((data.code && data.code !== existing.code) || (data.countryId && data.countryId !== existing.countryId)) {
    const codeToCheck = data.code ?? existing.code;
    const countryIdToCheck = data.countryId ?? existing.countryId;

    const [existingCode] = await masterDb
      .select()
      .from(identityDocumentTypes)
      .where(and(
        eq(identityDocumentTypes.code, codeToCheck),
        eq(identityDocumentTypes.countryId, countryIdToCheck)
      ));

    if (existingCode && existingCode.id !== id) {
      throw new Error('El código ya está registrado para este país');
    }
  }

  const [updatedDocument] = await masterDb
    .update(identityDocumentTypes)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(identityDocumentTypes.id, id))
    .returning();

  return updatedDocument;
};

export const deleteIdentityDocumentType = async (id: number) => {
  const [existing] = await masterDb
    .select()
    .from(identityDocumentTypes)
    .where(eq(identityDocumentTypes.id, id));

  if (!existing) throw new Error('Tipo de documento de identidad no encontrado');

  await masterDb
    .delete(identityDocumentTypes)
    .where(eq(identityDocumentTypes.id, id));

  return { message: 'Tipo de documento eliminado correctamente' };
};
