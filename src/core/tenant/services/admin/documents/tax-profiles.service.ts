import { eq, and, or, ilike, desc } from 'drizzle-orm';
import { customerTaxProfiles } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';

// Directorio INDEPENDIENTE de perfiles fiscales (RUC/DNI) — sin relación a
// Customer. Se busca por documento; si existe se reutiliza, si no se agrega.
// Un mismo RUC puede facturar a distintos clientes sin duplicarse aquí.

export async function searchTaxProfiles(search?: string, limit = 20) {
  const db = getTenantDb();
  if (!search?.trim()) {
    return db.select().from(customerTaxProfiles).orderBy(desc(customerTaxProfiles.createdAt)).limit(limit);
  }
  return db.select().from(customerTaxProfiles).where(or(
    ilike(customerTaxProfiles.documentNumber, `%${search.trim()}%`),
    ilike(customerTaxProfiles.legalName, `%${search.trim()}%`),
  )).orderBy(desc(customerTaxProfiles.createdAt)).limit(limit);
}

export async function findTaxProfile(documentType: string, documentNumber: string) {
  const db = getTenantDb();
  const [profile] = await db.select().from(customerTaxProfiles).where(and(
    eq(customerTaxProfiles.documentType, documentType),
    eq(customerTaxProfiles.documentNumber, documentNumber),
  ));
  return profile ?? null;
}

// Busca por documento; si existe lo reutiliza (y opcionalmente actualiza nombre/
// dirección si vinieron datos nuevos), si no existe lo crea.
export async function resolveOrCreateTaxProfile(data: {
  documentType: string;
  documentNumber: string;
  legalName?: string | null;
  taxAddress?: string | null;
}) {
  const db = getTenantDb();
  if (!data.documentType?.trim()) throw new Error('El tipo de documento es obligatorio');
  if (!data.documentNumber?.trim()) throw new Error('El número de documento es obligatorio');

  const documentType = data.documentType.trim();
  const documentNumber = data.documentNumber.trim();

  const existing = await findTaxProfile(documentType, documentNumber);
  if (existing) {
    // Reutiliza — solo completa datos que faltaban, no pisa lo ya guardado.
    if ((data.legalName && !existing.legalName) || (data.taxAddress && !existing.taxAddress)) {
      const [updated] = await db.update(customerTaxProfiles).set({
        legalName: existing.legalName ?? data.legalName ?? null,
        taxAddress: existing.taxAddress ?? data.taxAddress ?? null,
        updatedAt: new Date(),
      }).where(eq(customerTaxProfiles.id, existing.id)).returning();
      return { profile: updated, reused: true };
    }
    return { profile: existing, reused: true };
  }

  const [created] = await db.insert(customerTaxProfiles).values({
    documentType,
    documentNumber,
    legalName: data.legalName || null,
    taxAddress: data.taxAddress || null,
  }).returning();
  return { profile: created, reused: false };
}

export async function deleteTaxProfile(id: number) {
  const db = getTenantDb();
  await db.delete(customerTaxProfiles).where(eq(customerTaxProfiles.id, id));
}
