import { eq, sql } from 'drizzle-orm';
import { orderItems, products } from '../../../../db/tenant/schema';
import { getTenantDb } from '../../../../utils/tenant-context';

/**
 * Stock manual por producto (independiente del almacén de insumos/recetas).
 * Se usa en pedidos de mostrador/mozo: cada producto puede tener un tope fijo
 * (`products.stock`, null = sin límite) que se descuenta al vender y se repone
 * al eliminar el item o anular el pedido.
 */

export function assertStockAvailable(product: { id: number; name: string; stock: number | null }, requestedQty: number) {
  if (product.stock === null || product.stock === undefined) return;
  if (requestedQty > product.stock) {
    throw new Error(
      `Stock insuficiente para "${product.name}". Disponible: ${product.stock}, solicitado: ${requestedQty}.`
    );
  }
}

export async function adjustProductStock(
  db: ReturnType<typeof getTenantDb>,
  productId: number,
  delta: number
) {
  if (!delta) return;
  // Si stock es NULL (sin límite), NULL + delta sigue siendo NULL — no hace falta filtrar.
  await db
    .update(products)
    .set({ stock: sql`${products.stock} + ${delta}` })
    .where(eq(products.id, productId));
}

/**
 * Repone el stock de todos los items actualmente en el pedido (usado al cancelar/anular).
 */
export async function restoreProductStockForOrder(db: ReturnType<typeof getTenantDb>, orderId: string) {
  const rows = await db
    .select({ productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const qtyByProduct = new Map<number, number>();
  for (const row of rows) {
    if (!row.productId) continue;
    qtyByProduct.set(row.productId, (qtyByProduct.get(row.productId) ?? 0) + row.quantity);
  }

  for (const [productId, qty] of qtyByProduct) {
    await adjustProductStock(db, productId, qty);
  }
}
