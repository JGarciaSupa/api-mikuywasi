import { and, eq, inArray } from 'drizzle-orm';
import { branches, cashRegisterDocumentSeries, cashRegisters, paymentMethods, reasons } from '@/db/tenant/schema';
import type { getTenantDb } from '@/utils/tenant-context';

// Datos estándar con los que arranca un restaurante para poder operar sin configurar
// nada antes (método de pago Efectivo, motivos de eliminación y anulación, y las series
// de cada caja). Todas las funciones son idempotentes: solo crean lo que falta (o renombran
// impuestos con el nombre por defecto antiguo) y nunca borran lo que el restaurante configuró.
//
// Reciben la conexión porque también se usan al crear el tenant (antes de que exista el
// contexto) y dentro de transacciones.
type TenantDb = Pick<ReturnType<typeof getTenantDb>, 'select' | 'insert' | 'update'>;

export const DEFAULT_PAYMENT_METHOD = { name: 'Efectivo', isCash: true } as const;

export const DEFAULT_REASONS: { type: 'order_cancel' | 'document_void'; description: string }[] = [
  // Eliminación de productos de un pedido
  { type: 'order_cancel', description: 'Error al tomar el pedido' },
  { type: 'order_cancel', description: 'El cliente desistió' },
  { type: 'order_cancel', description: 'Producto agotado' },
  { type: 'order_cancel', description: 'Demora en la preparación' },
  { type: 'order_cancel', description: 'Producto en mal estado' },
  // Anulación de comprobantes
  { type: 'document_void', description: 'Error en los datos del cliente' },
  { type: 'document_void', description: 'Error en el monto o los productos' },
  { type: 'document_void', description: 'Cambio de tipo de comprobante' },
  { type: 'document_void', description: 'Devolución al cliente' },
];

// Comprobantes de cada caja nueva. La nota de crédito no se incluye: su serie se crea
// sola al anular (ensureCreditNoteSeries).
const DEFAULT_REGISTER_DOCUMENTS = [
  { receiptTypeCode: '03', prefix: 'B', digits: 3, description: 'Boleta de venta' },
  { receiptTypeCode: '01', prefix: 'F', digits: 3, description: 'Factura' },
  // Documento interno: mismo código global del catálogo maestro (receipt_types 'INTERNO')
  { receiptTypeCode: 'INTERNO', prefix: 'NV', digits: 2, description: 'Cuenta interna' },
] as const;

/** Crea el método de pago Efectivo (para todas las sedes) si el tenant no tiene ninguno. */
export async function ensureDefaultPaymentMethods(db: TenantDb) {
  const [existing] = await db.select({ id: paymentMethods.id }).from(paymentMethods).limit(1);
  if (existing) return 0;
  await db.insert(paymentMethods).values({ ...DEFAULT_PAYMENT_METHOD, branchId: null, isActive: true });
  return 1;
}

/** Crea los motivos estándar de un tipo solo si la sucursal no tiene ninguno de ese tipo. */
export async function ensureDefaultReasons(db: TenantDb, branchId: number) {
  const types = [...new Set(DEFAULT_REASONS.map((r) => r.type))];
  const existing = await db
    .select({ type: reasons.type })
    .from(reasons)
    .where(and(eq(reasons.branchId, branchId), inArray(reasons.type, types)));
  const configured = new Set(existing.map((r) => r.type));

  const toInsert = DEFAULT_REASONS.filter((r) => !configured.has(r.type)).map((r) => ({ ...r, branchId }));
  if (toInsert.length > 0) await db.insert(reasons).values(toInsert);
  return toInsert.length;
}

/**
 * Asigna a una caja sin series las de boleta, factura y cuenta interna, con el siguiente
 * número libre del tenant (B001, B002…; las series son únicas por tipo de comprobante).
 * La emisión electrónica de boleta/factura copia la de las otras cajas: en un restaurante
 * que aún no factura queda apagada y sus comprobantes no se envían a SUNAT.
 */
export async function ensureDefaultRegisterSeries(db: TenantDb, registerId: number) {
  const [linked] = await db
    .select({ id: cashRegisterDocumentSeries.id })
    .from(cashRegisterDocumentSeries)
    .where(eq(cashRegisterDocumentSeries.registerId, registerId))
    .limit(1);
  if (linked) return 0;

  const all = await db
    .select({
      receiptTypeCode: cashRegisterDocumentSeries.receiptTypeCode,
      series: cashRegisterDocumentSeries.series,
      isActiveFacturacion: cashRegisterDocumentSeries.isActiveFacturacion,
      branchId: cashRegisters.branchId,
    })
    .from(cashRegisterDocumentSeries)
    .innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterDocumentSeries.registerId));

  const [register] = await db.select({ branchId: cashRegisters.branchId }).from(cashRegisters).where(eq(cashRegisters.id, registerId));
  if (!register) return 0;

  const values = DEFAULT_REGISTER_DOCUMENTS.map((doc) => {
    const sameType = all.filter((s) => s.receiptTypeCode === doc.receiptTypeCode);
    const used = new Set(sameType.map((s) => s.series.toUpperCase()));
    let n = 1;
    const format = (i: number) => `${doc.prefix}${String(i).padStart(doc.digits, '0')}`;
    while (used.has(format(n))) n++;

    const isElectronic = doc.receiptTypeCode === '01' || doc.receiptTypeCode === '03';
    const sameBranch = sameType.filter((s) => s.branchId === register.branchId);
    const reference = sameBranch.length > 0 ? sameBranch : sameType;
    return {
      registerId,
      series: format(n),
      receiptTypeCode: doc.receiptTypeCode,
      description: doc.description,
      initialSequential: 1,
      lastSequential: 0,
      isActive: true,
      isActiveFacturacion: isElectronic ? reference.some((s) => s.isActiveFacturacion) : false,
    };
  });

  await db.insert(cashRegisterDocumentSeries).values(values);
  return values.length;
}

// Nombres por defecto antiguos → nuevos. Solo se cambian si el restaurante no los editó.
const LEGACY_TAX_LABELS: Record<string, { from: string; to: string }> = {
  impuesto_1: { from: 'Aplica Impuesto 1', to: 'IGV' },
  impuesto_2: { from: 'Aplica Impuesto 2', to: 'Impuesto adicional 2' },
  impuesto_3: { from: 'Aplica Impuesto 3', to: 'Impuesto adicional 3' },
  recargo_consumo: { from: 'Recargo al consumo', to: 'Recargo al consumo (RC)' },
};

/** Renombra los impuestos de una sucursal que conservan el nombre por defecto antiguo. */
export async function ensureDefaultTaxLabels(db: TenantDb, branchId: number) {
  const [branch] = await db.select({ taxes: branches.taxes }).from(branches).where(eq(branches.id, branchId));
  if (!branch?.taxes?.length) return 0;

  let changed = 0;
  const taxes = branch.taxes.map((tax) => {
    const legacy = LEGACY_TAX_LABELS[tax.key];
    if (!legacy || tax.label !== legacy.from) return tax;
    changed++;
    return { ...tax, label: legacy.to };
  });
  if (changed > 0) await db.update(branches).set({ taxes, updatedAt: new Date() }).where(eq(branches.id, branchId));
  return changed;
}
