import { eq, and, desc, like, or, gte, lte, count, sql, isNull } from 'drizzle-orm';
import {
  billingDocuments,
  billingDocumentLines,
  billingSeries,
  branches,
  tenantConfigs,
  orders,
  orderItems,
  orderSplits,
} from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum, roundMoney } from '../warehouse/shared/numbers';
import { resolveFacturadorConfig } from '../../../../../utils/resolve-facturador-config';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import type { AuditActor } from '../warehouse/types';
import { emitirComprobante, emitirNotaCredito, obtenerEmpresa, obtenerPdfBuffer, diagnosticarEmision, type CodigoMotivoNC } from '../../../../../utils/facturador-client';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  orderId: string;
  splitId?: number | null;
  documentType: 'factura' | 'boleta' | 'nota_de_venta';
  seriesId: number;
  buyerDocType?: 'RUC' | 'DNI' | 'CE';
  buyerDocNumber?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  notes?: string;
  createdBy?: string;
  actor?: AuditActor;
}

export interface ListDocumentsFilters {
  page?: number;
  limit?: number;
  branchId?: number;
  documentType?: string;
  includeRelated?: boolean;
  status?: string;
  orderId?: string;
  startDate?: string;
  endDate?: string;
  buyerDoc?: string;
  search?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function padSequential(n: number) {
  return String(n).padStart(8, '0');
}

// ── Número a letras (español, para leyenda SUNAT código 1000) ──────────────────

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS  = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function _letras(n: number): string {
  if (n === 0) return 'CERO';
  if (n < 0)   return 'MENOS ' + _letras(-n);
  if (n < 20)  return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10), u = n % 10;
    return d === 2 && u > 0 ? `VEINTI${UNIDADES[u]}` : u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
  }
  if (n < 1000) {
    const c = Math.floor(n / 100), r = n % 100;
    if (c === 1) return r === 0 ? 'CIEN' : `CIENTO ${_letras(r)}`;
    return r === 0 ? CENTENAS[c] : `${CENTENAS[c]} ${_letras(r)}`;
  }
  if (n < 1_000_000) {
    const m = Math.floor(n / 1000), r = n % 1000;
    const miles = m === 1 ? 'MIL' : `${_letras(m)} MIL`;
    return r === 0 ? miles : `${miles} ${_letras(r)}`;
  }
  const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
  const mill = m === 1 ? 'UN MILLÓN' : `${_letras(m)} MILLONES`;
  return r === 0 ? mill : `${mill} ${_letras(r)}`;
}

function montoEnLetras(monto: number, moneda = 'SOLES'): string {
  const entero    = Math.floor(monto);
  const centavos  = Math.round((monto - entero) * 100);
  return `SON ${_letras(entero)} CON ${String(centavos).padStart(2, '0')}/100 ${moneda}`;
}

interface LineCalc {
  productId: number | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  alternativesExtra: number;
  packagingFee: number;
  subtotal: number;
  taxAmount: number;
  lineTotal: number;
  alternativesDesc: string | null;
  notes: string | null;
  priceInclTax: boolean;
  taxRate: number;
}

function calcLine(
  productId: number | null,
  productName: string,
  quantity: number,
  unitPrice: number,
  selectedAlternatives: { name: string; extraPrice: number }[],
  packagingFee: number,
  notes: string | null,
  priceInclTax: boolean,
  taxRate: number
): LineCalc {
  const altExtra = selectedAlternatives.reduce((s, a) => s + toNum(a.extraPrice) * quantity, 0);
  const grossLine = unitPrice * quantity + altExtra + packagingFee * quantity;
  const rate = taxRate / 100;

  let subtotal: number;
  let taxAmount: number;
  let lineTotal: number;

  if (!priceInclTax) {
    subtotal = roundMoney(grossLine);
    taxAmount = roundMoney(subtotal * rate);
    lineTotal = roundMoney(subtotal + taxAmount);
  } else {
    lineTotal = roundMoney(grossLine);
    subtotal = roundMoney(lineTotal / (1 + rate));
    taxAmount = roundMoney(lineTotal - subtotal);
  }

  const altNames = selectedAlternatives.map((a) => a.name).join(', ');

  return {
    productId,
    productName,
    quantity,
    unitPrice,
    alternativesExtra: roundMoney(altExtra),
    packagingFee,
    subtotal,
    taxAmount,
    lineTotal,
    alternativesDesc: altNames || null,
    notes,
    priceInclTax,
    taxRate,
  };
}

// ── Emisor resolver ────────────────────────────────────────────────────────────

interface EmisorSnapshot {
  ruc: string;
  name: string;
  address: string;
  logoUrl: string | null;
}

async function resolveEmisor(db: ReturnType<typeof getTenantDb>, branchId: number): Promise<EmisorSnapshot> {
  // Logo desde nuestra propia DB (tenantConfigs.logo)
  const [config] = await db
    .select({ logo: tenantConfigs.logo })
    .from(tenantConfigs);

  try {
    // Empresa del facturador: Caso B (propia de la sucursal) o Caso A (tenant fallback)
    const { empresaId } = await resolveFacturadorConfig(db, branchId);
    const empresa = await obtenerEmpresa(empresaId);
    return {
      ruc: empresa.ruc,
      name: empresa.legalName,
      address: empresa.address ?? '',
      logoUrl: config?.logo ?? null,
    };
  } catch {
    // Si la empresa aún no está configurada o el facturador no responde, retornar vacío
    return { ruc: '', name: '', address: '', logoUrl: config?.logo ?? null };
  }
}

// ── Preview ────────────────────────────────────────────────────────────────────

export async function previewDocument(orderId: string, seriesId: number, splitId?: number | null) {
  const db = getTenantDb();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');
  if (order.status === 'cancelled') throw new Error('No se puede facturar un pedido cancelado');

  // Validar pago antes de mostrar preview
  if (splitId != null) {
    const [split] = await db
      .select({ paymentStatus: orderSplits.paymentStatus })
      .from(orderSplits)
      .where(and(eq(orderSplits.id, splitId), eq(orderSplits.orderId, orderId)));
    if (!split) throw new Error('Cuenta no encontrada');
    if (split.paymentStatus !== 'paid') {
      throw new Error('La cuenta debe estar pagada antes de emitir un comprobante');
    }
  } else {
    if (order.paymentStatus !== 'paid') {
      throw new Error('El pedido debe estar pagado antes de emitir un comprobante');
    }
  }

  const [series] = await db.select().from(billingSeries).where(eq(billingSeries.id, seriesId));
  if (!series || !series.isActive) throw new Error('Serie no encontrada o inactiva');

  const ois = splitId != null
    ? await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.splitId, splitId)))
    : await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), isNull(orderItems.splitId)));

  const priceInclTax = series.priceInclTax;
  const taxRate = toNum(series.taxRate);

  const lineCalcs = ois.map((oi) =>
    calcLine(
      oi.productId ?? null,
      oi.productName,
      oi.quantity,
      toNum(oi.unitPrice),
      (oi.selectedAlternatives as { name: string; extraPrice: number }[]) ?? [],
      toNum(oi.packagingFee),
      oi.notes ?? null,
      priceInclTax,
      taxRate
    )
  );

  const totalSubtotal = roundMoney(lineCalcs.reduce((s, l) => s + l.subtotal, 0));
  const totalTax = roundMoney(lineCalcs.reduce((s, l) => s + l.taxAmount, 0));
  const total = roundMoney(lineCalcs.reduce((s, l) => s + l.lineTotal, 0));

  return {
    order,
    series,
    lines: lineCalcs,
    totals: { subtotal: totalSubtotal, taxAmount: totalTax, total },
    nextDocumentNumber: `${series.series}-${padSequential(series.lastSequential + 1)}`,
  };
}

// ── Create document ────────────────────────────────────────────────────────────

export async function createDocument(input: CreateDocumentInput) {
  const db = getTenantDb();

  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
  if (!order) throw new Error('Pedido no encontrado');
  if (order.status === 'cancelled') throw new Error('No se puede facturar un pedido cancelado');

  // Bloquear facturación hasta que el pago esté completo
  if (input.splitId != null) {
    const [split] = await db
      .select({ paymentStatus: orderSplits.paymentStatus, orderId: orderSplits.orderId })
      .from(orderSplits)
      .where(and(eq(orderSplits.id, input.splitId), eq(orderSplits.orderId, input.orderId)));
    if (!split) throw new Error('Cuenta no encontrada');
    if (split.paymentStatus !== 'paid') {
      throw new Error('La cuenta debe estar pagada antes de emitir un comprobante');
    }
  } else {
    if (order.paymentStatus !== 'paid') {
      throw new Error('El pedido debe estar pagado antes de emitir un comprobante');
    }
  }

  // Verificar documento existente por (orderId, splitId) para evitar duplicados
  const existingDocWhere = input.splitId != null
    ? and(
        eq(billingDocuments.orderId, input.orderId),
        eq(billingDocuments.splitId, input.splitId),
        sql`${billingDocuments.status} != 'voided'`
      )
    : and(
        eq(billingDocuments.orderId, input.orderId),
        isNull(billingDocuments.splitId),
        sql`${billingDocuments.status} != 'voided'`
      );

  const existingDoc = await db
    .select({ id: billingDocuments.id })
    .from(billingDocuments)
    .where(existingDocWhere)
    .limit(1);

  if (existingDoc.length) {
    throw new Error(
      input.splitId != null
        ? 'Esta cuenta ya tiene un documento de venta activo'
        : 'El pedido ya tiene un documento de venta activo'
    );
  }

  if (input.documentType === 'factura') {
    if (!input.buyerDocType || input.buyerDocType !== 'RUC') {
      throw new Error('La factura requiere tipo de documento RUC');
    }
    if (!input.buyerDocNumber || input.buyerDocNumber.length !== 11) {
      throw new Error('La factura requiere RUC de 11 dígitos');
    }
    if (!input.buyerName) throw new Error('La factura requiere razón social del comprador');
  }

  if ((input.documentType === 'boleta' || input.documentType === 'nota_de_venta') && input.buyerDocType) {
    if (!['DNI', 'RUC', 'CE'].includes(input.buyerDocType)) {
      throw new Error('Tipo de documento inválido. Use DNI, RUC o CE');
    }
  }

  // Calcular líneas antes de la transacción — filtrar por split si aplica
  const ois = input.splitId != null
    ? await db.select().from(orderItems).where(and(eq(orderItems.orderId, input.orderId), eq(orderItems.splitId, input.splitId)))
    : await db.select().from(orderItems).where(and(eq(orderItems.orderId, input.orderId), isNull(orderItems.splitId)));

  // series.priceInclTax y taxRate los necesitamos antes; los leemos sin lock
  const [seriesPreview] = await db
    .select({ priceInclTax: billingSeries.priceInclTax, taxRate: billingSeries.taxRate })
    .from(billingSeries)
    .where(eq(billingSeries.id, input.seriesId));

  if (!seriesPreview) throw new Error('Serie no encontrada o inactiva');

  const priceInclTax = seriesPreview.priceInclTax;
  const taxRate = toNum(seriesPreview.taxRate);

  const lineCalcs = ois.map((oi) =>
    calcLine(
      oi.productId ?? null,
      oi.productName,
      oi.quantity,
      toNum(oi.unitPrice),
      (oi.selectedAlternatives as { name: string; extraPrice: number }[]) ?? [],
      toNum(oi.packagingFee),
      oi.notes ?? null,
      priceInclTax,
      taxRate
    )
  );

  const totalSubtotal = roundMoney(lineCalcs.reduce((s, l) => s + l.subtotal, 0));
  const totalTax = roundMoney(lineCalcs.reduce((s, l) => s + l.taxAmount, 0));
  const total = roundMoney(lineCalcs.reduce((s, l) => s + l.lineTotal, 0));

  // Transacción: reservar correlativo + insertar documento + líneas
  const { docId } = await db.transaction(async (tx) => {
    const [series] = await tx
      .select()
      .from(billingSeries)
      .where(eq(billingSeries.id, input.seriesId))
      .for('update');

    if (!series || !series.isActive) throw new Error('Serie no encontrada o inactiva');
    if (series.documentType !== input.documentType) {
      throw new Error(
        `La serie '${series.series}' es de tipo '${series.documentType}', no '${input.documentType}'`
      );
    }

    const sequential = series.lastSequential + 1;
    const documentNumber = `${series.series}-${padSequential(sequential)}`;

    await tx
      .update(billingSeries)
      .set({ lastSequential: sequential, updatedAt: new Date() })
      .where(eq(billingSeries.id, series.id));

    const [doc] = await tx
      .insert(billingDocuments)
      .values({
        branchId: order.branchId,
        orderId: input.orderId,
        splitId: input.splitId ?? null,
        seriesId: series.id,
        documentType: input.documentType,
        series: series.series,
        sequential,
        documentNumber,
        buyerDocType: input.buyerDocType ?? null,
        buyerDocNumber: input.buyerDocNumber ?? null,
        buyerName: input.buyerName ?? null,
        buyerAddress: input.buyerAddress ?? null,
        buyerEmail: input.buyerEmail ?? null,
        subtotal: String(totalSubtotal),
        taxRate: String(taxRate),
        taxAmount: String(totalTax),
        total: String(total),
        status: 'issued',
        notes: input.notes ?? null,
        createdBy: input.createdBy ?? null,
        issuedAt: new Date(),
      })
      .returning();

    const lineRows = lineCalcs.map((l) => ({
      documentId: doc.id,
      productId: l.productId,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: String(l.unitPrice),
      alternativesDesc: l.alternativesDesc,
      packagingFee: String(l.packagingFee),
      subtotal: String(l.subtotal),
      taxAmount: String(l.taxAmount),
      lineTotal: String(l.lineTotal),
      notes: l.notes,
    }));

    await tx.insert(billingDocumentLines).values(lineRows);

    return { docId: doc.id };
  });

  // Emisión electrónica SUNAT (fuera de la transacción — el correlativo ya está consumido)
  if (input.documentType === 'factura' || input.documentType === 'boleta') {
    const [savedDoc] = await db
      .select()
      .from(billingDocuments)
      .where(eq(billingDocuments.id, docId));

    if (savedDoc) {
      await emitirYActualizarDoc(db, savedDoc, lineCalcs, taxRate);
    }
  }

  // Retornar el documento con campos SUNAT ya actualizados
  const [finalDoc] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, docId));

  const finalLines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, docId));

  if (finalDoc) {
    const typeLabel = finalDoc.documentType === 'factura' ? 'Factura' : finalDoc.documentType === 'boleta' ? 'Boleta' : 'Nota de venta';
    await writeAuditLog({
      tableName: 'billing_documents',
      operation: 'INSERT',
      recordId: finalDoc.id,
      afterData: { id: finalDoc.id, documentNumber: finalDoc.documentNumber, documentType: finalDoc.documentType, total: finalDoc.total, orderId: finalDoc.orderId },
      userId: input.actor?.userId,
      userName: input.actor?.userName ?? input.createdBy ?? null,
      module: 'facturacion',
      description: `${typeLabel} ${finalDoc.documentNumber} emitida${finalDoc.buyerName ? ` — ${finalDoc.buyerName}` : ''} — S/ ${finalDoc.total} (pedido #${finalDoc.orderId})`,
    });
  }

  return { document: finalDoc, lines: finalLines };
}

// ── SUNAT emission helper ──────────────────────────────────────────────────────

type TenantDb = ReturnType<typeof getTenantDb>;

async function emitirYActualizarDoc(
  db: TenantDb,
  doc: typeof billingDocuments.$inferSelect,
  lineCalcs: LineCalc[],
  taxRate: number,
): Promise<void> {
  let sunatUpdate: Record<string, unknown>;

  try {
    const { ruc } = await resolveFacturadorConfig(db, doc.branchId);

    const tipoDoc = doc.documentType === 'factura' ? '01' : '03';
    const buyerTipoDoc = doc.buyerDocType === 'RUC' ? '6' : doc.buyerDocType === 'DNI' ? '1' : '0';

    const payload = {
      emisor: { ruc },
      cliente: {
        tipo_documento: buyerTipoDoc,
        numero_documento: doc.buyerDocNumber ?? '00000000',
        razon_social: doc.buyerName ?? 'CLIENTE FINAL',
        ...(doc.buyerAddress ? { direccion: doc.buyerAddress } : {}),
      },
      comprobante: {
        tipo_doc: tipoDoc as '01' | '03',
        serie: doc.series,
        correlativo: String(doc.sequential).padStart(8, '0'),
        fecha_emision: new Date(doc.issuedAt!).toISOString().replace('Z', '-05:00'),
        moneda: doc.currency,
      },
      totales: {
        gravadas: toNum(doc.subtotal),
        igv: toNum(doc.taxAmount),
        total_impuestos: toNum(doc.taxAmount),
        valor_venta: toNum(doc.subtotal),
        subtotal: toNum(doc.total),
        total: toNum(doc.total),
      },
      leyenda: montoEnLetras(toNum(doc.total), doc.currency === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES'),
      detalles: lineCalcs.map((l, i) => {
        // l.subtotal = total de línea SIN IGV (correcto para ambos priceInclTax)
        // l.lineTotal = total de línea CON IGV
        // Derivamos precios unitarios desde los totales para evitar errores con priceInclTax
        const valorUnitario = roundMoney(l.subtotal / l.quantity);
        const precioUnitario = roundMoney(l.lineTotal / l.quantity);
        return {
          codigo: String(l.productId ?? i + 1),
          unidad_medida: 'NIU',
          descripcion: l.alternativesDesc
            ? `${l.productName} (${l.alternativesDesc})`
            : l.productName,
          cantidad: l.quantity,
          valor_unitario: valorUnitario,
          valor_venta: l.subtotal,
          base_igv: l.subtotal,
          porcentaje_igv: taxRate,
          igv: l.taxAmount,
          tipo_afectacion: '10',
          total_impuestos: l.taxAmount,
          precio_unitario: precioUnitario,
        };
      }),
    };

    const res = await emitirComprobante(payload);

    if (!res.success) {
      const logData: Record<string, unknown> = {
        doc:           `${doc.documentType} ${doc.documentNumber}`,
        ruc,
        responseCode:  res.data?.responseCode,
        responseMsg:   res.data?.responseMessage,
        tipo_error:    res.data?.tipo_error,
        error_detalle: res.data?.error_detalle,
        notes:         res.data?.notes,
        diagnostico:   res.data?.diagnostico,
      };
      // Para HTTP 400: decodificar y loguear el XML enviado a SUNAT para inspección
      if (res.data?.tipo_error === 'HTTP_ERROR' && res.data?.xmlBase64) {
        logData['xml_enviado'] = Buffer.from(res.data.xmlBase64, 'base64').toString('utf-8');
      }
      console.error('[SUNAT RECHAZO]', JSON.stringify(logData, null, 2));
    }

    // Cuando SUNAT rechaza, armar un mensaje completo con tipo + detalle para facilitar el debug
    let sunatMsg = res.data.responseMessage ?? null;
    if (!res.success && res.data.tipo_error) {
      const parts: string[] = [`[${res.data.tipo_error}]`];
      if (sunatMsg) parts.push(sunatMsg);
      if (res.data.error_detalle?.message && res.data.error_detalle.message !== sunatMsg) {
        parts.push(`Detalle: ${res.data.error_detalle.message}`);
      }
      if (res.data.notes?.length) parts.push(`Notas: ${res.data.notes.join(' | ')}`);
      sunatMsg = parts.join(' — ');
    }

    sunatUpdate = {
      sunat_status: res.success ? 'ACEPTADO' : 'RECHAZADO',
      sunat_code: res.data.responseCode ?? null,
      sunat_message: sunatMsg,
      xml_hash: res.data.hash ?? null,
      xml_filename: res.data.xmlFilename ?? null,
      facturador_comprobante_id: res.data.id ?? null,
      updated_at: new Date(),
    };
  } catch (err: any) {
    sunatUpdate = {
      sunat_status: 'ERROR',
      sunat_message: err?.message ?? 'Error desconocido al conectar con el facturador',
      updated_at: new Date(),
    };
  }

  await db
    .update(billingDocuments)
    .set({
      sunatStatus: sunatUpdate['sunat_status'] as string,
      sunatCode: sunatUpdate['sunat_code'] as string | null,
      sunatMessage: sunatUpdate['sunat_message'] as string | null,
      xmlHash: sunatUpdate['xml_hash'] as string | null,
      xmlFilename: sunatUpdate['xml_filename'] as string | null,
      facturadorComprobanteId: sunatUpdate['facturador_comprobante_id'] as number | null,
      updatedAt: sunatUpdate['updated_at'] as Date,
    })
    .where(eq(billingDocuments.id, doc.id));
}

// ── List documents ─────────────────────────────────────────────────────────────

export async function listDocuments(filters: ListDocumentsFilters) {
  const db = getTenantDb();
  const { page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];

  if (filters.branchId) conditions.push(eq(billingDocuments.branchId, filters.branchId));
  if (!filters.includeRelated && !filters.documentType) {
    conditions.push(sql`${billingDocuments.documentType} != 'nota_de_credito'`);
  }
  if (filters.documentType) conditions.push(eq(billingDocuments.documentType, filters.documentType as any));
  if (filters.status) conditions.push(eq(billingDocuments.status, filters.status as any));
  if (filters.orderId) conditions.push(eq(billingDocuments.orderId, filters.orderId));
  if (filters.startDate) conditions.push(gte(billingDocuments.issuedAt, new Date(filters.startDate)));
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(billingDocuments.issuedAt, end));
  }
  if (filters.buyerDoc) conditions.push(like(billingDocuments.buyerDocNumber, `%${filters.buyerDoc}%`));
  if (filters.search) {
    conditions.push(
      or(
        like(billingDocuments.documentNumber, `%${filters.search}%`),
        like(billingDocuments.buyerName, `%${filters.search}%`)
      )!
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const data = await (where
    ? db.select().from(billingDocuments).where(where)
    : db.select().from(billingDocuments))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(billingDocuments.issuedAt));

  const [{ total }] = await (where
    ? db.select({ total: count() }).from(billingDocuments).where(where)
    : db.select({ total: count() }).from(billingDocuments));

  return {
    data,
    pagination: { total, totalPages: Math.ceil(total / limit), currentPage: page, limit },
  };
}

export async function getRelatedDocuments(id: number) {
  const db = getTenantDb();

  const [current] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, id));

  if (!current) throw new Error('Documento no encontrado');

  const baseDocumentId = current.referencedDocumentId ?? current.id;

  const [baseDocument] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, baseDocumentId));

  if (!baseDocument) throw new Error('Documento base no encontrado');

  const relatedDocuments = await db
    .select()
    .from(billingDocuments)
    .where(
      and(
        eq(billingDocuments.referencedDocumentId, baseDocumentId),
        sql`${billingDocuments.documentType} = 'nota_de_credito'`
      )
    )
    .orderBy(desc(billingDocuments.issuedAt));

  return {
    baseDocument,
    relatedDocuments,
  };
}

// ── Get document ───────────────────────────────────────────────────────────────

export async function getDocumentById(id: number) {
  const db = getTenantDb();
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) return null;
  const lines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, id));
  return { ...doc, lines };
}

// ── Retry SUNAT emission ───────────────────────────────────────────────────────

export async function retryDocument(id: number) {
  const db = getTenantDb();

  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status === 'voided') throw new Error('No se puede reintentar un documento anulado');
  if (doc.documentType === 'nota_de_venta') {
    throw new Error('Las notas de venta no se envían a SUNAT');
  }
  if (doc.sunatStatus === 'ACEPTADO') {
    throw new Error('El documento ya fue aceptado por SUNAT');
  }

  const lines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, id));

  const taxRate = toNum(doc.taxRate);

  const lineCalcs: LineCalc[] = lines.map((l) => ({
    productId: l.productId ?? null,
    productName: l.productName,
    quantity: l.quantity,
    unitPrice: toNum(l.unitPrice),
    alternativesExtra: 0,
    packagingFee: toNum(l.packagingFee),
    subtotal: toNum(l.subtotal),
    taxAmount: toNum(l.taxAmount),
    lineTotal: toNum(l.lineTotal),
    alternativesDesc: l.alternativesDesc ?? null,
    notes: l.notes ?? null,
    priceInclTax: true,
    taxRate,
  }));

  // send() en el facturador es idempotente: upsert por xml_filename.
  // Si el comprobante ya existe, lo re-firma y re-envía a SUNAT actualizando el registro.
  await emitirYActualizarDoc(db, doc, lineCalcs, taxRate);

  const [updated] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  return { document: updated, lines };
}

// ── Correct buyer data and retry ──────────────────────────────────────────────

export interface BuyerCorrection {
  buyerDocType?: 'RUC' | 'DNI' | 'CE' | null;
  buyerDocNumber?: string | null;
  buyerName?: string | null;
  buyerAddress?: string | null;
  buyerEmail?: string | null;
  notes?: string | null;
}

export async function correctAndRetryDocument(id: number, buyer: BuyerCorrection) {
  const db = getTenantDb();

  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status === 'voided') throw new Error('No se puede corregir un documento anulado');
  if (doc.documentType === 'nota_de_venta') throw new Error('Las notas de venta no se envían a SUNAT');
  if (doc.sunatStatus === 'ACEPTADO') throw new Error('El documento ya fue aceptado por SUNAT');

  if (doc.documentType === 'factura') {
    const ruc = buyer.buyerDocNumber ?? doc.buyerDocNumber;
    const tipo = buyer.buyerDocType ?? doc.buyerDocType;
    if (tipo !== 'RUC' || !ruc || ruc.length !== 11) {
      throw new Error('La factura requiere tipo RUC con 11 dígitos');
    }
  }

  if (doc.documentType === 'boleta' && buyer.buyerDocType) {
    if (!['DNI', 'RUC', 'CE'].includes(buyer.buyerDocType)) {
      throw new Error('Tipo de documento inválido para boleta. Use DNI, RUC o CE');
    }
  }

  // Actualizar los campos del comprador en la BD
  await db
    .update(billingDocuments)
    .set({
      buyerDocType: buyer.buyerDocType !== undefined ? buyer.buyerDocType : doc.buyerDocType,
      buyerDocNumber: buyer.buyerDocNumber !== undefined ? buyer.buyerDocNumber : doc.buyerDocNumber,
      buyerName: buyer.buyerName !== undefined ? buyer.buyerName : doc.buyerName,
      buyerAddress: buyer.buyerAddress !== undefined ? buyer.buyerAddress : doc.buyerAddress,
      buyerEmail: buyer.buyerEmail !== undefined ? buyer.buyerEmail : doc.buyerEmail,
      notes: buyer.notes !== undefined ? buyer.notes : doc.notes,
      updatedAt: new Date(),
    })
    .where(eq(billingDocuments.id, id));

  const [corrected] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  const lines = await db.select().from(billingDocumentLines).where(eq(billingDocumentLines.documentId, id));

  const taxRate = toNum(corrected.taxRate);
  const lineCalcs: LineCalc[] = lines.map((l) => ({
    productId: l.productId ?? null,
    productName: l.productName,
    quantity: l.quantity,
    unitPrice: toNum(l.unitPrice),
    alternativesExtra: 0,
    packagingFee: toNum(l.packagingFee),
    subtotal: toNum(l.subtotal),
    taxAmount: toNum(l.taxAmount),
    lineTotal: toNum(l.lineTotal),
    alternativesDesc: l.alternativesDesc ?? null,
    notes: l.notes ?? null,
    priceInclTax: true,
    taxRate,
  }));

  await emitirYActualizarDoc(db, corrected, lineCalcs, taxRate);

  const [final] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  return { document: final, lines };
}

// ── PDF proxy ──────────────────────────────────────────────────────────────────

export async function getDocumentPdf(id: number): Promise<Buffer> {
  const db = getTenantDb();

  const [doc] = await db
    .select({ facturadorComprobanteId: billingDocuments.facturadorComprobanteId })
    .from(billingDocuments)
    .where(eq(billingDocuments.id, id));

  if (!doc) throw new Error('Documento no encontrado');
  if (!doc.facturadorComprobanteId) {
    throw new Error('El documento aún no tiene un comprobante electrónico generado');
  }

  return obtenerPdfBuffer(doc.facturadorComprobanteId);
}

// ── Receipt (datos enriquecidos para generar PDF/ticket) ──────────────────────

export async function getDocumentReceipt(id: number) {
  const db = getTenantDb();

  const [doc] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, id));

  if (!doc) return null;

  const lines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, id));

  // Datos de la sucursal para el encabezado del comprobante
  const [branch] = await db
    .select({
      name: branches.name,
      phone: branches.phone,
      email: branches.email,
      address: branches.address,
    })
    .from(branches)
    .where(eq(branches.id, doc.branchId));

  // Emisor siempre desde el microservicio facturador (empresa SUNAT configurada)
  const emisor = await resolveEmisor(db, doc.branchId);

  let paymentSummary: {
    paymentMethod: string | null;
    retentionPercentage: string;
    retentionAmount: string;
    chargedTotal: string;
  } | null = null;

  if (doc.splitId != null) {
    const [split] = await db
      .select({
        paymentMethod: orderSplits.paymentMethod,
        retentionPercentage: orderSplits.retentionPercentage,
        retentionAmount: orderSplits.retentionAmount,
        total: orderSplits.total,
      })
      .from(orderSplits)
      .where(and(eq(orderSplits.id, doc.splitId), eq(orderSplits.orderId, doc.orderId)));

    if (split) {
      paymentSummary = {
        paymentMethod: split.paymentMethod ?? null,
        retentionPercentage: split.retentionPercentage ?? '0.00',
        retentionAmount: split.retentionAmount ?? '0.00',
        chargedTotal: split.total ?? doc.total,
      };
    }
  } else {
    const [order] = await db
      .select({
        paymentMethod: orders.paymentMethod,
        retentionPercentage: orders.retentionPercentage,
        retentionAmount: orders.retentionAmount,
        total: orders.total,
      })
      .from(orders)
      .where(eq(orders.id, doc.orderId));

    if (order) {
      paymentSummary = {
        paymentMethod: order.paymentMethod ?? null,
        retentionPercentage: order.retentionPercentage ?? '0.00',
        retentionAmount: order.retentionAmount ?? '0.00',
        chargedTotal: order.total ?? doc.total,
      };
    }
  }

  return {
    document: doc,
    lines,
    emisor,
    branch: {
      name: branch?.name ?? '',
      phone: branch?.phone ?? null,
      email: branch?.email ?? null,
      address: branch?.address?.fullAddress ?? null,
    },
    paymentSummary,
  };
}

// ── Void document ──────────────────────────────────────────────────────────────

// SUNAT requiere fechas en zona Lima (UTC-5), no en UTC
function limaDateStr(d: Date): string {
  const lima = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return lima.toISOString().slice(0, 10);
}

function resolveParentSunatStateAfterVoid(
  creditNoteStatus: 'ACEPTADO' | 'RECHAZADO' | 'ERROR' | null,
  creditNoteNumber: string | null,
) {
  if (creditNoteStatus !== 'ACEPTADO') return {};

  return {
    sunatStatus: 'RECHAZADO' as const,
    sunatCode: null,
    sunatMessage: creditNoteNumber
      ? `Comprobante anulado mediante Nota de Crédito ${creditNoteNumber} aceptada por SUNAT`
      : 'Comprobante anulado mediante Nota de Crédito aceptada por SUNAT',
  };
}

export async function voidDocument(id: number, reason: string, cancelOrder = false) {
  const db = getTenantDb();
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status !== 'issued') throw new Error(`No se puede anular un documento en estado '${doc.status}'`);
  if (!reason?.trim()) throw new Error('Se requiere un motivo de anulación');

  let creditNoteNumber: string | null = null;
  let creditNoteStatus: 'ACEPTADO' | 'RECHAZADO' | 'ERROR' | null = null;

  // SUNAT: facturas y boletas aceptadas se anulan con Nota de Crédito (tipo 07).
  if (
    (doc.documentType === 'factura' || doc.documentType === 'boleta') &&
    doc.sunatStatus === 'ACEPTADO'
  ) {
    const nc = await createCreditNoteForVoid(db, doc, reason.trim());
    creditNoteNumber = nc.document?.documentNumber ?? null;
    creditNoteStatus = nc.document?.sunatStatus as 'ACEPTADO' | 'RECHAZADO' | 'ERROR' | null;
  }

  // Anular localmente después de emitir la NC, porque createNotaCredito valida que
  // el documento original aún no esté marcado como voided.
  await db
    .update(billingDocuments)
    .set({
      status: 'voided',
      voidedAt: new Date(),
      voidedReason: reason.trim(),
      voidedTicket: creditNoteNumber,
      voidedSunatStatus: creditNoteStatus,
      ...resolveParentSunatStateAfterVoid(creditNoteStatus, creditNoteNumber),
      updatedAt: new Date(),
    })
    .where(eq(billingDocuments.id, id));

  // Cancelar pedido asociado si se solicitó (revierte descuento de stock)
  if (cancelOrder) {
    const { updateOrderStatus } = await import('../documents/order.service');
    await updateOrderStatus(doc.orderId, 'cancelled');
  }

  const [final] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  return final;
}

async function createCreditNoteForVoid(
  db: TenantDb,
  doc: typeof billingDocuments.$inferSelect,
  reason: string,
) {
  const seriesId = await ensureCreditNoteSeries(db, doc);
  const nc = await createNotaCredito({
    referencedDocumentId: doc.id,
    seriesId,
    motivo: '01',
    motivoDescripcion: reason || 'ANULACION DE LA OPERACION',
    notes: `Anulación de ${doc.documentNumber}`,
    createdBy: 'system',
  });

  if (nc.document?.sunatStatus !== 'ACEPTADO') {
    throw new Error(`SUNAT no aceptó la Nota de Crédito: ${nc.document?.sunatMessage ?? 'sin detalle'}`);
  }

  return nc;
}

async function ensureCreditNoteSeries(
  db: TenantDb,
  doc: typeof billingDocuments.$inferSelect,
): Promise<number> {
  const seriesCode = doc.documentType === 'factura' ? 'FC01' : 'BC01';

  const [existing] = await db
    .select()
    .from(billingSeries)
    .where(eq(billingSeries.series, seriesCode))
    .limit(1);

  if (existing) {
    if (!existing.isActive) {
      const [updated] = await db
        .update(billingSeries)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(billingSeries.id, existing.id))
        .returning();
      return updated.id;
    }
    return existing.id;
  }

  const [created] = await db
    .insert(billingSeries)
    .values({
      branchId: doc.branchId,
      documentType: 'nota_de_credito',
      series: seriesCode,
      priceInclTax: true,
      taxRate: doc.taxRate,
      description: doc.documentType === 'factura'
        ? 'Nota de crédito para facturas'
        : 'Nota de crédito para boletas',
    })
    .returning();

  return created.id;
}

async function emitAndUpdateCreditNote(
  db: TenantDb,
  savedNC: typeof billingDocuments.$inferSelect,
  originalDoc: typeof billingDocuments.$inferSelect,
  lines: typeof billingDocumentLines.$inferSelect[],
  motivo: CodigoMotivoNC,
  motivoDescripcion: string,
) {
  const taxRate = toNum(savedNC.taxRate);
  let sunatUpdate: Record<string, unknown>;

  try {
    const { ruc } = await resolveFacturadorConfig(db, savedNC.branchId);

    const tipoDocOriginal = originalDoc.documentType === 'factura' ? '01' : '03';
    const buyerTipoDoc = savedNC.buyerDocType === 'RUC' ? '6' : savedNC.buyerDocType === 'DNI' ? '1' : '0';

    const lineCalcs = lines.map((l) => {
      const subtotal = toNum(l.subtotal);
      const taxAmount = toNum(l.taxAmount);
      const lineTotal = toNum(l.lineTotal);
      const qty = l.quantity;
      return {
        codigo: String(l.productId ?? l.id),
        unidad_medida: 'NIU',
        descripcion: l.alternativesDesc ? `${l.productName} (${l.alternativesDesc})` : l.productName,
        cantidad: qty,
        valor_unitario: roundMoney(subtotal / qty),
        valor_venta: subtotal,
        base_igv: subtotal,
        porcentaje_igv: taxRate,
        igv: taxAmount,
        tipo_afectacion: '10',
        total_impuestos: taxAmount,
        precio_unitario: roundMoney(lineTotal / qty),
      };
    });

    const res = await emitirNotaCredito({
      emisor: { ruc },
      cliente: {
        tipo_documento: buyerTipoDoc,
        numero_documento: savedNC.buyerDocNumber ?? '00000000',
        razon_social: savedNC.buyerName ?? 'CLIENTE FINAL',
        ...(savedNC.buyerAddress ? { direccion: savedNC.buyerAddress } : {}),
      },
      comprobante: {
        tipo_doc: '07',
        serie: savedNC.series,
        correlativo: String(savedNC.sequential).padStart(8, '0'),
        fecha_emision: new Date(savedNC.issuedAt!).toISOString().replace('Z', '-05:00'),
        moneda: savedNC.currency,
      },
      doc_afectado: {
        tipo_doc: tipoDocOriginal,
        numero: `${originalDoc.series}-${String(originalDoc.sequential).padStart(8, '0')}`,
      },
      motivo: {
        codigo: motivo,
        descripcion: motivoDescripcion,
      },
      totales: {
        gravadas: toNum(savedNC.subtotal),
        igv: toNum(savedNC.taxAmount),
        total_impuestos: toNum(savedNC.taxAmount),
        valor_venta: toNum(savedNC.subtotal),
        subtotal: toNum(savedNC.total),
        total: toNum(savedNC.total),
      },
      detalles: lineCalcs,
      leyenda: montoEnLetras(toNum(savedNC.total), savedNC.currency === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES'),
    });

    let sunatMsg = res.data.responseMessage ?? null;
    if (!res.success && res.data.tipo_error) {
      const parts = [`[${res.data.tipo_error}]`];
      if (sunatMsg) parts.push(sunatMsg);
      if (res.data.error_detalle?.message && res.data.error_detalle.message !== sunatMsg) {
        parts.push(`Detalle: ${res.data.error_detalle.message}`);
      }
      sunatMsg = parts.join(' — ');
    }

    sunatUpdate = {
      sunat_status: res.success ? 'ACEPTADO' : 'RECHAZADO',
      sunat_code: res.data.responseCode ?? null,
      sunat_message: sunatMsg,
      xml_hash: res.data.hash ?? null,
      xml_filename: res.data.xmlFilename ?? null,
      facturador_comprobante_id: res.data.id ?? null,
    };
  } catch (err: any) {
    sunatUpdate = {
      sunat_status: 'ERROR',
      sunat_message: err?.message ?? 'Error al conectar con el facturador',
    };
  }

  await db
    .update(billingDocuments)
    .set({
      sunatStatus: sunatUpdate['sunat_status'] as string,
      sunatCode: sunatUpdate['sunat_code'] as string | null,
      sunatMessage: sunatUpdate['sunat_message'] as string | null,
      xmlHash: sunatUpdate['xml_hash'] as string | null,
      xmlFilename: sunatUpdate['xml_filename'] as string | null,
      facturadorComprobanteId: sunatUpdate['facturador_comprobante_id'] as number | null,
      updatedAt: new Date(),
    })
    .where(eq(billingDocuments.id, savedNC.id));

  const [final] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, savedNC.id));
  return final;
}

// ── Retry SUNAT void communication ────────────────────────────────────────────

export async function retryVoidSunat(id: number) {
  const db = getTenantDb();
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status !== 'voided') throw new Error('Solo se puede reintentar la baja de documentos anulados');
  if (doc.voidedSunatStatus === 'ACEPTADO') {
    throw new Error('La Nota de Crédito de anulación ya fue aceptada por SUNAT');
  }
  if (doc.documentType !== 'factura' && doc.documentType !== 'boleta') {
    throw new Error('Solo facturas o boletas anuladas pueden reintentar su Nota de Crédito');
  }

  const reason = doc.voidedReason ?? 'ANULACION';
  const [existingNC] = await db
    .select()
    .from(billingDocuments)
    .where(
      and(
        eq(billingDocuments.referencedDocumentId, doc.id),
        eq(billingDocuments.documentType, 'nota_de_credito')
      )
    )
    .orderBy(desc(billingDocuments.issuedAt))
    .limit(1);

  if (!existingNC) {
    throw new Error('El documento no tiene una Nota de Crédito generada para reintentar');
  }
  if (existingNC.sunatStatus === 'ACEPTADO') {
    throw new Error('La Nota de Crédito de anulación ya fue aceptada por SUNAT');
  }

  const lines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, existingNC.id));

  const nc = await emitAndUpdateCreditNote(db, existingNC, doc, lines, '01', reason);

  await db
    .update(billingDocuments)
    .set({
      voidedTicket: nc.documentNumber ?? null,
      voidedSunatStatus: nc.sunatStatus as string,
      ...resolveParentSunatStateAfterVoid(
        nc.sunatStatus as 'ACEPTADO' | 'RECHAZADO' | 'ERROR' | null,
        nc.documentNumber ?? null,
      ),
      updatedAt: new Date(),
    })
    .where(eq(billingDocuments.id, id));

  const [final] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  return final;
}

// ── Diagnose SUNAT config (sin enviar nada) ────────────────────────────────────

/**
 * Dado el ID de un documento, resuelve la empresa del facturador y consulta
 * su configuración sin enviar nada a SUNAT.
 * Expone: ambiente, URL, usuario SOL, info del certificado y advertencias.
 * Útil para depurar el error 0111 "No tiene perfil para enviar comprobantes".
 */
export async function diagnoseDocument(docId: number) {
  const db = getTenantDb();

  const [doc] = await db
    .select({ branchId: billingDocuments.branchId, sunatStatus: billingDocuments.sunatStatus, sunatCode: billingDocuments.sunatCode, sunatMessage: billingDocuments.sunatMessage })
    .from(billingDocuments)
    .where(eq(billingDocuments.id, docId));

  if (!doc) throw new Error('Documento no encontrado');

  const { ruc } = await resolveFacturadorConfig(db, doc.branchId);
  const diagResult = await diagnosticarEmision(ruc);

  return {
    documento: {
      id: docId,
      sunatStatus: doc.sunatStatus,
      sunatCode: doc.sunatCode,
      sunatMessage: doc.sunatMessage,
    },
    configuracion: diagResult,
    posibles_causas_0111: [
      diagResult.ambiente === 'beta'
        ? '⚠️  AMBIENTE=beta: el RUC está enviando a la URL de pruebas, no a producción. Cambie a "produccion" en la empresa del facturador.'
        : null,
      diagResult.cert_ruc_match === false
        ? `⚠️  El certificado (CN: ${diagResult.cert_cn}) no coincide con el RUC ${diagResult.ruc}. Suba el certificado correcto.`
        : null,
      diagResult.cert_vigente === false
        ? `⚠️  El certificado está vencido (expiró: ${diagResult.cert_expira}). Renuévelo en SUNAT.`
        : null,
      !diagResult.tiene_cert
        ? '⚠️  No hay certificado registrado para esta empresa.'
        : null,
      '⚠️  Verificar en el portal SUNAT SOL que el usuario secundario tiene el rol "Emisión Electrónica".',
      '⚠️  Verificar que el RUC esté habilitado como emisor electrónico en SUNAT (modalidad directa o a través de PSE).',
    ].filter(Boolean),
  };
}

// ── Check void SUNAT status (consultar estado de la NC de anulación) ─────────

/**
 * Para Notas de Crédito (tipo 07) NO existe ticket asíncrono: SUNAT responde
 * ACEPTADO/RECHAZADO de forma inmediata al emitirla. Por lo tanto, esta función
 * solo se usa para reintentar la emisión cuando quedó en ERROR (p.ej. timeout
 * de red) o para re-verificar el estado de la NC consultando el facturador.
 *
 * Si la NC ya está ACEPTADA/RECHAZADA, no hay nada que consultar — devolvemos
 * el documento tal cual.
 */
export async function checkVoidStatus(id: number) {
  const db = getTenantDb();
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status !== 'voided') throw new Error('Solo se puede consultar el estado de documentos anulados');

  // Si la NC ya tiene un estado terminal, no hay nada que consultar en SUNAT.
  if (doc.voidedSunatStatus === 'ACEPTADO' || doc.voidedSunatStatus === 'RECHAZADO') {
    if (doc.voidedSunatStatus === 'ACEPTADO' && doc.sunatStatus !== 'RECHAZADO') {
      const [synced] = await db
        .update(billingDocuments)
        .set({
          ...resolveParentSunatStateAfterVoid(doc.voidedSunatStatus, doc.voidedTicket),
          updatedAt: new Date(),
        })
        .where(eq(billingDocuments.id, id))
        .returning();
      return synced;
    }
    return doc;
  }

  // Solo ERROR (o null) amerita reintento: re-emitimos la NC.
  if (doc.voidedSunatStatus !== 'ERROR' && doc.voidedSunatStatus !== null) {
    throw new Error('La Nota de Crédito de anulación no requiere reintento');
  }

  if (!doc.voidedReason) throw new Error('El documento no tiene motivo de anulación registrado');

  // Re-emitir la NC. createCreditNoteForVoid valida que el doc original siga
  // marcado como 'issued' en BD, así que restauramos temporalmente ese estado.
  const originalForNc = { ...doc, status: 'issued' as const };
  const nc = await createCreditNoteForVoid(db, originalForNc, doc.voidedReason);

  const [updated] = await db
    .update(billingDocuments)
    .set({
      voidedTicket: nc.document?.documentNumber ?? null,
      voidedSunatStatus: nc.document?.sunatStatus as string,
      ...resolveParentSunatStateAfterVoid(
        nc.document?.sunatStatus as 'ACEPTADO' | 'RECHAZADO' | 'ERROR' | null,
        nc.document?.documentNumber ?? null,
      ),
      updatedAt: new Date(),
    })
    .where(eq(billingDocuments.id, id))
    .returning();

  return updated;
}

// ── Nota de Crédito ───────────────────────────────────────────────────────────

export interface CreateNotaCreditoInput {
  referencedDocumentId: number;  // ID del doc original (factura o boleta)
  seriesId: number;              // Serie NC del tenant (FC-xxx o BC-xxx)
  motivo: CodigoMotivoNC;        // '01'=Anulación, '06'=Devolución, etc.
  motivoDescripcion: string;
  notes?: string;
  createdBy?: string;
}

/**
 * Emite una Nota de Crédito electrónica (tipo_doc 07) vinculada a un documento
 * previo (factura o boleta). Usa el mismo endpoint en el facturador para ambos tipos;
 * la diferencia es la serie (FC-xxx → factura, BC-xxx → boleta) y
 * doc_afectado.tipo_doc ('01' o '03').
 */
export async function createNotaCredito(input: CreateNotaCreditoInput) {
  const db = getTenantDb();

  const [originalDoc] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, input.referencedDocumentId));

  if (!originalDoc) throw new Error('Documento original no encontrado');
  if (originalDoc.documentType !== 'factura' && originalDoc.documentType !== 'boleta') {
    throw new Error('Solo se puede emitir Nota de Crédito sobre facturas o boletas');
  }
  if (originalDoc.status === 'voided') throw new Error('El documento original ya está anulado');
  if (originalDoc.sunatStatus !== 'ACEPTADO') {
    throw new Error('Solo se puede emitir NC sobre documentos aceptados por SUNAT');
  }

  // Verificar que no exista ya una NC activa sobre este documento
  const existingNC = await db
    .select({ id: billingDocuments.id })
    .from(billingDocuments)
    .where(
      and(
        eq(billingDocuments.referencedDocumentId, input.referencedDocumentId),
        sql`${billingDocuments.documentType} = 'nota_de_credito'`,
        sql`${billingDocuments.status} != 'voided'`,
      )
    )
    .limit(1);

  if (existingNC.length) throw new Error('Ya existe una Nota de Crédito activa para este documento');

  const lines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, input.referencedDocumentId));

  // Transacción: reservar correlativo + insertar NC
  const { docId } = await db.transaction(async (tx) => {
    const [series] = await tx
      .select()
      .from(billingSeries)
      .where(eq(billingSeries.id, input.seriesId))
      .for('update');

    if (!series || !series.isActive) throw new Error('Serie NC no encontrada o inactiva');
    if (series.documentType !== 'nota_de_credito') {
      throw new Error(`La serie '${series.series}' no es de tipo nota_de_credito`);
    }

    const sequential = series.lastSequential + 1;
    const documentNumber = `${series.series}-${padSequential(sequential)}`;

    await tx
      .update(billingSeries)
      .set({ lastSequential: sequential, updatedAt: new Date() })
      .where(eq(billingSeries.id, series.id));

    const [doc] = await tx
      .insert(billingDocuments)
      .values({
        branchId: originalDoc.branchId,
        orderId: originalDoc.orderId,
        splitId: originalDoc.splitId ?? null,
        seriesId: series.id,
        documentType: 'nota_de_credito',
        series: series.series,
        sequential,
        documentNumber,
        referencedDocumentId: originalDoc.id,
        buyerDocType: originalDoc.buyerDocType,
        buyerDocNumber: originalDoc.buyerDocNumber,
        buyerName: originalDoc.buyerName,
        buyerAddress: originalDoc.buyerAddress,
        buyerEmail: originalDoc.buyerEmail,
        subtotal: originalDoc.subtotal,
        taxRate: originalDoc.taxRate,
        taxAmount: originalDoc.taxAmount,
        total: originalDoc.total,
        currency: originalDoc.currency,
        status: 'issued',
        notes: input.notes ?? null,
        createdBy: input.createdBy ?? null,
        issuedAt: new Date(),
      })
      .returning();

    const lineRows = lines.map((l) => ({
      documentId: doc.id,
      productId: l.productId,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      alternativesDesc: l.alternativesDesc,
      packagingFee: l.packagingFee,
      subtotal: l.subtotal,
      taxAmount: l.taxAmount,
      lineTotal: l.lineTotal,
      notes: l.notes,
    }));

    await tx.insert(billingDocumentLines).values(lineRows);

    return { docId: doc.id };
  });

  // Emitir NC en el facturador (fuera de la TX)
  const [savedNC] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, docId));
  const final = await emitAndUpdateCreditNote(
    db,
    savedNC,
    originalDoc,
    lines,
    input.motivo,
    input.motivoDescripcion,
  );

  // Si el facturador/SUNAT no aceptó la NC, voidarla automáticamente para que
  // el siguiente intento pueda usar un número nuevo sin bloqueo.
  if (final.sunatStatus !== 'ACEPTADO') {
    await db
      .update(billingDocuments)
      .set({
        status: 'voided',
        voidedAt: new Date(),
        voidedReason: `Auto-anulada por fallo en emisión: ${final.sunatMessage ?? 'sin detalle'}`,
        updatedAt: new Date(),
      })
      .where(eq(billingDocuments.id, docId));
  }

  const finalLines = await db.select().from(billingDocumentLines).where(eq(billingDocumentLines.documentId, docId));

  return { document: final, lines: finalLines };
}

// ── Nota de Crédito directa (con motivo elegible, sin pasar por void) ─────────

export async function emitirNotaCreditoDirecta(
  referencedDocumentId: number,
  motivo: CodigoMotivoNC,
  motivoDescripcion: string,
  notes?: string,
  createdBy?: string,
) {
  const db = getTenantDb();

  const [originalDoc] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, referencedDocumentId));

  if (!originalDoc) throw new Error('Documento original no encontrado');
  if (originalDoc.documentType !== 'factura' && originalDoc.documentType !== 'boleta') {
    throw new Error('Solo se puede emitir Nota de Crédito sobre facturas o boletas');
  }
  if (originalDoc.status === 'voided') throw new Error('El documento original ya está anulado');
  if (originalDoc.sunatStatus !== 'ACEPTADO') {
    throw new Error('Solo se puede emitir NC sobre documentos aceptados por SUNAT');
  }

  const seriesId = await ensureCreditNoteSeries(db, originalDoc);

  return createNotaCredito({
    referencedDocumentId,
    seriesId,
    motivo,
    motivoDescripcion,
    notes,
    createdBy,
  });
}

// ── Nota de Crédito externa (para documentos de sistemas anteriores) ──────────

export interface CreateNotaCreditoExternaInput {
  branchId?: number;
  docAfectadoTipo: '01' | '03';
  docAfectadoNumero: string;
  serieNC: string;
  correlativoNC: string;
  motivo: CodigoMotivoNC;
  motivoDescripcion: string;
  buyerTipoDoc: string;
  buyerNumeroDoc: string;
  buyerNombre: string;
  buyerDireccion?: string;
  moneda: string;
  gravadas: number;
  igv: number;
  total: number;
  detalles: {
    codigo: string;
    descripcion: string;
    cantidad: number;
    valorUnitario: number;
    igv: number;
    precioUnitario: number;
  }[];
}

export async function emitirNotaCreditoExterna(input: CreateNotaCreditoExternaInput) {
  const db = getTenantDb();
  if (!input.branchId) throw new Error('Se requiere seleccionar una sucursal con facturador configurado');
  const { ruc } = await resolveFacturadorConfig(db, input.branchId);

  const detalles = input.detalles.map((d) => ({
    codigo: d.codigo,
    unidad_medida: 'NIU',
    descripcion: d.descripcion,
    cantidad: d.cantidad,
    valor_unitario: roundMoney(d.valorUnitario),
    valor_venta: roundMoney(d.valorUnitario * d.cantidad),
    base_igv: roundMoney(d.valorUnitario * d.cantidad),
    porcentaje_igv: 18,
    igv: roundMoney(d.igv),
    tipo_afectacion: '10',
    total_impuestos: roundMoney(d.igv),
    precio_unitario: roundMoney(d.precioUnitario),
  }));

  const res = await emitirNotaCredito({
    emisor: { ruc },
    cliente: {
      tipo_documento: input.buyerTipoDoc,
      numero_documento: input.buyerNumeroDoc,
      razon_social: input.buyerNombre,
      ...(input.buyerDireccion ? { direccion: input.buyerDireccion } : {}),
    },
    comprobante: {
      tipo_doc: '07',
      serie: input.serieNC,
      correlativo: input.correlativoNC.padStart(8, '0'),
      fecha_emision: new Date().toISOString().replace('Z', '-05:00'),
      moneda: input.moneda,
    },
    doc_afectado: {
      tipo_doc: input.docAfectadoTipo,
      numero: input.docAfectadoNumero,
    },
    motivo: {
      codigo: input.motivo,
      descripcion: input.motivoDescripcion,
    },
    totales: {
      gravadas: input.gravadas,
      igv: input.igv,
      total_impuestos: input.igv,
      valor_venta: input.gravadas,
      subtotal: input.total,
      total: input.total,
    },
    detalles,
    leyenda: montoEnLetras(input.total, input.moneda === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES'),
  });

  // Actualizar el last_sequential de la serie NC si fue aceptada
  if (res.success) {
    const [serie] = await db
      .select()
      .from(billingSeries)
      .where(eq(billingSeries.series, input.serieNC))
      .limit(1);
    if (serie) {
      const correlativo = parseInt(input.correlativoNC, 10);
      if (correlativo > serie.lastSequential) {
        await db
          .update(billingSeries)
          .set({ lastSequential: correlativo, updatedAt: new Date() })
          .where(eq(billingSeries.id, serie.id));
      }
    }
  }

  return res;
}
