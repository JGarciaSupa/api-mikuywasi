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
import { emitirComprobante, obtenerEmpresa, obtenerPdfBuffer, enviarComunicacionBaja, enviarResumenDiarioBaja, consultarEstadoBaja, consultarEstadoResumen, diagnosticarEmision } from '../../../../../utils/facturador-client';

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
}

export interface ListDocumentsFilters {
  page?: number;
  limit?: number;
  documentType?: string;
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
  };
}

// ── Void document ──────────────────────────────────────────────────────────────

// SUNAT requiere fechas en zona Lima (UTC-5), no en UTC
function limaDateStr(d: Date): string {
  const lima = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return lima.toISOString().slice(0, 10);
}

export async function voidDocument(id: number, reason: string, cancelOrder = false) {
  const db = getTenantDb();
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status !== 'issued') throw new Error(`No se puede anular un documento en estado '${doc.status}'`);
  if (!reason?.trim()) throw new Error('Se requiere un motivo de anulación');

  const today = limaDateStr(new Date());
  const issuedDate = limaDateStr(new Date(doc.issuedAt!));

  // Anular localmente primero
  await db
    .update(billingDocuments)
    .set({ status: 'voided', voidedAt: new Date(), voidedReason: reason.trim(), updatedAt: new Date() })
    .where(eq(billingDocuments.id, id));

  // Cancelar pedido asociado si se solicitó (revierte descuento de stock)
  if (cancelOrder) {
    const { updateOrderStatus } = await import('../documents/order.service');
    await updateOrderStatus(doc.orderId, 'cancelled');
  }

  // Notificar a SUNAT solo si el comprobante fue aceptado previamente
  if (
    (doc.documentType === 'factura' || doc.documentType === 'boleta') &&
    doc.sunatStatus === 'ACEPTADO'
  ) {
    await enviarBajaSunat(db, id, doc, reason.trim(), today, issuedDate);
  }

  const [final] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  return final;
}

// ── Envío a SUNAT según tipo: factura→RA, boleta→Resumen Diario ───────────────

async function enviarBajaSunat(
  db: TenantDb,
  id: number,
  doc: typeof billingDocuments.$inferSelect,
  reason: string,
  today: string,
  issuedDate: string,
): Promise<void> {
  try {
    const { ruc } = await resolveFacturadorConfig(db, doc.branchId);
    let success = false;
    let ticket: string | null = null;

    if (doc.documentType === 'factura') {
      // Facturas: Comunicación de Baja (RA)
      const res = await enviarComunicacionBaja({
        emisor: { ruc },
        fec_generacion: issuedDate,
        fec_comunicacion: today,
        documentos: [{
          tipo_doc: '01',
          serie: doc.series,
          correlativo: String(doc.sequential).padStart(8, '0'),
          des_motivo_baja: reason,
        }],
      });
      success = res.success;
      ticket = res.data?.ticket ?? null;
    } else {
      // Boletas: Resumen Diario (RC) con estado='3' (anulado)
      // SUNAT error 2308: boletas NO pueden ir por RA
      const buyerTipo = doc.buyerDocType === 'RUC' ? '6'
        : doc.buyerDocType === 'DNI' ? '1'
        : doc.buyerDocType === 'CE'  ? '4' : '0';

      const res = await enviarResumenDiarioBaja({
        emisor: { ruc },
        fec_generacion: issuedDate,
        fec_resumen: today,
        documentos: [{
          tipo_doc: '03',
          serie_nro: `${doc.series}-${String(doc.sequential).padStart(8, '0')}`,
          cliente_tipo: buyerTipo,
          cliente_nro: doc.buyerDocNumber ?? '-',
          estado: '3',
          total: toNum(doc.total),
          gravadas: toNum(doc.subtotal),
          igv: toNum(doc.taxAmount),
        }],
      });
      success = res.success;
      ticket = res.data?.ticket ?? null;
    }

    await db
      .update(billingDocuments)
      .set({
        voidedTicket: ticket,
        voidedSunatStatus: success ? 'PENDIENTE' : 'ERROR',
        updatedAt: new Date(),
      })
      .where(eq(billingDocuments.id, id));
  } catch {
    await db
      .update(billingDocuments)
      .set({ voidedSunatStatus: 'ERROR', updatedAt: new Date() })
      .where(eq(billingDocuments.id, id));
  }
}

// ── Retry SUNAT void communication ────────────────────────────────────────────

export async function retryVoidSunat(id: number) {
  const db = getTenantDb();
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status !== 'voided') throw new Error('Solo se puede reintentar la baja de documentos anulados');
  if (doc.sunatStatus !== 'ACEPTADO') throw new Error('El documento no fue aceptado por SUNAT, no requiere comunicación de baja');
  if (doc.voidedSunatStatus === 'PENDIENTE' || doc.voidedSunatStatus === 'ACEPTADO') {
    throw new Error('La comunicación de baja ya fue enviada y está en proceso o aceptada');
  }

  const today = limaDateStr(new Date());
  const issuedDate = limaDateStr(new Date(doc.issuedAt!));
  const reason = doc.voidedReason ?? 'ANULACION';

  await enviarBajaSunat(db, id, doc, reason, today, issuedDate);

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

// ── Check void SUNAT status (consultar ticket PENDIENTE) ──────────────────────

export async function checkVoidStatus(id: number) {
  const db = getTenantDb();
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status !== 'voided') throw new Error('Solo se puede consultar el estado de documentos anulados');
  if (doc.voidedSunatStatus !== 'PENDIENTE') throw new Error('El documento no tiene una comunicación de baja pendiente');
  if (!doc.voidedTicket) throw new Error('El documento no tiene ticket de SUNAT registrado');

  const { ruc } = await resolveFacturadorConfig(db, doc.branchId);

  let newStatus: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO';

  if (doc.documentType === 'factura') {
    const result = await consultarEstadoBaja(doc.voidedTicket, ruc);
    newStatus = result.pending ? 'PENDIENTE' : result.success ? 'ACEPTADO' : 'RECHAZADO';
  } else {
    const result = await consultarEstadoResumen(doc.voidedTicket, ruc);
    newStatus = result.pending ? 'PENDIENTE' : result.success ? 'ACEPTADO' : 'RECHAZADO';
  }

  const [updated] = await db
    .update(billingDocuments)
    .set({ voidedSunatStatus: newStatus, updatedAt: new Date() })
    .where(eq(billingDocuments.id, id))
    .returning();

  return updated;
}
