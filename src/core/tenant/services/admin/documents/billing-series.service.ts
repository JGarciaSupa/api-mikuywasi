import { eq, asc } from 'drizzle-orm';
import { billingSeries } from '../../../../../db/tenant/schema';
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

export async function listSeries() {
  const db = getTenantDb();
  return db.select().from(billingSeries).orderBy(asc(billingSeries.documentType), asc(billingSeries.series));
}

export async function getSeriesById(id: number) {
  const db = getTenantDb();
  const [row] = await db.select().from(billingSeries).where(eq(billingSeries.id, id));
  return row ?? null;
}

export async function createSeries(input: CreateSeriesInput) {
  const db = getTenantDb();

  const series = input.series.toUpperCase().trim();
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
