import { eq, and, desc, like, or, gte, lte, count, sql } from 'drizzle-orm';
import {
  billingDocuments,
  billingDocumentLines,
  billingSeries,
  orders,
  orderItems,
} from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum, roundMoney } from '../warehouse/shared/numbers';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  orderId: string;
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
  return String(n).padStart(6, '0');
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

// ── Preview ────────────────────────────────────────────────────────────────────

export async function previewDocument(orderId: string, seriesId: number) {
  const db = getTenantDb();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Pedido no encontrado');
  if (order.status === 'cancelled') throw new Error('No se puede facturar un pedido cancelado');

  const [series] = await db.select().from(billingSeries).where(eq(billingSeries.id, seriesId));
  if (!series || !series.isActive) throw new Error('Serie no encontrada o inactiva');

  const ois = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

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

  const existingDoc = await db
    .select({ id: billingDocuments.id })
    .from(billingDocuments)
    .where(
      and(
        eq(billingDocuments.orderId, input.orderId),
        sql`${billingDocuments.status} != 'voided'`
      )
    )
    .limit(1);

  if (existingDoc.length) {
    throw new Error('El pedido ya tiene un documento de venta activo');
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

  return db.transaction(async (tx) => {
    // Lock the series row for sequential number assignment
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

    const ois = await tx.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
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

    const [doc] = await tx
      .insert(billingDocuments)
      .values({
        branchId: order.branchId,
        orderId: input.orderId,
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

    const lines = await tx.insert(billingDocumentLines).values(lineRows).returning();

    return { document: doc, lines };
  });
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

// ── Void document ──────────────────────────────────────────────────────────────

export async function voidDocument(id: number, reason: string) {
  const db = getTenantDb();
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status !== 'issued') throw new Error(`No se puede anular un documento en estado '${doc.status}'`);
  if (!reason?.trim()) throw new Error('Se requiere un motivo de anulación');

  const [updated] = await db
    .update(billingDocuments)
    .set({ status: 'voided', voidedAt: new Date(), voidedReason: reason.trim(), updatedAt: new Date() })
    .where(eq(billingDocuments.id, id))
    .returning();

  return updated;
}
