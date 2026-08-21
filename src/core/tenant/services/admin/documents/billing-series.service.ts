import { eq, asc, and, ne, desc, inArray } from 'drizzle-orm';
import { cashRegisterDocumentSeries, cashRegisters, billingDocuments } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';

export type DocumentType = 'factura' | 'boleta' | 'nota_de_venta';
// El pivote acepta además nota_de_credito (documento fiscal auto).
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

export function receiptCodeFromDocumentType(type: string): string {
  switch (type) {
    case 'factura': return '01';
    case 'boleta': return '03';
    case 'nota_de_credito': return '07';
    default: return '00';
  }
}

export interface CreateSeriesInput {
  branchId?: number;
  documentType: DocumentType;
  series: string;
  initialSequential?: number;
  lastSequential?: number;
  description?: string;
}

export interface UpdateSeriesInput {
  initialSequential?: number;
  lastSequential?: number;
  description?: string;
  isActive?: boolean;
}

function addVirtualFields(s: any) {
  if (!s) return s;
  const docType = s.receiptTypeCode ? documentTypeFromReceiptCode(s.receiptTypeCode) : 'nota_de_venta';
  return {
    ...s,
    documentType: docType,
    priceInclTax: docType === 'boleta' || docType === 'nota_de_venta',
    taxRate: '18',
    // Mapped properties for backward compatibility
    isActive: s.isActive,
  };
}

export async function listSeries(branchId?: number) {
  const db = getTenantDb();
  if (branchId) {
    // Join with cash registers to filter by branch
    const rows = await db
      .select({
        id: cashRegisterDocumentSeries.id,
        registerId: cashRegisterDocumentSeries.registerId,
        series: cashRegisterDocumentSeries.series,
        description: cashRegisterDocumentSeries.description,
        receiptTypeCode: cashRegisterDocumentSeries.receiptTypeCode,
        initialSequential: cashRegisterDocumentSeries.initialSequential,
        lastSequential: cashRegisterDocumentSeries.lastSequential,
        isActiveFacturacion: cashRegisterDocumentSeries.isActiveFacturacion,
        isActive: cashRegisterDocumentSeries.isActive,
        createdAt: cashRegisterDocumentSeries.createdAt,
        updatedAt: cashRegisterDocumentSeries.updatedAt,
      })
      .from(cashRegisterDocumentSeries)
      .innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterDocumentSeries.registerId))
      .where(eq(cashRegisters.branchId, branchId))
      .orderBy(asc(cashRegisterDocumentSeries.receiptTypeCode), asc(cashRegisterDocumentSeries.series));

    return rows.map(addVirtualFields);
  }

  const rows = await db
    .select()
    .from(cashRegisterDocumentSeries)
    .orderBy(asc(cashRegisterDocumentSeries.receiptTypeCode), asc(cashRegisterDocumentSeries.series));

  return rows.map(addVirtualFields);
}

export async function getSeriesById(id: number) {
  const db = getTenantDb();
  const [row] = await db.select().from(cashRegisterDocumentSeries).where(eq(cashRegisterDocumentSeries.id, id));
  return row ? addVirtualFields(row) : null;
}

function validateSeriesFormat(documentType: string, series: string): void {
  // La serie en base de datos guarda exactamente 4 dígitos (ej: 0001).
  if (documentType === 'factura' || documentType === 'boleta') {
    if (!/^[fFbcFCBC\d][a-zA-Z\d]{3}$/.test(series) && !/^\d{4}$/.test(series)) {
      throw new Error(`La serie debe tener exactamente 4 caracteres alfanuméricos (recibido: ${series})`);
    }
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

export async function createSeries(_input: CreateSeriesInput) {
  throw new Error('La creación directa de series independientes ya no está soportada. Configure la serie directamente en una caja.');
}

export async function deleteSeries(id: number) {
  const db = getTenantDb();

  const [row] = await db.select().from(cashRegisterDocumentSeries).where(eq(cashRegisterDocumentSeries.id, id));
  if (!row) throw new Error('Serie no encontrada');

  const [activeDoc] = await db
    .select({ id: billingDocuments.id })
    .from(billingDocuments)
    .where(and(eq(billingDocuments.seriesId, id), ne(billingDocuments.status, 'voided')))
    .limit(1);

  if (activeDoc) {
    throw new Error('No se puede eliminar una serie con documentos activos. Anule los documentos primero.');
  }

  await db.delete(cashRegisterDocumentSeries).where(eq(cashRegisterDocumentSeries.id, id));
}

export async function updateSeries(id: number, input: UpdateSeriesInput) {
  const db = getTenantDb();
  const [current] = await db.select().from(cashRegisterDocumentSeries).where(eq(cashRegisterDocumentSeries.id, id));
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
    .update(cashRegisterDocumentSeries)
    .set({
      ...(sequentialConfig && {
        initialSequential: sequentialConfig.initialSequential,
        lastSequential: sequentialConfig.lastSequential,
      }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(cashRegisterDocumentSeries.id, id))
    .returning();

  return addVirtualFields(row);
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
export async function resolveSeriesForRegister(
  registerId: number,
  documentType: DocumentType,
  _branchId: number,
): Promise<ResolvedSeries | null> {
  const db = getTenantDb();

  // OJO: el mapeo código→tipo es muchos-a-uno (cualquier código que no sea
  // 01/03/07 es una nota de venta interna: '00', 'INTERNO', 'NV', etc.), así que
  // NO se puede buscar por el único código que devuelve receiptCodeFromDocumentType.
  // Se filtra en memoria con la MISMA función que usa listAvailableDocumentTypesForRegister,
  // para que "el tipo está disponible" y "el tipo resuelve serie" nunca se contradigan.
  const rows = await db
    .select()
    .from(cashRegisterDocumentSeries)
    .where(and(
      eq(cashRegisterDocumentSeries.registerId, registerId),
      eq(cashRegisterDocumentSeries.isActive, true),
    ))
    .orderBy(asc(cashRegisterDocumentSeries.id));

  const matches = rows.filter((r) => {
    const type = r.receiptTypeCode ? documentTypeFromReceiptCode(r.receiptTypeCode) : 'nota_de_venta';
    return type === documentType;
  });

  // Si hay varias series internas en la caja, se prefiere la del código canónico.
  const targetCode = receiptCodeFromDocumentType(documentType);
  const row = matches.find((r) => r.receiptTypeCode === targetCode) ?? matches[0];

  if (!row) return null;
  const priceInclTax = documentType === 'boleta' || documentType === 'nota_de_venta';
  return {
    id: row.id,
    series: row.series,
    documentType,
    lastSequential: row.lastSequential,
    priceInclTax,
    taxRate: '18',
    source: 'register',
  };
}

// Lista los tipos de comprobante que esta caja puede emitir (tiene serie asignada)
export interface AvailableDocumentType {
  documentType: DocumentType;
  receiptTypeCode: string | null;
  description: string | null;
}

// Lista los tipos de comprobante que esta caja puede emitir y están activos.
export async function listAvailableDocumentTypesForRegister(registerId: number): Promise<AvailableDocumentType[]> {
  const db = getTenantDb();
  const rows = await db
    .select()
    .from(cashRegisterDocumentSeries)
    .where(and(
      eq(cashRegisterDocumentSeries.registerId, registerId),
      eq(cashRegisterDocumentSeries.isActive, true),
    ));

  return rows.map((r) => {
    const docType = r.receiptTypeCode ? documentTypeFromReceiptCode(r.receiptTypeCode) : 'nota_de_venta';
    return {
      documentType: docType as DocumentType,
      receiptTypeCode: r.receiptTypeCode,
      description: r.description,
    };
  });
}

export async function listSeriesForRegister(registerId: number) {
  const db = getTenantDb();
  const rows = await db
    .select()
    .from(cashRegisterDocumentSeries)
    .where(eq(cashRegisterDocumentSeries.registerId, registerId));

  return rows.map((r) => {
    const docType = r.receiptTypeCode ? documentTypeFromReceiptCode(r.receiptTypeCode) : 'nota_de_venta';
    return {
      documentType: docType,
      seriesId: r.id,
      series: r.series,
      lastSequential: r.lastSequential,
      receiptTypeCode: r.receiptTypeCode,
      description: r.description,
      isActive: r.isActive,
      isActiveFacturacion: r.isActiveFacturacion,
    };
  });
}

// ── Crear/enlazar un documento a una caja ─────────────────────────────

export interface CreateRegisterDocumentInput {
  registerId: number;
  seriesId?: number;
  receiptTypeCode: string;
  series: string;
  initialCorrelative?: number; // "siguiente a emitir"; lastSequential = este - 1
  description?: string | null;
  isActive?: boolean;
  isActiveFacturacion?: boolean;
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

  validateSeriesFormat(documentType, series);

  return db.transaction(async (tx) => {
    let existingSeries;
    
    if (input.seriesId) {
      const [found] = await tx.select().from(cashRegisterDocumentSeries).where(eq(cashRegisterDocumentSeries.id, input.seriesId));
      existingSeries = found;
      if (!existingSeries) {
        throw new Error('La serie especificada no existe');
      }
    } else {
      // Validar que la caja NO tenga ya una serie asignada para este tipo de comprobante (solo al crear)
      const [existingLink] = await tx
        .select()
        .from(cashRegisterDocumentSeries)
        .where(and(
          eq(cashRegisterDocumentSeries.registerId, input.registerId),
          eq(cashRegisterDocumentSeries.receiptTypeCode, input.receiptTypeCode)
        ));
      
      if (existingLink) {
        throw new Error(`Ya existe una serie configurada para el tipo de comprobante '${documentType}' en esta caja. Edite el existente o elimínelo primero.`);
      }

      // Además, si no hay seriesId pero la serie ya existe, puede pertenecer a otra caja
      const [found] = await tx.select().from(cashRegisterDocumentSeries)
        .where(and(
          eq(cashRegisterDocumentSeries.series, series),
          eq(cashRegisterDocumentSeries.receiptTypeCode, input.receiptTypeCode)
        ));
      existingSeries = found;
    }

    if (existingSeries) {
      if (existingSeries.registerId !== input.registerId) {
        throw new Error(`La serie ${series} ya está en uso por otra caja`);
      }

      // Validar unicidad de la serie contra OTRAS series
      const [collision] = await tx.select().from(cashRegisterDocumentSeries)
        .where(and(
          eq(cashRegisterDocumentSeries.series, series),
          eq(cashRegisterDocumentSeries.receiptTypeCode, input.receiptTypeCode),
          ne(cashRegisterDocumentSeries.id, existingSeries.id) // excluir la actual
        ));
        
      if (collision) {
        throw new Error(`La serie ${series} ya está registrada en el sistema para el comprobante ${documentType}.`);
      }

      // Es de esta caja → actualizar datos base (edición).
      const [updated] = await tx.update(cashRegisterDocumentSeries).set({
        receiptTypeCode: input.receiptTypeCode,
        series,
        description: description ?? existingSeries.description,
        isActive: input.isActive ?? true,
        isActiveFacturacion: input.isActiveFacturacion ?? existingSeries.isActiveFacturacion,
        updatedAt: new Date(),
      }).where(eq(cashRegisterDocumentSeries.id, existingSeries.id)).returning();

      return addVirtualFields(updated);
    }

    // No existe → crear la serie
    const [created] = await tx.insert(cashRegisterDocumentSeries).values({
      registerId: input.registerId,
      series,
      receiptTypeCode: input.receiptTypeCode,
      initialSequential,
      lastSequential,
      description,
      isActive: input.isActive ?? true,
      isActiveFacturacion: input.isActiveFacturacion ?? true,
    }).returning();

    return addVirtualFields(created);
  });
}

export async function assignSeriesToRegister(_registerId: number, _documentType: DocumentType, _seriesId: number) {
  throw new Error('La asignación directa de series está deprecada. Configure la serie directamente en la caja.');
}

export async function unassignSeriesFromRegister(registerId: number, documentType: DocumentType) {
  const db = getTenantDb();

  // Mismo criterio que resolveSeriesForRegister: el código guardado puede ser
  // cualquiera que mapee a este documentType (ej. 'INTERNO' → nota_de_venta).
  const rows = await db
    .select({ id: cashRegisterDocumentSeries.id, receiptTypeCode: cashRegisterDocumentSeries.receiptTypeCode })
    .from(cashRegisterDocumentSeries)
    .where(eq(cashRegisterDocumentSeries.registerId, registerId));

  const ids = rows
    .filter((r) => (r.receiptTypeCode ? documentTypeFromReceiptCode(r.receiptTypeCode) : 'nota_de_venta') === documentType)
    .map((r) => r.id);

  if (ids.length === 0) return;

  await db
    .delete(cashRegisterDocumentSeries)
    .where(inArray(cashRegisterDocumentSeries.id, ids));
}
