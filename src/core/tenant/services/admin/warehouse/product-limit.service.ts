import { count, eq } from 'drizzle-orm';
import { masterDb } from '@/db';
import { tenants } from '@/db/master/schema';
import { products } from '@/db/tenant/schema';
import { getTenantDb, getTenantId } from '@/utils/tenant-context';

// Límite de productos por tenant cuando el plan no define `features.maxProducts`.
// Es el valor que existía fijo en createProduct: mantenerlo como default preserva
// el comportamiento de los tenants cuyo plan no tiene la característica.
export const DEFAULT_MAX_PRODUCTS = 150;

/**
 * Máximo de productos permitido para el tenant actual.
 * Se lee de `plans.features.maxProducts` (master), configurable desde el super admin
 * como característica numérica del plan. Si no existe o no es un entero positivo,
 * se usa DEFAULT_MAX_PRODUCTS.
 */
export async function getMaxProductsForTenant(): Promise<number> {
  const tenantId = getTenantId();
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    with: { plan: { columns: { features: true } } },
  });

  const raw = (tenant?.plan?.features as Record<string, unknown> | null | undefined)?.maxProducts;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_PRODUCTS;
}

export interface ProductCapacity {
  maxProducts: number;
  current: number;
  remaining: number;
}

/** Capacidad de productos del tenant actual: límite del plan, usados y disponibles. */
export async function getProductCapacity(): Promise<ProductCapacity> {
  const db = getTenantDb();
  const maxProducts = await getMaxProductsForTenant();
  const [result] = await db.select({ count: count() }).from(products);
  const current = Number(result?.count ?? 0);
  return { maxProducts, current, remaining: Math.max(0, maxProducts - current) };
}
