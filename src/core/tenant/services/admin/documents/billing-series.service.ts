import { eq, asc, and, ne } from 'drizzle-orm';
import { billingSeries, billingDocuments } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';

export type DocumentType = 'factura' | 'boleta' | 'nota_de_venta';

export interface CreateSeriesInput {
  branchId?: number;
  documentType: DocumentType;
  series: string;
  priceInclTax?: boolean;
  taxRate?: string;
  description?: string;
}

export interface UpdateSeriesInput {
  description?: string;
  priceInclTax?: boolean;
  taxRate?: string;
  isActive?: boolean;
}

export async function listSeries(branchId?: number) {
  const db = getTenantDb();
  if (branchId) {
    return db
      .select()
      .from(billingSeries)
      .where(eq(billingSeries.branchId, branchId))
      .orderBy(asc(billingSeries.documentType), asc(billingSeries.series));
  }
  return db.select().from(billingSeries).orderBy(asc(billingSeries.documentType), asc(billingSeries.series));
}

export async function getSeriesById(id: number) {
  const db = getTenantDb();
  const [row] = await db.select().from(billingSeries).where(eq(billingSeries.id, id));
  return row ?? null;
}

function validateSeriesFormat(documentType: DocumentType, series: string): void {
  if (documentType === 'factura' && !/^F\d{3}$/.test(series)) {
    throw new Error('La serie de factura debe tener formato F### (ejemplo: F001)');
  }
  if (documentType === 'boleta' && !/^B\d{3}$/.test(series)) {
    throw new Error('La serie de boleta debe tener formato B### (ejemplo: B001)');
  }
}

export async function createSeries(input: CreateSeriesInput) {
  const db = getTenantDb();

  const series = input.series.toUpperCase().trim();
  validateSeriesFormat(input.documentType, series);
  const priceInclTax = input.priceInclTax ??
    (input.documentType === 'boleta' || input.documentType === 'nota_de_venta');

  const [existing] = await db
    .select()
    .from(billingSeries)
    .where(eq(billingSeries.series, series));

  if (existing) {
    throw new Error(`La serie ${series} ya está registrada. Cada serie debe ser única.`);
  }

  const [row] = await db
    .insert(billingSeries)
    .values({
      branchId: input.branchId ?? 1,
      documentType: input.documentType,
      series,
      priceInclTax,
      taxRate: input.taxRate ?? '18',
      description: input.description ?? null,
    })
    .returning();

  return row;
}

export async function deleteSeries(id: number) {
  const db = getTenantDb();

  const [row] = await db.select().from(billingSeries).where(eq(billingSeries.id, id));
  if (!row) throw new Error('Serie no encontrada');

  const [activeDoc] = await db
    .select({ id: billingDocuments.id })
    .from(billingDocuments)
    .where(and(eq(billingDocuments.seriesId, id), ne(billingDocuments.status, 'voided')))
    .limit(1);

  if (activeDoc) {
    throw new Error('No se puede eliminar una serie con documentos activos. Anule los documentos primero.');
  }

  await db.delete(billingSeries).where(eq(billingSeries.id, id));
}

export async function updateSeries(id: number, input: UpdateSeriesInput) {
  const db = getTenantDb();
  const [row] = await db
    .update(billingSeries)
    .set({
      ...(input.description !== undefined && { description: input.description }),
      ...(input.priceInclTax !== undefined && { priceInclTax: input.priceInclTax }),
      ...(input.taxRate !== undefined && { taxRate: input.taxRate }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(billingSeries.id, id))
    .returning();

  if (!row) throw new Error('Serie no encontrada');
  return row;
}
