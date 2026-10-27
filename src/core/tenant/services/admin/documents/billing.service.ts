import { eq, and, desc, like, or, gte, lte, count, sql, isNull, inArray, getTableColumns } from 'drizzle-orm';
import {
  billingDocuments,
  billingDocumentLines,
  cashRegisterDocumentSeries,
  branches,
  brands,
  orders,
  orderItems,
  orderSplits,
  orderPayments,
  tables,
  customers,
  customerContacts,
  paymentMethods,
} from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum, roundMoney } from '../warehouse/shared/numbers';
import { resolveFacturadorConfig } from '../../../../../utils/resolve-facturador-config';
import { emitirComprobante, emitirNotaCredito, obtenerEmpresa, obtenerPdfBuffer, diagnosticarEmision, type CodigoMotivoNC } from '../../../../../utils/facturador-client';
import { getActiveSessionForUser, reverseOrderSaleMovement, reverseSplitSaleIncome } from './cash.service';
import { authorizeByPassword } from './security-auth.service';
import { syncOrderPaymentStatus } from './order-splits.service';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import type { AuditActor } from '../warehouse/types';
import { resolveForRegister } from '../config-local/activation.service';
import { resolveSeriesForRegister, listAvailableDocumentTypesForRegister, type DocumentType as SeriesDocumentType, documentTypeFromReceiptCode } from './billing-series.service';
import { type TaxConfig, type TaxSnapshotEntry, DEFAULT_BRANCH_TAXES, aggregateTaxBreakdown, isFixedTax, isServiceChargeTax, resolveLineTaxes, resolveTipoAfectacion } from '../../shared/taxes.service';
import { buildSunatCargos, buildSunatDetalle, buildSunatTotales } from './sunat-payload';
import { masterDb } from '../../../../../db';
import { countries, identityDocumentTypes } from '../../../../../db/master/schema';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  orderId: string;
  splitId?: number | null;
  documentType: 'factura' | 'boleta' | 'nota_de_venta';
  buyerDocType?: string;
  buyerDocNumber?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  notes?: string;
  createdBy?: string;
  // Cajero autenticado — se usa para resolver la caja de su turno abierto y, con
  // ella, la serie a usar (ya no se elige manualmente desde el frontend).
  userId?: number;
  // "Cliente no pagó": marca interna, solo si la sucursal lo permite (el permiso se
  // valida en el controller). No cambia SUNAT ni la caja.
  paymentPending?: boolean;
  paymentPendingNote?: string | null;
  // Cliente frecuente que debe la venta (se asocia al pedido: orders.customer_id)
  paymentPendingCustomerId?: number | null;
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
  // true = solo comprobantes con pago pendiente aún no cobrado
  paymentPending?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function padSequential(n: number) {
  return String(n).padStart(8, '0');
}

// Resuelve la serie a usar dada la caja del turno abierto del usuario autenticado.
// Centraliza la regla "la serie no se elige manualmente" usada tanto al previsualizar
// como al emitir el documento.
async function resolveActiveSeriesOrThrow(
  branchId: number,
  documentType: SeriesDocumentType,
  userId: number | undefined,
) {
  const activeSession = await getActiveSessionForUser(userId);
  if (!activeSession || activeSession.registerId == null) {
    throw new Error('Debes tener un turno de caja abierto para facturar');
  }
  const resolved = await resolveSeriesForRegister(activeSession.registerId, documentType, branchId);
  if (!resolved) {
    throw new Error(`Esta caja no tiene una serie configurada para '${documentType}'. Contacta a un administrador.`);
  }
  return resolved;
}

export async function getAvailableDocumentTypes(userId: number | undefined) {
  const activeSession = await getActiveSessionForUser(userId);
  if (!activeSession || activeSession.registerId == null) {
    throw new Error('Debes tener un turno de caja abierto para facturar');
  }
  return listAvailableDocumentTypesForRegister(activeSession.registerId);
}

// Busca el tipo de documento de identidad en el catálogo maestro, scoped por el
// país de la sucursal (branch.countryCode → countries.isoCode → countryId).
// Devuelve null si la sucursal no tiene país configurado o el código no existe en
// el catálogo — en ese caso el llamador debe aplicar el fallback histórico.
async function resolveIdentityDocType(branchId: number, code: string | undefined | null) {
  if (!code) return null;
  const db = getTenantDb();
  const [branch] = await db.select({ countryCode: branches.countryCode }).from(branches).where(eq(branches.id, branchId));
  if (!branch?.countryCode) return null;

  const [country] = await masterDb.select({ id: countries.id }).from(countries).where(eq(countries.isoCode, branch.countryCode));
  if (!country) return null;

  const [docType] = await masterDb
    .select()
    .from(identityDocumentTypes)
    .where(and(
      eq(identityDocumentTypes.countryId, country.id),
      eq(identityDocumentTypes.isActive, true),
      or(eq(identityDocumentTypes.code, code), eq(identityDocumentTypes.name, code)),
    ));
  return docType ?? null;
}

// Valida el documento del comprador. Para factura, la regla dura de SUNAT/Greenter
// (RUC de 11 dígitos) se mantiene siempre, sin depender del catálogo. Para
// boleta/nota_de_venta el documento es opcional (ver "Consumidor Final"); si se
// indica, se valida contra el catálogo de la sucursal, o contra el set histórico
// de Perú (DNI/RUC/CE) si la sucursal aún no tiene país configurado.
async function validateBuyerDocument(
  branchId: number,
  documentType: 'factura' | 'boleta' | 'nota_de_venta',
  buyerDocType: string | undefined,
  buyerDocNumber: string | undefined,
) {
  if (documentType === 'factura') {
    if (!buyerDocType || buyerDocType !== 'RUC') {
      throw new Error('La factura requiere tipo de documento RUC');
    }
    if (!buyerDocNumber || buyerDocNumber.length !== 11) {
      throw new Error('La factura requiere RUC de 11 dígitos');
    }
    return;
  }

  if (!buyerDocType) return;

  const docType = await resolveIdentityDocType(branchId, buyerDocType);
  if (!docType) {
    if (!['DNI', 'RUC', 'CE'].includes(buyerDocType)) {
      throw new Error('Tipo de documento inválido. Use DNI, RUC o CE');
    }
    return;
  }

  if (docType.docLength != null && buyerDocNumber && buyerDocNumber.length !== docType.docLength) {
    throw new Error(`${docType.name} debe tener ${docType.docLength} dígitos`);
  }
  if (docType.docPattern && buyerDocNumber && !new RegExp(docType.docPattern).test(buyerDocNumber)) {
    throw new Error(`${docType.name} tiene un formato inválido`);
  }
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
  // Vínculo con la línea del pedido que originó esta línea del comprobante.
  // Es lo que permite recuperar después el desglose por impuesto (tax_snapshot).
  orderItemId: number | null;
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
  igvAmount: number;
  // Afectación SUNAT (catálogo 07) de la línea: '10' gravada, '20' exonerada.
  // Depende de los impuestos realmente activos, que el producto puede desactivar
  // por canal de venta — no de que el documento sea boleta o factura.
  tipoAfectacion: '10' | '20';
  taxSnapshot?: {
    key: string;
    label: string;
    rate: number;
    isActive: boolean;
    defaultActive?: boolean;
    calculationType?: 'percentage' | 'fixed';
    amount?: number;
  }[];
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
    orderItemId: null,
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
    igvAmount: taxAmount,
    tipoAfectacion: rate > 0 ? '10' : '20',
  };
}

function isFixedTaxSnapshot(tax: { key: string; calculationType?: 'percentage' | 'fixed' }) {
  return tax.calculationType === 'fixed' || tax.key === 'icbper';
}

function resolveLineCalcFromSnapshot(oi: typeof orderItems.$inferSelect): LineCalc | null {
  // NULL = línea anterior al desglose por impuesto (se recalcula con la tasa del documento).
  // [] = producto vendido sin ningún impuesto activo → exonerado (afectación 20), no gravado.
  if (oi.taxSnapshot == null) return null;
  const taxSnapshot = oi.taxSnapshot as NonNullable<LineCalc['taxSnapshot']>;

  const activeTaxes = taxSnapshot.filter((tax) => tax.isActive);
  const grossLine = roundMoney(toNum(oi.totalPrice));
  const totalTaxAmount = roundMoney(activeTaxes.reduce((sum, tax) => sum + toNum(tax.amount), 0));
  // IGV = porcentuales que no son el recargo al consumo (el recargo no es tributo)
  const percentageTaxes = activeTaxes.filter((tax) => !isFixedTaxSnapshot(tax) && !isServiceChargeTax(tax));
  const percentageRateTotal = roundMoney(percentageTaxes.reduce((sum, tax) => sum + toNum(tax.rate), 0));
  const percentageTaxAmount = roundMoney(percentageTaxes.reduce((sum, tax) => sum + toNum(tax.amount), 0));
  const mainPercentageTax = activeTaxes.find((tax) => tax.key === 'impuesto_1') ?? percentageTaxes[0] ?? null;

  return {
    orderItemId: oi.id,
    productId: oi.productId ?? null,
    productName: oi.productName,
    quantity: oi.quantity,
    unitPrice: toNum(oi.unitPrice),
    alternativesExtra: 0,
    packagingFee: toNum(oi.packagingFee),
    subtotal: roundMoney(grossLine - totalTaxAmount),
    taxAmount: totalTaxAmount,
    lineTotal: grossLine,
    alternativesDesc: null,
    notes: oi.notes ?? null,
    priceInclTax: true,
    taxRate: mainPercentageTax ? toNum(mainPercentageTax.rate) : percentageRateTotal,
    igvAmount: percentageTaxAmount,
    tipoAfectacion: resolveTipoAfectacion(activeTaxes),
    taxSnapshot: activeTaxes,
  };
}

function resolveLineCalc(oi: typeof orderItems.$inferSelect, priceInclTax: boolean, taxRate: number): LineCalc {
  const calc = resolveLineCalcFromSnapshot(oi) ?? calcLine(
    oi.productId ?? null,
    oi.productName,
    oi.quantity,
    toNum(oi.unitPrice),
    (oi.selectedAlternatives as { name: string; extraPrice: number }[]) ?? [],
    toNum(oi.packagingFee),
    oi.notes ?? null,
    priceInclTax,
    taxRate
  );
  return { ...calc, orderItemId: oi.id };
}

function resolveDocumentTaxRate(lineCalcs: LineCalc[], fallbackRate: number) {
  const mainLine = lineCalcs.find((line) => line.taxSnapshot?.length);
  if (!mainLine?.taxSnapshot?.length) return fallbackRate;
  const mainTax = mainLine.taxSnapshot.find((tax) => tax.key === 'impuesto_1' && tax.isActive)
    ?? mainLine.taxSnapshot.find((tax) => !isFixedTaxSnapshot(tax) && !isServiceChargeTax(tax) && tax.isActive)
    ?? null;
  return mainTax ? toNum(mainTax.rate) : fallbackRate;
}

// ── Cuentas divididas por monto ──────────────────────────────────────────────
// Una cuenta "por monto" (partes iguales o montos libres) solo guarda un importe ya
// cobrado. Su comprobante reparte ese importe con la composición real del pedido —tasa
// de IGV, parte exonerada y recargo al consumo de cada producto— para que la suma de las
// cuentas declare lo mismo que el pedido completo. El importe es siempre precio final.
// Las bolsas (ICBPER = cantidad × factor) no se fraccionan: van completas a la primera
// cuenta (por id) cuyo importe las cubre.

type LineTaxEntry = NonNullable<LineCalc['taxSnapshot']>[number];

// Configuración de impuestos equivalente al desglose congelado de un ítem.
// NULL (ítem antiguo) = solo IGV a la tasa del documento; [] = exonerado.
function taxConfigFromSnapshot(snapshot: LineTaxEntry[] | null, fallbackRate: number): TaxConfig[] {
  const active = snapshot ?? [{ key: 'impuesto_1', label: 'IGV', rate: fallbackRate, isActive: true }];
  const byKey = new Map(active.filter((tax) => tax.isActive !== false).map((tax) => [tax.key, tax]));
  return DEFAULT_BRANCH_TAXES.map((base) => {
    const tax = byKey.get(base.key);
    return tax
      ? { ...base, label: tax.label, rate: toNum(tax.rate), isActive: true, calculationType: tax.calculationType ?? base.calculationType }
      : { ...base, isActive: false };
  });
}

function lineCalcFromGross(productName: string, productId: number | null, quantity: number, gross: number, config: TaxConfig[]): LineCalc {
  const r = resolveLineTaxes(gross, quantity, config);
  const igvTaxes = r.taxSnapshot.filter((tax) => !isFixedTax(tax) && !isServiceChargeTax(tax));
  const mainTax = r.taxSnapshot.find((tax) => tax.key === 'impuesto_1') ?? igvTaxes[0] ?? null;
  return {
    orderItemId: null,
    productId,
    productName,
    quantity,
    unitPrice: roundMoney(gross / quantity),
    alternativesExtra: 0,
    packagingFee: 0,
    subtotal: r.subtotal,
    taxAmount: r.totalTaxAmount,
    lineTotal: r.lineTotal,
    alternativesDesc: null,
    notes: null,
    priceInclTax: true,
    taxRate: mainTax ? toNum(mainTax.rate) : 0,
    igvAmount: roundMoney(igvTaxes.reduce((sum, tax) => sum + toNum(tax.amount), 0)),
    tipoAfectacion: resolveTipoAfectacion(r.taxSnapshot),
    taxSnapshot: r.taxSnapshot,
  };
}

async function resolveAmountSplitLineCalcs(
  db: ReturnType<typeof getTenantDb>,
  split: typeof orderSplits.$inferSelect,
  fallbackRate: number,
): Promise<LineCalc[]> {
  const concept = split.customConcept || 'Por consumo de alimentos y bebidas';
  const amount = roundMoney(toNum(split.total));
  if (amount <= 0) return [];

  const [order] = await db.select().from(orders).where(eq(orders.id, split.orderId));
  const items = await db.select().from(orderItems).where(and(eq(orderItems.orderId, split.orderId), isNull(orderItems.deletedAt)));

  // Grupos por combinación de impuestos activos; las bolsas aparte, por producto
  const groups = new Map<string, { gross: number; config: TaxConfig[] }>();
  const bags = new Map<string, { name: string; productId: number | null; qty: number; gross: number; config: TaxConfig[] }>();
  const addToGroup = (gross: number, config: TaxConfig[]) => {
    const key = config.filter((tax) => tax.isActive).map((tax) => `${tax.key}:${tax.rate}`).join('|');
    const group = groups.get(key) ?? { gross: 0, config };
    group.gross += gross;
    groups.set(key, group);
  };
  for (const oi of items) {
    const config = taxConfigFromSnapshot((oi.taxSnapshot as LineTaxEntry[] | null) ?? null, fallbackRate);
    const gross = toNum(oi.totalPrice);
    if (config.some((tax) => tax.isActive && isFixedTax(tax))) {
      const key = String(oi.productId ?? oi.productName);
      const bag = bags.get(key) ?? { name: oi.productName, productId: oi.productId ?? null, qty: 0, gross: 0, config };
      bag.qty += oi.quantity;
      bag.gross += gross;
      bags.set(key, bag);
    } else {
      addToGroup(gross, config);
    }
  }
  // El delivery no tiene desglose propio: gravado a la tasa del documento
  if (toNum(order?.deliveryFee) > 0) addToGroup(toNum(order?.deliveryFee), taxConfigFromSnapshot(null, fallbackRate));

  const lines: LineCalc[] = [];
  let remaining = amount;
  const bagTotal = roundMoney([...bags.values()].reduce((sum, bag) => sum + bag.gross, 0));
  if (bagTotal > 0) {
    const siblings = await db
      .select({ id: orderSplits.id, total: orderSplits.total, splitType: orderSplits.splitType })
      .from(orderSplits)
      .where(eq(orderSplits.orderId, split.orderId))
      .orderBy(orderSplits.id);
    const holder = siblings.find((s) => s.splitType === 'by_amount' && toNum(s.total) >= bagTotal);
    if (holder?.id === split.id) {
      for (const bag of bags.values()) {
        lines.push(lineCalcFromGross(bag.name, bag.productId, bag.qty, roundMoney(bag.gross), bag.config));
      }
      remaining = roundMoney(remaining - bagTotal);
    }
  }
  if (remaining <= 0) return lines;

  // Reparto proporcional del resto; el residuo de céntimos va al grupo mayor
  const list = [...groups.values()].filter((g) => g.gross > 0).sort((a, b) => b.gross - a.gross);
  const base = list.reduce((sum, g) => sum + g.gross, 0);
  if (list.length === 0 || base <= 0) {
    lines.push(lineCalcFromGross(concept, null, 1, remaining, taxConfigFromSnapshot(null, fallbackRate)));
    return lines;
  }
  const shares = list.map((g) => roundMoney((remaining * g.gross) / base));
  shares[0] = roundMoney(shares[0] + remaining - shares.reduce((sum, s) => sum + s, 0));
  list.forEach((g, i) => {
    if (shares[i] <= 0) return;
    const suffix = i === 0 ? '' : resolveTipoAfectacion(g.config) === '20' ? ' (productos exonerados)' : ' (otros productos)';
    lines.push(lineCalcFromGross(`${concept}${suffix}`, null, 1, shares[i], g.config));
  });
  return lines;
}

// Reintento, corrección o nota de crédito de un comprobante de cuenta por monto: sus
// líneas guardadas no tienen orderItemId ni desglose, así que se recalculan con el mismo
// reparto (el pedido ya está pagado y no cambia). En otro caso devuelve las líneas tal cual.
async function withAmountSplitLines(
  db: ReturnType<typeof getTenantDb>,
  doc: { splitId: number | null },
  lineCalcs: LineCalc[],
  fallbackRate: number,
): Promise<LineCalc[]> {
  if (doc.splitId == null || lineCalcs.length === 0 || lineCalcs.some((l) => l.orderItemId != null)) return lineCalcs;
  const [split] = await db.select().from(orderSplits).where(eq(orderSplits.id, doc.splitId));
  if (!split || split.splitType !== 'by_amount') return lineCalcs;
  const rebuilt = await resolveAmountSplitLineCalcs(db, split, fallbackRate);
  return rebuilt.length ? rebuilt : lineCalcs;
}

function resolveDocumentTaxSummary(lineCalcs: LineCalc[]) {
  return {
    subtotal: roundMoney(lineCalcs.reduce((sum, line) => sum + line.subtotal, 0)),
    igvAmount: roundMoney(lineCalcs.reduce((sum, line) => sum + (line.igvAmount ?? line.taxAmount), 0)),
    totalTaxAmount: roundMoney(lineCalcs.reduce((sum, line) => sum + line.taxAmount, 0)),
    total: roundMoney(lineCalcs.reduce((sum, line) => sum + line.lineTotal, 0)),
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
  const [brand] = await db.select({ logo: brands.logo, name: brands.name }).from(brands).limit(1);

  // 1. Intentar resolver desde el facturador si la sucursal tiene facturador configurado
  try {
    const { empresaId } = await resolveFacturadorConfig(db, branchId);
    const empresa = await obtenerEmpresa(empresaId);
    if (empresa?.ruc) {
      let addr = empresa.address ?? '';
      if (!addr) {
        const [branchRow] = await db
          .select({ address: branches.address })
          .from(branches)
          .where(eq(branches.id, branchId));
        addr = branchRow?.address?.fullAddress ?? '';
      }
      return {
        ruc: empresa.ruc,
        name: empresa.legalName,
        address: addr,
        logoUrl: brand?.logo ?? null,
      };
    }
  } catch {
    // Si la sucursal no tiene facturador configurado (ej. notas de venta) o el servicio falla,
    // se usan los datos fiscales propios de la sucursal/marca como fallback.
  }

  // 2. Fallback: datos fiscales guardados en la propia sucursal (fiscalId, fiscalName, address)
  const [branch] = await db
    .select({
      fiscalId: branches.fiscalId,
      fiscalName: branches.fiscalName,
      name: branches.name,
      address: branches.address,
    })
    .from(branches)
    .where(eq(branches.id, branchId));

  const branchAddress = branch?.address?.fullAddress || '';
  const branchName = branch?.fiscalName || branch?.name || brand?.name || '';
  const branchRuc = branch?.fiscalId || '';

  return {
    ruc: branchRuc,
    name: branchName,
    address: branchAddress,
    logoUrl: brand?.logo ?? null,
  };
}

// Emisor de un documento ya emitido: usa el snapshot guardado en billing_documents.
// Si aún no lo tiene, lo resuelve en vivo y lo congela (best-effort: si falla el
// guardado, el PDF se genera igual).
async function resolveDocumentEmisor(
  db: ReturnType<typeof getTenantDb>,
  doc: typeof billingDocuments.$inferSelect,
): Promise<EmisorSnapshot> {
  const [brand] = await db.select({ logo: brands.logo }).from(brands).limit(1);

  if ((doc.emisorRuc && doc.emisorRuc.trim() !== '') || (doc.emisorName && doc.emisorName.trim() !== '')) {
    return {
      ruc: doc.emisorRuc ?? '',
      name: doc.emisorName ?? '',
      address: doc.emisorAddress ?? '',
      logoUrl: brand?.logo ?? null,
    };
  }

  const emisor = await resolveEmisor(db, doc.branchId);
  if (emisor.ruc || emisor.name) {
    try {
      await db
        .update(billingDocuments)
        .set({
          emisorRuc: emisor.ruc || null,
          emisorName: emisor.name || null,
          emisorAddress: emisor.address || null,
        })
        .where(and(eq(billingDocuments.id, doc.id), isNull(billingDocuments.emisorRuc)));
    } catch {
      // No bloquear el PDF si el snapshot no se pudo guardar
    }
  }
  return emisor;
}

// ── Preview ────────────────────────────────────────────────────────────────────

export async function previewDocument(
  orderId: string,
  documentType: SeriesDocumentType,
  userId: number | undefined,
  splitId?: number | null,
) {
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

  const resolvedSeries = await resolveActiveSeriesOrThrow(order.branchId, documentType, userId);
  const [series] = await db.select().from(cashRegisterDocumentSeries).where(eq(cashRegisterDocumentSeries.id, resolvedSeries.id));
  if (!series || !series.isActive) throw new Error('Serie no encontrada o inactiva');

  const ois = splitId != null
    ? await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.splitId, splitId), isNull(orderItems.deletedAt)))
    : await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), isNull(orderItems.splitId), isNull(orderItems.deletedAt)));

  const docType = series.receiptTypeCode ? documentTypeFromReceiptCode(series.receiptTypeCode) : 'nota_de_venta';
  const priceInclTax = docType === 'boleta' || docType === 'nota_de_venta';
  const taxRate = toNum(resolvedSeries.taxRate);

  let lineCalcs = ois.map((oi) => resolveLineCalc(oi, priceInclTax, taxRate));
  if (lineCalcs.length === 0 && splitId != null) {
    const [split] = await db.select().from(orderSplits).where(eq(orderSplits.id, splitId));
    if (split && toNum(split.total) > 0) {
      // Importe ya cobrado (precio final), repartido con la composición real del pedido
      lineCalcs = await resolveAmountSplitLineCalcs(db, split, taxRate);
    }
  }

  const summary = resolveDocumentTaxSummary(lineCalcs);

  return {
    order,
    series: {
      ...series,
      documentType: docType,
      priceInclTax,
      taxRate: String(taxRate),
    },
    lines: lineCalcs,
    taxBreakdown: aggregateTaxBreakdown(lineCalcs.map((l) => l.taxSnapshot as TaxSnapshotEntry[] | undefined)),
    totals: { subtotal: summary.subtotal, taxAmount: summary.totalTaxAmount, total: summary.total },
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

  // Pago pendiente: solo pedido completo y con la opción activada en la sucursal
  const paymentPending = input.paymentPending === true;
  const paymentPendingNote = input.paymentPendingNote?.trim().slice(0, 200) || null;
  let pendingCustomerId: number | null = null;
  // Datos del cliente para que el pedido muestre a quién se le asoció la deuda
  let pendingCustomerData: { name: string; phone: string | null } | null = null;
  if (paymentPending) {
    if (input.splitId != null) throw new Error('El pago pendiente solo aplica al pedido completo, no a cuentas divididas');
    const [branchCfg] = await db
      .select({ allowPendingPayment: branches.allowPendingPayment, requiresCustomer: branches.pendingPaymentRequiresCustomer })
      .from(branches)
      .where(eq(branches.id, order.branchId));
    if (!branchCfg?.allowPendingPayment) {
      throw new Error('La sucursal no tiene activadas las ventas con pago pendiente');
    }
    if (input.paymentPendingCustomerId != null) {
      const [customer] = await db
        .select({ id: customers.id, status: customers.status, firstName: customers.firstName, lastName: customers.lastName })
        .from(customers)
        .where(eq(customers.id, Number(input.paymentPendingCustomerId)));
      if (!customer) throw new Error('El cliente elegido para el pago pendiente no existe');
      if (customer.status !== 'active') throw new Error('El cliente elegido para el pago pendiente está inactivo');
      pendingCustomerId = customer.id;
      const contacts = await db
        .select({ contactType: customerContacts.contactType, value: customerContacts.value, isPrimary: customerContacts.isPrimary })
        .from(customerContacts)
        .where(eq(customerContacts.customerId, customer.id));
      const phone = contacts
        .filter((ct) => ct.contactType !== 'email')
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0]?.value ?? null;
      pendingCustomerData = {
        name: [customer.firstName, customer.lastName].filter(Boolean).join(' ').slice(0, 100),
        phone: phone ? phone.slice(0, 20) : null,
      };
    }
    if (branchCfg.requiresCustomer && pendingCustomerId == null && order.customerId == null) {
      throw new Error('Selecciona el cliente que debe la venta: la sucursal exige un cliente para el pago pendiente');
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

  if (input.documentType === 'factura' && !input.buyerName) {
    throw new Error('La factura requiere razón social del comprador');
  }
  await validateBuyerDocument(order.branchId, input.documentType, input.buyerDocType, input.buyerDocNumber);

  // Resolver la serie automáticamente según la caja del turno abierto del cajero
  // (ya no se elige manualmente desde el frontend — ver Fase B del plan Caja↔Serie).
  const resolvedSeries = await resolveActiveSeriesOrThrow(order.branchId, input.documentType, input.userId);

  // Consumidor Final: boletas y notas de venta nunca deben bloquear la venta por
  // falta de datos del cliente. Si no se indicó documento/nombre, se inyecta el
  // cliente genérico y se persiste tal cual en la BD (antes solo se aplicaba como
  // fallback efímero al armar el payload SUNAT, dejando la fila con buyer* en null
  // y el PDF del comprobante impreso en blanco).
  const isConsumidorFinal =
    (input.documentType === 'boleta' || input.documentType === 'nota_de_venta') &&
    !input.buyerDocNumber && !input.buyerName;
  const buyerDocType = isConsumidorFinal ? null : (input.buyerDocType ?? null);
  const buyerDocNumber = isConsumidorFinal ? '00000000' : (input.buyerDocNumber ?? null);
  const buyerName = isConsumidorFinal ? 'CLIENTE FINAL' : (input.buyerName ?? null);

  // Calcular líneas antes de la transacción — filtrar por split si aplica (excluyendo anulados)
  const ois = input.splitId != null
    ? await db.select().from(orderItems).where(and(eq(orderItems.orderId, input.orderId), eq(orderItems.splitId, input.splitId), isNull(orderItems.deletedAt)))
    : await db.select().from(orderItems).where(and(eq(orderItems.orderId, input.orderId), isNull(orderItems.splitId), isNull(orderItems.deletedAt)));

  const priceInclTax = resolvedSeries.priceInclTax;
  const taxRate = toNum(resolvedSeries.taxRate);

  let lineCalcs = ois.map((oi) => resolveLineCalc(oi, priceInclTax, taxRate));
  if (lineCalcs.length === 0 && input.splitId != null) {
    const [split] = await db.select().from(orderSplits).where(eq(orderSplits.id, input.splitId));
    if (split && toNum(split.total) > 0) {
      // Importe ya cobrado (precio final), repartido con la composición real del pedido
      lineCalcs = await resolveAmountSplitLineCalcs(db, split, taxRate);
    }
  }

  if (lineCalcs.length === 0) {
    throw new Error('El pedido no tiene productos válidos para emitir un comprobante (o todos fueron anulados)');
  }

  const summary = resolveDocumentTaxSummary(lineCalcs);
  const documentTaxRate = resolveDocumentTaxRate(lineCalcs, taxRate);
  const emisor = await resolveEmisor(db, order.branchId);

  // Transacción: reservar correlativo + insertar documento + líneas
  const { docId, isActiveFacturacion } = await db.transaction(async (tx) => {
    const [series] = await tx
      .select()
      .from(cashRegisterDocumentSeries)
      .where(eq(cashRegisterDocumentSeries.id, resolvedSeries.id))
      .for('update');

    if (!series || !series.isActive) throw new Error('Serie no encontrada o inactiva');
    const docType = series.receiptTypeCode ? documentTypeFromReceiptCode(series.receiptTypeCode) : 'nota_de_venta';
    if (docType !== input.documentType) {
      throw new Error(
        `La serie '${series.series}' es de tipo '${docType}', no '${input.documentType}'`
      );
    }

    const sequential = series.lastSequential + 1;
    const documentNumber = `${series.series}-${padSequential(sequential)}`;

    await tx
      .update(cashRegisterDocumentSeries)
      .set({ lastSequential: sequential, updatedAt: new Date() })
      .where(eq(cashRegisterDocumentSeries.id, series.id));

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
        buyerDocType,
        buyerDocNumber,
        buyerName,
        buyerAddress: input.buyerAddress ?? null,
        buyerEmail: input.buyerEmail ?? null,
        emisorRuc: emisor.ruc || null,
        emisorName: emisor.name || null,
        emisorAddress: emisor.address || null,
        subtotal: String(summary.subtotal),
        taxRate: String(documentTaxRate),
        taxAmount: String(summary.totalTaxAmount),
        total: String(summary.total),
        status: 'issued',
        notes: input.notes ?? null,
        paymentPending,
        paymentPendingNote: paymentPending ? paymentPendingNote : null,
        createdBy: input.createdBy ?? null,
        issuedAt: new Date(),
      })
      .returning();

    const lineRows = lineCalcs.map((l) => ({
      documentId: doc.id,
      orderItemId: l.orderItemId,
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

    // Pago pendiente con cliente: el pedido queda asociado al cliente frecuente que debe la venta
    if (pendingCustomerId != null && pendingCustomerId !== order.customerId) {
      await tx.update(orders).set({
        customerId: pendingCustomerId,
        ...(pendingCustomerData ? { customerName: pendingCustomerData.name } : {}),
        // El teléfono solo se completa si el pedido no tenía uno
        ...(pendingCustomerData?.phone && !order.customerPhone ? { customerPhone: pendingCustomerData.phone } : {}),
        updatedAt: new Date(),
      }).where(eq(orders.id, order.id));
    }

    return { docId: doc.id, isActiveFacturacion: series.isActiveFacturacion };
  });

  // Emisión electrónica SUNAT (fuera de la transacción — el correlativo ya está consumido)
  if (isActiveFacturacion && (input.documentType === 'factura' || input.documentType === 'boleta')) {
    const [savedDoc] = await db
      .select()
      .from(billingDocuments)
      .where(eq(billingDocuments.id, docId));

    if (savedDoc) {
      await emitirYActualizarDoc(db, savedDoc, lineCalcs, documentTaxRate);
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
  let resolvedAnexo: string | null = null;

  try {
    const { ruc, anexo } = await resolveFacturadorConfig(db, doc.branchId);
    resolvedAnexo = anexo;

    const tipoDoc = doc.documentType === 'factura' ? '01' : '03';
    const buyerTipoDoc = doc.buyerDocType === 'RUC' ? '6' : doc.buyerDocType === 'DNI' ? '1' : '0';

    // Totales y detalles salen de sunat-payload: separa IGV/ICBPER (tributos) del
    // recargo al consumo (cargo 46). El ICBPER se declara por línea y en el total.
    const cargos = buildSunatCargos(lineCalcs);

    const payload = {
      emisor: { ruc, ...(anexo ? { cod_local: anexo } : {}) },
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
        fecha_emision: limaDateTimeStr(new Date(doc.issuedAt!)),
        moneda: doc.currency,
      },
      // Las operaciones se separan por afectación: un producto con el impuesto
      // desactivado es exonerado, y declararlo dentro de `gravadas` es una
      // observación de SUNAT (el IGV informado no cuadra con la base gravada).
      totales: buildSunatTotales(lineCalcs, doc),
      ...(cargos.length ? { cargos } : {}),
      leyenda: montoEnLetras(toNum(doc.total), doc.currency === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES'),
      detalles: lineCalcs.map((l, i) => buildSunatDetalle(l, String(l.productId ?? i + 1), taxRate)),
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
      sunatAnexo: resolvedAnexo,
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
  if (filters.paymentPending) conditions.push(pendingPaymentCondition());
  if (filters.search) {
    conditions.push(
      or(
        like(billingDocuments.documentNumber, `%${filters.search}%`),
        like(billingDocuments.buyerName, `%${filters.search}%`),
        like(orders.trackingCode, `%${filters.search}%`)
      )!
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const baseQuery = db
    .select({
      ...getTableColumns(billingDocuments),
      orderTrackingCode: orders.trackingCode,
    })
    .from(billingDocuments)
    .leftJoin(orders, eq(billingDocuments.orderId, orders.id));

  const data = await (where ? baseQuery.where(where) : baseQuery)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(billingDocuments.issuedAt));

  const countQuery = db
    .select({ total: count() })
    .from(billingDocuments)
    .leftJoin(orders, eq(billingDocuments.orderId, orders.id));

  const [{ total }] = await (where ? countQuery.where(where) : countQuery);

  // Resumen de pagos pendientes de la sucursal (para el filtro "Pagos pendientes")
  const pendingWhere = filters.branchId
    ? and(pendingPaymentCondition(), eq(billingDocuments.branchId, filters.branchId))
    : pendingPaymentCondition();
  const [pending] = await db
    .select({ count: count(), total: sql<string>`coalesce(sum(${billingDocuments.total}), 0)` })
    .from(billingDocuments)
    .where(pendingWhere);

  return {
    data,
    pagination: { total, totalPages: Math.ceil(total / limit), currentPage: page, limit },
    pendingPayments: { count: Number(pending?.count ?? 0), total: roundMoney(toNum(pending?.total)) },
  };
}

// Pago pendiente sin cobrar y comprobante vigente (un comprobante anulado ya no se cobra)
function pendingPaymentCondition() {
  return and(
    eq(billingDocuments.paymentPending, true),
    isNull(billingDocuments.paymentCollectedAt),
    sql`${billingDocuments.status} != 'voided'`,
  )!;
}

/**
 * "Marcar como cobrado": el dueño cobró por su cuenta una venta marcada como pago pendiente.
 * Registra quién, cuándo y (opcional) con qué forma de pago y REF pagó el cliente. Es
 * informativo: no toca SUNAT ni la caja (el pago ya se registró al vender).
 */
export async function markDocumentCollected(
  id: number,
  collectedBy: string | null,
  collected: { paymentMethodId?: number | null; reference?: string | null } = {},
) {
  const db = getTenantDb();
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (!doc.paymentPending) throw new Error('El documento no tiene pago pendiente');
  if (doc.paymentCollectedAt) throw new Error('El documento ya fue marcado como cobrado');
  if (doc.status === 'voided') throw new Error('El documento está anulado');

  let method: { id: number; name: string } | null = null;
  if (collected.paymentMethodId != null) {
    const [m] = await db
      .select({ id: paymentMethods.id, name: paymentMethods.name, branchId: paymentMethods.branchId, isActive: paymentMethods.isActive })
      .from(paymentMethods)
      .where(eq(paymentMethods.id, collected.paymentMethodId));
    if (!m || !m.isActive) throw new Error('El método de pago no existe o está inactivo');
    if (m.branchId != null && m.branchId !== doc.branchId) throw new Error(`El método "${m.name}" no pertenece a la sucursal del comprobante`);
    method = { id: m.id, name: m.name };
  }

  const [updated] = await db
    .update(billingDocuments)
    .set({
      paymentCollectedAt: new Date(),
      paymentCollectedBy: collectedBy,
      paymentCollectedMethodId: method?.id ?? null,
      paymentCollectedMethod: method?.name ?? null,
      paymentCollectedReference: collected.reference?.slice(0, 50) || null,
      updatedAt: new Date(),
    })
    .where(eq(billingDocuments.id, id))
    .returning();
  return updated;
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

  const [series] = await db
    .select({ isActiveFacturacion: cashRegisterDocumentSeries.isActiveFacturacion })
    .from(cashRegisterDocumentSeries)
    .where(eq(cashRegisterDocumentSeries.id, doc.seriesId));
  if (series && !series.isActiveFacturacion) {
    throw new Error('La facturación electrónica está deshabilitada para este tipo de documento en la caja');
  }

  const lines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, id));

  const taxRate = toNum(doc.taxRate);
  const orderItemIds = lines.map((line) => line.orderItemId).filter((id): id is number => id != null);
  const orderItemRows = orderItemIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.id, orderItemIds))
    : [];
  const orderItemMap = new Map(orderItemRows.map((row) => [row.id, row]));

  const lineCalcs: LineCalc[] = lines.map((l) => {
    const orderItem = l.orderItemId != null ? orderItemMap.get(l.orderItemId) : null;
    if (orderItem) {
      const resolved = resolveLineCalcFromSnapshot(orderItem as typeof orderItems.$inferSelect);
      if (resolved) return resolved;
    }

    return {
      orderItemId: l.orderItemId ?? null,
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
      igvAmount: toNum(l.taxAmount),
      // Línea sin taxSnapshot (documento previo a los impuestos por producto):
      // se infiere de si llevó impuesto o no.
      tipoAfectacion: (toNum(l.taxAmount) > 0 ? '10' : '20') as '10' | '20',
    };
  });

  // send() en el facturador es idempotente: upsert por xml_filename.
  // Si el comprobante ya existe, lo re-firma y re-envía a SUNAT actualizando el registro.
  const emitLines = await withAmountSplitLines(db, doc, lineCalcs, taxRate);
  await emitirYActualizarDoc(db, doc, emitLines, resolveDocumentTaxRate(emitLines, taxRate));

  const [updated] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  return { document: updated, lines };
}

// ── Correct buyer data and retry ──────────────────────────────────────────────

export interface BuyerCorrection {
  buyerDocType?: string | null;
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

  const [series] = await db
    .select({ isActiveFacturacion: cashRegisterDocumentSeries.isActiveFacturacion })
    .from(cashRegisterDocumentSeries)
    .where(eq(cashRegisterDocumentSeries.id, doc.seriesId));
  if (series && !series.isActiveFacturacion) {
    throw new Error('La facturación electrónica está deshabilitada para este tipo de documento en la caja');
  }

  await validateBuyerDocument(
    doc.branchId,
    doc.documentType as 'factura' | 'boleta' | 'nota_de_venta',
    (buyer.buyerDocType ?? doc.buyerDocType) ?? undefined,
    (buyer.buyerDocNumber ?? doc.buyerDocNumber) ?? undefined,
  );

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
  const orderItemIds = lines.map((line) => line.orderItemId).filter((id): id is number => id != null);
  const orderItemRows = orderItemIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.id, orderItemIds))
    : [];
  const orderItemMap = new Map(orderItemRows.map((row) => [row.id, row]));

  const lineCalcs: LineCalc[] = lines.map((l) => {
    const orderItem = l.orderItemId != null ? orderItemMap.get(l.orderItemId) : null;
    if (orderItem) {
      const resolved = resolveLineCalcFromSnapshot(orderItem as typeof orderItems.$inferSelect);
      if (resolved) return resolved;
    }

    return {
      orderItemId: l.orderItemId ?? null,
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
      igvAmount: toNum(l.taxAmount),
      // Línea sin taxSnapshot (documento previo a los impuestos por producto):
      // se infiere de si llevó impuesto o no.
      tipoAfectacion: (toNum(l.taxAmount) > 0 ? '10' : '20') as '10' | '20',
    };
  });

  const emitLines = await withAmountSplitLines(db, corrected, lineCalcs, taxRate);
  await emitirYActualizarDoc(db, corrected, emitLines, resolveDocumentTaxRate(emitLines, taxRate));

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

export async function getDocumentReceipt(id: number, userId?: number) {
  const db = getTenantDb();

  const [doc] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, id));

  if (!doc) return null;

  const rawLines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, id));

  // Desglose por impuesto: la tabla del documento guarda un solo `tax_amount`, así que
  // el detalle (IGV / ICBPER / impuesto_2·3) se toma del taxSnapshot del ítem del pedido.
  // Se une por billing_document_lines.order_item_id — la línea exacta que se facturó —
  // y no por el pedido completo, para que editar OTROS ítems no altere un comprobante
  // ya emitido. Si la línea no tiene ítem asociado (ej. nota de crédito externa) o el
  // ítem no tiene snapshot, queda sin desglose y el PDF cae al total agregado.
  const receiptItemIds = rawLines.map((l) => l.orderItemId).filter((v): v is number => v != null);
  const receiptItems = receiptItemIds.length
    ? await db.select({ id: orderItems.id, taxSnapshot: orderItems.taxSnapshot })
        .from(orderItems).where(inArray(orderItems.id, receiptItemIds))
    : [];
  const snapshotByItemId = new Map(receiptItems.map((r) => [r.id, r.taxSnapshot as TaxSnapshotEntry[] | null]));

  const lines = rawLines.map((l) => ({
    ...l,
    taxes: (l.orderItemId != null ? snapshotByItemId.get(l.orderItemId) : null) ?? null,
  }));
  const taxBreakdown = aggregateTaxBreakdown(lines.map((l) => l.taxes));

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

  // Emisor: snapshot del documento si existe; si no, desde el facturador (y se congela)
  const emisor = await resolveDocumentEmisor(db, doc);
  const issueDate = doc.issuedAt ? new Date(doc.issuedAt) : new Date();
  const dueDate = new Date(issueDate);
  const currencyLabel = doc.currency === 'USD' ? 'Dólares' : 'Soles';
  const serviceAmount = Math.max(roundMoney(toNum(doc.total) - toNum(doc.subtotal) - toNum(doc.taxAmount)), 0);
  const buyerDocLabel =
    doc.buyerDocType === 'RUC' ? 'R.U.C'
      : doc.buyerDocType === 'DNI' ? 'D.N.I'
        : doc.buyerDocType === 'CE' ? 'C.E.'
          : doc.buyerDocType ?? null;

  // Resolve activations
  let effectiveActivations: Record<string, boolean> = {};
  if (userId) {
    const activeSession = await getActiveSessionForUser(userId);
    if (activeSession?.registerId) {
      effectiveActivations = await resolveForRegister(activeSession.registerId);
    }
  }

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
      const mixed = await db
        .select({ paymentMethod: orderPayments.paymentMethod, amount: orderPayments.amount, tipAmount: orderPayments.tipAmount, reference: orderPayments.reference })
        .from(orderPayments)
        .where(eq(orderPayments.splitId, doc.splitId))
        .orderBy(orderPayments.id);

      paymentSummary = {
        paymentMethod: mixed.length > 0
          ? mixed.map((p) => `${p.paymentMethod} S/ ${toNum(p.amount).toFixed(2)}${p.reference ? ` (REF ${p.reference})` : ''}`).join(' + ')
          : (split.paymentMethod ?? null),
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
      // Pago mixto: la forma de pago se muestra desglosada ("Efectivo S/ 50.00 + Yape S/ 30.00")
      const mixed = await db
        .select({ paymentMethod: orderPayments.paymentMethod, amount: orderPayments.amount, tipAmount: orderPayments.tipAmount, reference: orderPayments.reference })
        .from(orderPayments)
        .where(eq(orderPayments.orderId, doc.orderId))
        .orderBy(orderPayments.id);
      paymentSummary = {
        paymentMethod: mixed.length > 0
          ? mixed.map((p) => `${p.paymentMethod} S/ ${toNum(p.amount).toFixed(2)}${p.reference ? ` (REF ${p.reference})` : ''}`).join(' + ')
          : (order.paymentMethod ?? null),
        retentionPercentage: order.retentionPercentage ?? '0.00',
        retentionAmount: order.retentionAmount ?? '0.00',
        chargedTotal: order.total ?? doc.total,
      };
    }
  }

  // Filter buyer data based on PRINT_CUSTOMER_HEADER
  const hideCustomerData = effectiveActivations['PRINT_CUSTOMER_HEADER'] === false;
  let finalDoc = doc;
  if (hideCustomerData) {
    finalDoc = {
      ...doc,
      buyerName: null,
      buyerDocType: null,
      buyerDocNumber: null,
      buyerAddress: null,
    };
  }

  // Descuento del pedido y tracking code (informativo)
  const [orderDiscount] = await db
    .select({
      discountAmount: orders.discountAmount,
      discountMotivo: orders.discountMotivo,
      trackingCode: orders.trackingCode,
    })
    .from(orders)
    .where(eq(orders.id, doc.orderId));

  if (orderDiscount?.trackingCode) {
    finalDoc = {
      ...finalDoc,
      orderTrackingCode: orderDiscount.trackingCode,
    };
  }

  return {
    document: finalDoc,
    lines,
    taxBreakdown,
    emisor,
    branch: {
      name: branch?.name ?? '',
      phone: branch?.phone ?? null,
      email: branch?.email ?? null,
      address: branch?.address?.fullAddress ?? null,
    },
    paymentSummary,
    meta: {
      issueDateTime: issueDate.toISOString(),
      dueDate: dueDate.toISOString(),
      currencyLabel,
      paymentMethod: paymentSummary?.paymentMethod ?? null,
      creditDays: null,
      purchaseOrder: null,
      advanceAmount: '0.00',
      serviceAmount: String(serviceAmount.toFixed(2)),
      buyerDocLabel,
      discountAmount: orderDiscount?.discountAmount ?? '0.00',
      discountMotivo: orderDiscount?.discountMotivo ?? null,
      orderTrackingCode: orderDiscount?.trackingCode ?? null,
    },
  };
}

// ── Void document ──────────────────────────────────────────────────────────────

// SUNAT requiere fechas en zona Lima (UTC-5), no en UTC
function limaDateStr(d: Date): string {
  const lima = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return lima.toISOString().slice(0, 10);
}

// Fecha-hora ISO en hora de Lima con su offset (ej. 2026-10-21T13:33:25.624-05:00).
// Antes se etiquetaba la hora UTC como -05:00 sin convertirla: las ventas de 19:00 a
// 23:59 (Lima) se declaraban a SUNAT con la fecha del día siguiente.
function limaDateTimeStr(d: Date): string {
  const lima = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return lima.toISOString().replace('Z', '-05:00');
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

export async function voidDocument(
  id: number,
  reason: string,
  cancelOrder = false,
  password?: string,
  actor?: AuditActor,
) {
  const db = getTenantDb();
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status !== 'issued') throw new Error(`No se puede anular un documento en estado '${doc.status}'`);
  if (!reason?.trim()) throw new Error('Se requiere un motivo de anulación');

  // Anular también el pedido: solo si este es su único comprobante vigente (las notas de
  // crédito no cuentan). Con cuentas divididas, los otros comprobantes quedarían sin pedido.
  // Se valida antes de emitir la NC o tocar la caja.
  if (cancelOrder) {
    const [otherDoc] = await db
      .select({ documentNumber: billingDocuments.documentNumber })
      .from(billingDocuments)
      .where(and(
        eq(billingDocuments.orderId, doc.orderId),
        eq(billingDocuments.status, 'issued'),
        sql`${billingDocuments.id} <> ${doc.id}`,
        sql`${billingDocuments.documentType} <> 'nota_de_credito'`,
      ))
      .limit(1);
    if (otherDoc) {
      throw new Error(`No se puede anular también el pedido: tiene otro comprobante vigente (${otherDoc.documentNumber}). Anula solo este comprobante o anula primero los demás`);
    }
  }

  // 1. Autorización por contraseña si la activación PASSWORD_VOID_DOCUMENT está activa
  let authorizedById: number | null = null;
  const session = actor?.userId ? await getActiveSessionForUser(actor.userId) : null;
  let effective: Record<string, boolean> = {};
  if (session?.registerId != null) {
    effective = await resolveForRegister(session.registerId);
  }
  if (effective['PASSWORD_VOID_DOCUMENT']) {
    const auth = await authorizeByPassword('seguridad.autorizar_anular_documento', password ?? '');
    if (!auth) throw new Error('Contraseña de autorización inválida');
    authorizedById = auth.userId;
  }

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

  await releaseOrderItemLinks(db, id);

  // 2. Revertir el cobro en caja y eliminar order_payments
  try {
    if (doc.splitId != null) {
      await reverseSplitSaleIncome(doc.splitId, actor);
      await db.delete(orderPayments).where(eq(orderPayments.splitId, doc.splitId));
      await db.update(orderSplits).set({
        paymentStatus: 'unpaid',
        paymentMethod: null,
        paymentMethodId: null,
        retentionPercentage: '0.00',
        retentionAmount: '0.00',
        tipAmount: '0.00',
        updatedAt: new Date(),
      }).where(eq(orderSplits.id, doc.splitId));
      await syncOrderPaymentStatus(db, doc.orderId);
    } else {
      await reverseOrderSaleMovement(doc.orderId, actor);
      await db.delete(orderPayments).where(eq(orderPayments.orderId, doc.orderId));
    }
  } catch (err) {
    console.error('Error al revertir ingreso de caja al anular comprobante:', err);
  }

  // 3. Destino del pedido: Cancelar O Revivir
  if (cancelOrder) {
    const { updateOrderStatus } = await import('../documents/order.service');
    await updateOrderStatus(doc.orderId, 'cancelled');
    // Misma trazabilidad que la anulación de pedido del POS: motivo, quién y cuándo
    await db.update(orders).set({
      motivo: reason.trim().slice(0, 200),
      deletedDate: new Date(),
      deletedById: actor?.userId ?? null,
      authorizedById,
      updatedAt: new Date(),
    }).where(eq(orders.id, doc.orderId));
  } else {
    // REVIVIR EL PEDIDO: vuelve a pendiente de pago y estado activo
    const [order] = await db.select().from(orders).where(eq(orders.id, doc.orderId));
    if (order && doc.splitId == null) {
      const revivedStatus = order.tableId ? ('confirmed' as const) : ('ready_for_pickup' as const);
      await db.update(orders).set({
        paymentStatus: 'unpaid',
        status: revivedStatus,
        paymentMethod: null,
        paymentMethodId: null,
        collectedSessionId: null,
        retentionPercentage: '0.00',
        retentionAmount: '0.00',
        tipAmount: '0.00',
        updatedAt: new Date(),
      }).where(eq(orders.id, doc.orderId));

      if (order.tableId) {
        await db.update(tables).set({
          statusCode: 'occupied',
          statusUpdatedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(tables.id, order.tableId));
      }
    }
  }

  // 4. Auditoría
  await writeAuditLog({
    tableName: 'billing_documents',
    operation: 'UPDATE',
    recordId: id,
    afterData: { status: 'voided', reason, cancelOrder, authorizedById },
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'facturacion',
    description: `Comprobante ${doc.documentNumber} (${doc.documentType}) anulado. Pedido ${doc.orderId} ${cancelOrder ? 'cancelado' : 'revivido a pendiente de pago'}. Motivo: ${reason.trim()}`,
  });

  const [final] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id));
  return final;
}

// Un pedido anulado puede volver a facturarse (el guard de duplicados excluye los
// documentos 'voided'), pero billing_document_lines.order_item_id tiene índice único:
// si el documento anulado conserva el vínculo, la re-emisión choca con 23505. Al
// anular se libera el vínculo — el documento anulado conserva sus importes y solo
// pierde el desglose por impuesto, que ya no se imprime.
async function releaseOrderItemLinks(
  db: TenantDb,
  documentId: number,
): Promise<void> {
  await db
    .update(billingDocumentLines)
    .set({ orderItemId: null })
    .where(eq(billingDocumentLines.documentId, documentId));
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

  const [originalSeries] = await db
    .select({ registerId: cashRegisterDocumentSeries.registerId })
    .from(cashRegisterDocumentSeries)
    .where(eq(cashRegisterDocumentSeries.id, doc.seriesId))
    .limit(1);

  const registerId = originalSeries?.registerId;
  if (!registerId) {
    throw new Error('No se pudo encontrar la caja del comprobante original');
  }

  const [existing] = await db
    .select()
    .from(cashRegisterDocumentSeries)
    .where(and(
      eq(cashRegisterDocumentSeries.registerId, registerId),
      eq(cashRegisterDocumentSeries.series, seriesCode),
      eq(cashRegisterDocumentSeries.receiptTypeCode, '07')
    ))
    .limit(1);

  if (existing) {
    if (!existing.isActive) {
      const [updated] = await db
        .update(cashRegisterDocumentSeries)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(cashRegisterDocumentSeries.id, existing.id))
        .returning();
      return updated.id;
    }
    return existing.id;
  }

  const [created] = await db
    .insert(cashRegisterDocumentSeries)
    .values({
      registerId,
      receiptTypeCode: '07',
      series: seriesCode,
      description: doc.documentType === 'factura'
        ? 'Nota de crédito para facturas'
        : 'Nota de crédito para boletas',
      initialSequential: 1,
      lastSequential: 0,
      isActiveFacturacion: true,
      isActive: true,
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
  let resolvedAnexo: string | null = null;

  try {
    const { ruc, anexo } = await resolveFacturadorConfig(db, savedNC.branchId);
    resolvedAnexo = anexo;

    const tipoDocOriginal = originalDoc.documentType === 'factura' ? '01' : '03';
    const buyerTipoDoc = savedNC.buyerDocType === 'RUC' ? '6' : savedNC.buyerDocType === 'DNI' ? '1' : '0';

    const orderItemIds = lines.map((line) => line.orderItemId).filter((id): id is number => id != null);
    const orderItemRows = orderItemIds.length
      ? await db.select().from(orderItems).where(inArray(orderItems.id, orderItemIds))
      : [];
    const orderItemMap = new Map(orderItemRows.map((row) => [row.id, row]));

    // Misma fuente que la factura/boleta: el desglose congelado de la línea del pedido
    // (afectación, IGV, ICBPER y recargo al consumo); sin él, los importes guardados.
    const ncLines = lines.map((l) => {
      const orderItem = l.orderItemId != null ? orderItemMap.get(l.orderItemId) : null;
      const resolved = orderItem ? resolveLineCalcFromSnapshot(orderItem as typeof orderItems.$inferSelect) : null;
      return {
        codigo: String(l.productId ?? l.id),
        source: resolved
          ? { ...resolved, productName: l.productName, alternativesDesc: l.alternativesDesc }
          : {
              productId: l.productId,
              productName: l.productName,
              alternativesDesc: l.alternativesDesc,
              quantity: l.quantity,
              subtotal: toNum(l.subtotal),
              taxAmount: toNum(l.taxAmount),
              lineTotal: toNum(l.lineTotal),
              tipoAfectacion: '10' as const,
            },
      };
    });
    const ncSources = ncLines.map((l) => l.source);

    // NC total de un comprobante de cuenta por monto: mismas líneas repartidas que el original
    const splitLines = lines.length > 0 && lines.every((l) => l.orderItemId == null)
      && roundMoney(toNum(savedNC.total)) === roundMoney(toNum(originalDoc.total))
      ? await withAmountSplitLines(db, originalDoc, ncSources as unknown as LineCalc[], taxRate)
      : null;
    const emitNcLines = splitLines && splitLines !== (ncSources as unknown as LineCalc[])
      ? splitLines.map((l, i) => ({ codigo: String(l.productId ?? i + 1), source: l }))
      : ncLines;
    const emitNcSources = emitNcLines.map((l) => l.source);

    const res = await emitirNotaCredito({
      emisor: { ruc, ...(anexo ? { cod_local: anexo } : {}) },
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
        fecha_emision: limaDateTimeStr(new Date(savedNC.issuedAt!)),
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
      // Las notas no admiten cac:AllowanceCharge en Greenter: el recargo va solo como
      // otros_cargos (ChargeTotalAmount).
      totales: buildSunatTotales(emitNcSources, savedNC),
      detalles: emitNcLines.map((l) => buildSunatDetalle(l.source, l.codigo, taxRate)),
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
      sunatAnexo: resolvedAnexo,
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
      .from(cashRegisterDocumentSeries)
      .where(eq(cashRegisterDocumentSeries.id, input.seriesId))
      .for('update');

    if (!series || !series.isActive) throw new Error('Serie NC no encontrada o inactiva');
    const docType = series.receiptTypeCode ? documentTypeFromReceiptCode(series.receiptTypeCode) : 'nota_de_venta';
    if (docType !== 'nota_de_credito') {
      throw new Error(`La serie '${series.series}' no es de tipo nota_de_credito`);
    }

    const sequential = series.lastSequential + 1;
    const documentNumber = `${series.series}-${padSequential(sequential)}`;

    await tx
      .update(cashRegisterDocumentSeries)
      .set({ lastSequential: sequential, updatedAt: new Date() })
      .where(eq(cashRegisterDocumentSeries.id, series.id));

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
    await releaseOrderItemLinks(db, docId);
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
  const { ruc, anexo } = await resolveFacturadorConfig(db, input.branchId);

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
    emisor: { ruc, ...(anexo ? { cod_local: anexo } : {}) },
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
      fecha_emision: limaDateTimeStr(new Date()),
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
      .from(cashRegisterDocumentSeries)
      .where(and(
        eq(cashRegisterDocumentSeries.series, input.serieNC),
        eq(cashRegisterDocumentSeries.receiptTypeCode, '07')
      ))
      .limit(1);
    if (serie) {
      const correlativo = parseInt(input.correlativoNC, 10);
      if (correlativo > serie.lastSequential) {
        await db
          .update(cashRegisterDocumentSeries)
          .set({ lastSequential: correlativo, updatedAt: new Date() })
          .where(eq(cashRegisterDocumentSeries.id, serie.id));
      }
    }
  }

  return res;
}
