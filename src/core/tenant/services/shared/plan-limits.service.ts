import { and, eq } from 'drizzle-orm';
import { masterDb } from '@/db';
import { planFeatureDefinitions, tenants } from '@/db/master/schema';
import { getTenantId } from '@/utils/tenant-context';

// ─── Límites de plan que el sistema aplica ──────────────────────────────────
// Cada clave se configura desde el Super Admin (catálogo "Características de Planes" + valor en cada plan).
// Resolución del límite: valor en plans.features → valor por defecto del catálogo → sin límite.
// Solo se aplican en el admin del restaurante; el Super Admin no queda limitado.

export interface SupportedPlanLimit {
  key: string;
  label: string;
  unit: string;
  /** Qué bloquea al llegar al máximo (se muestra en la leyenda del Super Admin) */
  effect: string;
}

export const SUPPORTED_PLAN_LIMITS: SupportedPlanLimit[] = [
  { key: 'maxProducts', label: 'Máximo de productos', unit: 'productos', effect: 'Bloquea crear o importar productos al llegar al máximo.' },
  { key: 'maxBranches', label: 'Máximo de sucursales', unit: 'sucursales', effect: 'Bloquea crear sucursales nuevas.' },
  { key: 'maxUsers', label: 'Máximo de usuarios', unit: 'usuarios', effect: 'Bloquea crear o reactivar usuarios (no cuenta los eliminados).' },
  { key: 'maxCashRegisters', label: 'Máximo de cajas', unit: 'cajas', effect: 'Bloquea crear cajas nuevas.' },
  { key: 'maxBrands', label: 'Máximo de marcas', unit: 'marcas', effect: 'Bloquea crear marcas nuevas.' },
];

export type PlanLimitKey = 'maxProducts' | 'maxBranches' | 'maxUsers' | 'maxCashRegisters' | 'maxBrands';

const toLimit = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
};

/** Límite vigente del tenant actual para `key`, o null si no tiene límite. */
export async function getPlanLimit(key: PlanLimitKey): Promise<number | null> {
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, getTenantId()),
    with: { plan: { columns: { features: true } } },
  });
  const features = (tenant?.plan?.features ?? {}) as Record<string, unknown>;
  if (key in features) return toLimit(features[key]);

  // Si el catálogo no se puede leer (p. ej. falta la migración 0018) no se bloquea la operación
  try {
    const [definition] = await masterDb
      .select({ defaultValue: planFeatureDefinitions.defaultValue })
      .from(planFeatureDefinitions)
      .where(and(eq(planFeatureDefinitions.key, key), eq(planFeatureDefinitions.isActive, true)));
    return toLimit(definition?.defaultValue);
  } catch (error) {
    console.error(`[plan-limits] No se pudo leer el catálogo para "${key}"; se aplica sin límite:`, error);
    return null;
  }
}

/** Error de negocio: se alcanzó un límite del plan (los controllers responden 400). */
export class PlanLimitError extends Error {}

/** Lanza un error legible si crear `adding` elementos más supera el límite del plan. */
export async function assertPlanLimit(key: PlanLimitKey, currentCount: number, adding = 1) {
  const limit = await getPlanLimit(key);
  if (limit === null || currentCount + adding <= limit) return;
  const unit = SUPPORTED_PLAN_LIMITS.find((l) => l.key === key)?.unit ?? 'elementos';
  throw new PlanLimitError(`Tu plan permite un máximo de ${limit} ${unit}. Contacta con soporte para ampliarlo`);
}
