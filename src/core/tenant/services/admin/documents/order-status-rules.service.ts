import { eq } from 'drizzle-orm';
import { orders } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';

// Reglas de los endpoints GENÉRICOS de cambio de estado (PATCH .../status, .../payment-status y
// el de cocina). Antes los estados se cambiaban a mano; ahora cada estado lo pone una acción
// concreta (enviar a cocina, cocina, cobrar, anular) y estos endpoints solo aceptan transiciones
// que no rompen la conciliación de cobros. Los flujos internos (cobro, cuentas divididas,
// anulación con motivo, anular desde Documentos) no pasan por aquí.

const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'dispatched', 'ready_for_pickup', 'completed', 'cancelled'] as const;
const PAYMENT_STATUSES = ['unpaid', 'paid', 'review_pending'] as const;
const TERMINAL = ['completed', 'cancelled'];

/** Devuelve el motivo del rechazo, o null si la transición manual es válida (o el pedido no existe: lo resuelve el flujo normal). */
export async function manualOrderStatusError(orderId: string, next: unknown): Promise<string | null> {
  if (typeof next !== 'string' || !(ORDER_STATUSES as readonly string[]).includes(next)) {
    return 'Estado de pedido no válido';
  }
  const db = getTenantDb();
  const [order] = await db
    .select({ status: orders.status, paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) return null;

  if (order.status === next) return null;
  if (TERMINAL.includes(order.status)) {
    return `El pedido ya está ${order.status === 'completed' ? 'completado' : 'anulado'} y no puede cambiar de estado`;
  }
  if (next === 'cancelled') {
    return 'Para anular un pedido usa "Anular pedido" (pide motivo, revierte caja y stock)';
  }
  if (next === 'completed' && order.paymentStatus !== 'paid') {
    return 'El pedido se completa automáticamente al cobrarlo: primero registra el cobro';
  }
  if (next === 'pending') {
    return 'Un pedido no puede volver a "pendiente"';
  }
  return null;
}

/** Igual que manualOrderStatusError, para el estado de pago. */
export async function manualPaymentStatusError(orderId: string, next: unknown): Promise<string | null> {
  if (typeof next !== 'string' || !(PAYMENT_STATUSES as readonly string[]).includes(next)) {
    return 'Estado de pago no válido';
  }
  if (next === 'review_pending') {
    return 'El pago parcial lo calcula el sistema al cobrar cuentas divididas';
  }
  const db = getTenantDb();
  const [order] = await db
    .select({ status: orders.status, paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) return null;

  if (order.status === 'cancelled') return 'No se puede cambiar el pago de un pedido anulado';
  if (order.paymentStatus === 'paid' && next === 'unpaid') {
    return 'Un cobro no se revierte a mano: anula el comprobante en Documentos (revierte la caja y deja el pedido por cobrar)';
  }
  return null;
}
