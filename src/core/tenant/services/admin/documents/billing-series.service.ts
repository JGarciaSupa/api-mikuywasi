import { eq, asc, and, ne, desc } from 'drizzle-orm';
import { billingSeries, billingDocuments } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';

export type DocumentType = 'factura' | 'boleta' | 'nota_de_venta';

export interface CreateSeriesInput {
  branchId?: number;
  documentType: DocumentType;
  series: string;
  initialSequential?: number;
  lastSequential?: number;
  priceInclTax?: boolean;
  taxRate?: string;
  description?: string;
}

export interface UpdateSeriesInput {
  initialSequential?: number;
  lastSequential?: number;
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

function normalizeSequentialConfig(initialSequential?: number, lastSequential?: number) {
  const normalizedInitial = Math.max(1, Math.trunc(initialSequential ?? 1));
  const normalizedLast = Math.max(0, Math.trunc(lastSequential ?? (normalizedInitial - 1)));

  if (normalizedLast < normalizedInitial - 1) {
    throw new Error('El correlativo actual no puede ser menor al correlativo inicial menos 1');
  }

  return {
    initialSequential: normalizedInitial,
    lastSequential: normalizedLast,
  };
}

export async function createSeries(input: CreateSeriesInput) {
  const db = getTenantDb();

  const series = input.series.toUpperCase().trim();
  validateSeriesFormat(input.documentType, series);
  const priceInclTax = input.priceInclTax ??
    (input.documentType === 'boleta' || input.documentType === 'nota_de_venta');
  const { initialSequential, lastSequential } = normalizeSequentialConfig(
    input.initialSequential,
    input.lastSequential,
  );

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
      initialSequential,
      lastSequential,
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
  const [current] = await db.select().from(billingSeries).where(eq(billingSeries.id, id));
  if (!current) throw new Error('Serie no encontrada');

  const shouldUpdateSequentials =
    input.initialSequential !== undefined || input.lastSequential !== undefined;

  const sequentialConfig = shouldUpdateSequentials
    ? normalizeSequentialConfig(
        input.initialSequential ?? current.initialSequential,
        input.lastSequential ?? current.lastSequential,
      )
    : null;

  if (sequentialConfig) {
    const [latestDocument] = await db
      .select({ sequential: billingDocuments.sequential })
      .from(billingDocuments)
      .where(eq(billingDocuments.seriesId, id))
      .orderBy(desc(billingDocuments.sequential))
      .limit(1);

    const highestUsedSequential = latestDocument?.sequential ?? 0;

    if (sequentialConfig.lastSequential < highestUsedSequential) {
      throw new Error(
        `El correlativo actual no puede ser menor al último comprobante emitido (${String(highestUsedSequential).padStart(8, '0')})`
      );
    }

    if (sequentialConfig.initialSequential > highestUsedSequential + 1) {
      throw new Error(
        `El correlativo inicial no puede ser mayor al siguiente correlativo disponible (${String(highestUsedSequential + 1).padStart(8, '0')})`
      );
    }
  }

  const [row] = await db
    .update(billingSeries)
    .set({
      ...(sequentialConfig && {
        initialSequential: sequentialConfig.initialSequential,
        lastSequential: sequentialConfig.lastSequential,
      }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.priceInclTax !== undefined && { priceInclTax: input.priceInclTax }),
      ...(input.taxRate !== undefined && { taxRate: input.taxRate }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(billingSeries.id, id))
    .returning();

  return row;
}
