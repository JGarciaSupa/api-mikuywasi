import { eq, asc, and, ne, desc } from 'drizzle-orm';
import { billingSeries, billingDocuments, cashRegisterDocumentSeries, cashRegisters } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';

export type DocumentType = 'factura' | 'boleta' | 'nota_de_venta';
// El pivote y billingSeries aceptan además nota_de_credito (documento fiscal auto).
export type ReceiptDocumentType = 'factura' | 'boleta' | 'nota_de_venta' | 'nota_de_credito';

// Traduce el código del tipo de comprobante del MAESTRO (SUNAT) al enum interno.
// Los códigos SUNAT (01/03/07) van a facturación electrónica; cualquier otro
// (ej. "Cuenta Interna") cae a nota_de_venta, que es interno (no se emite a SUNAT).
export function documentTypeFromReceiptCode(code: string): ReceiptDocumentType {
  switch (code) {
    case '01': return 'factura';
    case '03': return 'boleta';
    case '07': return 'nota_de_credito';
    default: return 'nota_de_venta';
  }
}

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

// ── Series por caja (Caja ↔ Documento ↔ Serie) ─────────────────────────────────

export interface ResolvedSeries {
  id: number;
  series: string;
  documentType: string;
  lastSequential: number;
  priceInclTax: boolean;
  taxRate: string;
  source: 'register' | 'branch';
}

// Resuelve qué serie usar para un tipo de comprobante dado la caja del turno abierto.
// Estricto: solo cuenta la serie asignada explícitamente a la caja (pivote). Sin
// asignación = tipo desactivado para esa caja, sin caer a una serie de sucursal.
export async function resolveSeriesForRegister(
  registerId: number,
  documentType: DocumentType,
  _branchId: number,
): Promise<ResolvedSeries | null> {
  const db = getTenantDb();

  const [pivotRow] = await db
    .select({ series: billingSeries })
    .from(cashRegisterDocumentSeries)
    .innerJoin(billingSeries, eq(cashRegisterDocumentSeries.seriesId, billingSeries.id))
    .where(and(
      eq(cashRegisterDocumentSeries.registerId, registerId),
      eq(cashRegisterDocumentSeries.documentType, documentType),
      eq(cashRegisterDocumentSeries.isActive, true),
      eq(billingSeries.isActive, true),
    ))
    .limit(1);

  if (!pivotRow) return null;
  const s = pivotRow.series;
  return {
    id: s.id, series: s.series, documentType: s.documentType,
    lastSequential: s.lastSequential, priceInclTax: s.priceInclTax, taxRate: s.taxRate,
    source: 'register',
  };
}

// Lista los tipos de comprobante que esta caja puede emitir (tiene serie asignada
// y activa). Lo usa el frontend para no ofrecer al cajero tipos que su caja no
// tiene habilitados.
export async function listAvailableDocumentTypesForRegister(registerId: number): Promise<DocumentType[]> {
  const db = getTenantDb();
  const rows = await db
    .select({ documentType: cashRegisterDocumentSeries.documentType })
    .from(cashRegisterDocumentSeries)
    .innerJoin(billingSeries, eq(cashRegisterDocumentSeries.seriesId, billingSeries.id))
    .where(and(
      eq(cashRegisterDocumentSeries.registerId, registerId),
      eq(cashRegisterDocumentSeries.isActive, true),
      eq(billingSeries.isActive, true),
    ));
  return rows.map((r) => r.documentType as DocumentType);
}

export async function listSeriesForRegister(registerId: number) {
  const db = getTenantDb();
  return db
    .select({
      documentType: cashRegisterDocumentSeries.documentType,
      seriesId: billingSeries.id,
      series: billingSeries.series,
      lastSequential: billingSeries.lastSequential,
      receiptTypeCode: billingSeries.receiptTypeCode,
      description: billingSeries.description,
      isActive: cashRegisterDocumentSeries.isActive,
    })
    .from(cashRegisterDocumentSeries)
    .innerJoin(billingSeries, eq(cashRegisterDocumentSeries.seriesId, billingSeries.id))
    .where(eq(cashRegisterDocumentSeries.registerId, registerId))
    .orderBy(asc(cashRegisterDocumentSeries.documentType));
}

// ── Crear/enlazar un documento a una caja (tab Documentos de Caja) ─────────────
// El tipo viene del catálogo MAESTRO (receiptTypeCode); la serie/correlativo y el
// nombre custom (description) se crean acá, en el tenant. La serie es EXCLUSIVA
// de una caja: si ya la usa otra, se bloquea.

export interface CreateRegisterDocumentInput {
  registerId: number;
  receiptTypeCode: string;
  series: string;
  initialCorrelative?: number; // "siguiente a emitir"; lastSequential = este - 1
  description?: string | null;
}

// Enlaza (upsert) una serie a una caja para un tipo, dentro de una transacción.
async function linkSeriesToRegisterTx(
  tx: Parameters<Parameters<ReturnType<typeof getTenantDb>['transaction']>[0]>[0],
  registerId: number,
  documentType: ReceiptDocumentType,
  seriesId: number,
) {
  const [existing] = await tx
    .select()
    .from(cashRegisterDocumentSeries)
    .where(and(
      eq(cashRegisterDocumentSeries.registerId, registerId),
      eq(cashRegisterDocumentSeries.documentType, documentType),
    ));

  if (existing) {
    if (existing.seriesId !== seriesId) {
      await tx.update(cashRegisterDocumentSeries)
        .set({ seriesId, isActive: true, updatedAt: new Date() })
        .where(eq(cashRegisterDocumentSeries.id, existing.id));
    }
    return;
  }
  await tx.insert(cashRegisterDocumentSeries).values({ registerId, documentType, seriesId });
}

export async function createOrLinkRegisterDocument(input: CreateRegisterDocumentInput) {
  const db = getTenantDb();

  const series = input.series?.toUpperCase().trim();
  if (!series) throw new Error('La serie es requerida');
  if (!input.receiptTypeCode) throw new Error('El tipo de documento es requerido');

  const documentType = documentTypeFromReceiptCode(input.receiptTypeCode);
  const description = input.description?.trim() || null;

  const [register] = await db.select().from(cashRegisters).where(eq(cashRegisters.id, input.registerId));
  if (!register) throw new Error('Caja no encontrada');

  const initialSequential = Math.max(1, Math.trunc(input.initialCorrelative ?? 1));
  const lastSequential = initialSequential - 1;
  // boleta/nota_de_venta operan con precio con impuesto incluido; factura sin incluir.
  const priceInclTax = documentType === 'boleta' || documentType === 'nota_de_venta';

  return db.transaction(async (tx) => {
    const [existingSeries] = await tx.select().from(billingSeries).where(eq(billingSeries.series, series));

    if (existingSeries) {
      // ¿A qué caja está enlazada esa serie?
      const [link] = await tx.select().from(cashRegisterDocumentSeries)
        .where(eq(cashRegisterDocumentSeries.seriesId, existingSeries.id));
      if (link && link.registerId !== input.registerId) {
        throw new Error(`La serie ${series} ya está en uso por otra caja`);
      }

      // Es de esta caja (o aún sin enlazar) → actualizar datos base (edición).
      const [updated] = await tx.update(billingSeries).set({
        receiptTypeCode: input.receiptTypeCode,
        documentType,
        description: description ?? existingSeries.description,
        priceInclTax,
        isActive: true,
        updatedAt: new Date(),
      }).where(eq(billingSeries.id, existingSeries.id)).returning();

      await linkSeriesToRegisterTx(tx, input.registerId, documentType, existingSeries.id);
      return updated;
    }

    // No existe → crear la serie y enlazarla a esta caja.
    const [created] = await tx.insert(billingSeries).values({
      branchId: register.branchId,
      documentType,
      series,
      receiptTypeCode: input.receiptTypeCode,
      initialSequential,
      lastSequential,
      priceInclTax,
      taxRate: '18',
      description,
    }).returning();

    await linkSeriesToRegisterTx(tx, input.registerId, documentType, created.id);
    return created;
  });
}

export async function assignSeriesToRegister(registerId: number, documentType: DocumentType, seriesId: number) {
  const db = getTenantDb();

  const [register] = await db.select().from(cashRegisters).where(eq(cashRegisters.id, registerId));
  if (!register) throw new Error('Caja no encontrada');

  const [series] = await db.select().from(billingSeries).where(eq(billingSeries.id, seriesId));
  if (!series) throw new Error('Serie no encontrada');
  if (series.documentType !== documentType) {
    throw new Error(`La serie ${series.series} es de tipo '${series.documentType}', no '${documentType}'`);
  }
  if (series.branchId !== register.branchId) {
    throw new Error('La serie debe pertenecer a la misma sucursal que la caja');
  }

  const [existing] = await db
    .select()
    .from(cashRegisterDocumentSeries)
    .where(and(
      eq(cashRegisterDocumentSeries.registerId, registerId),
      eq(cashRegisterDocumentSeries.documentType, documentType),
    ));

  if (existing) {
    const [row] = await db
      .update(cashRegisterDocumentSeries)
      .set({ seriesId, isActive: true, updatedAt: new Date() })
      .where(eq(cashRegisterDocumentSeries.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(cashRegisterDocumentSeries)
    .values({ registerId, documentType, seriesId })
    .returning();
  return row;
}

export async function unassignSeriesFromRegister(registerId: number, documentType: DocumentType) {
  const db = getTenantDb();
  await db
    .delete(cashRegisterDocumentSeries)
    .where(and(
      eq(cashRegisterDocumentSeries.registerId, registerId),
      eq(cashRegisterDocumentSeries.documentType, documentType),
    ));
}
