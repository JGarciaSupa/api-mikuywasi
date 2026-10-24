import { count } from 'drizzle-orm';
import { products } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import { getPlanLimit } from '@/core/tenant/services/shared/plan-limits.service';

/**
 * Máximo de productos permitido para el tenant actual, o null si no tiene límite.
 * Sale de `plans.features.maxProducts`; si el plan no la define, del valor por defecto
 * del catálogo de características (ambos configurables desde el Super Admin).
 */
export async function getMaxProductsForTenant(): Promise<number | null> {
  return getPlanLimit('maxProducts');
}

export interface ProductCapacity {
  /** null = sin límite */
  maxProducts: number | null;
  current: number;
  /** null = sin límite */
  remaining: number | null;
  unlimited: boolean;
}

/** Capacidad de productos del tenant actual: límite del plan, usados y disponibles. */
export async function getProductCapacity(): Promise<ProductCapacity> {
  const db = getTenantDb();
  const maxProducts = await getMaxProductsForTenant();
  const [result] = await db.select({ count: count() }).from(products);
  const current = Number(result?.count ?? 0);
  return {
    maxProducts,
    current,
    remaining: maxProducts === null ? null : Math.max(0, maxProducts - current),
    unlimited: maxProducts === null,
  };
}
