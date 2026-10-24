import { asc, eq, sql } from 'drizzle-orm';
import { masterDb } from '../../../db';
import { planFeatureDefinitions, plans } from '../../../db/master/schema';
import type { CreatePlanFeatureInput, UpdatePlanFeatureInput } from '../validations/plan-features.validation';
import { SUPPORTED_PLAN_LIMITS } from '../../tenant/services/shared/plan-limits.service';

/**
 * Claves que el sistema aplica de verdad (registro en tenant/services/shared/plan-limits.service.ts).
 * Las demás son descriptivas: se guardan y se muestran, pero no bloquean nada.
 */
export const ENFORCED_PLAN_FEATURE_KEYS = new Set(SUPPORTED_PLAN_LIMITS.map((l) => l.key));

/** Leyenda: límites que el sistema sabe aplicar y si ya están en el catálogo. */
export async function getSupportedPlanLimits() {
  const rows = await masterDb.select({ key: planFeatureDefinitions.key }).from(planFeatureDefinitions);
  const inCatalog = new Set(rows.map((r) => r.key));
  return SUPPORTED_PLAN_LIMITS.map((l) => ({ ...l, valueType: 'number' as const, inCatalog: inCatalog.has(l.key) }));
}

type FeatureRow = typeof planFeatureDefinitions.$inferSelect;
type FeatureValue = number | boolean | string | null;

const withEnforced = (row: FeatureRow) => ({ ...row, isEnforced: ENFORCED_PLAN_FEATURE_KEYS.has(row.key) });

/** "Máximo de sucursales" → "maximoDeSucursales" */
function keyFromLabel(label: string) {
  const words = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
  return /^[a-zA-Z]/.test(key) ? key.slice(0, 60) : `f${key}`.slice(0, 60);
}

function assertValueType(label: string, valueType: string, value: unknown) {
  if (value === null || value === undefined) return;
  if (valueType === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error(`"${label}" debe ser un número mayor o igual a 0`);
  }
  if (valueType === 'boolean' && typeof value !== 'boolean') throw new Error(`"${label}" debe ser Sí o No`);
  if (valueType === 'text' && typeof value !== 'string') throw new Error(`"${label}" debe ser un texto`);
}

export async function getAllPlanFeatures() {
  const rows = await masterDb
    .select()
    .from(planFeatureDefinitions)
    .orderBy(asc(planFeatureDefinitions.displayOrder), asc(planFeatureDefinitions.label));
  return rows.map(withEnforced);
}

export async function createPlanFeature(data: CreatePlanFeatureInput) {
  const key = data.key?.trim() || keyFromLabel(data.label);
  const [existing] = await masterDb.select({ id: planFeatureDefinitions.id }).from(planFeatureDefinitions).where(eq(planFeatureDefinitions.key, key));
  if (existing) throw new Error(`Ya existe una característica con la clave "${key}"`);
  if (ENFORCED_PLAN_FEATURE_KEYS.has(key) && data.valueType !== 'number') {
    throw new Error(`"${key}" es un límite que aplica el sistema y debe ser de tipo número`);
  }

  assertValueType(data.label, data.valueType, data.defaultValue);
  const [created] = await masterDb.insert(planFeatureDefinitions).values({
    key,
    label: data.label,
    description: data.description ?? null,
    valueType: data.valueType,
    unit: data.valueType === 'number' ? (data.unit ?? null) : null,
    defaultValue: data.defaultValue ?? null,
    displayOrder: data.displayOrder ?? 0,
    isActive: data.isActive ?? true,
  }).returning();
  return withEnforced(created);
}

export async function updatePlanFeature(id: number, data: UpdatePlanFeatureInput) {
  const [current] = await masterDb.select().from(planFeatureDefinitions).where(eq(planFeatureDefinitions.id, id));
  if (!current) throw new Error('Característica no encontrada');

  if (data.defaultValue !== undefined) assertValueType(data.label ?? current.label, current.valueType, data.defaultValue);
  const [updated] = await masterDb
    .update(planFeatureDefinitions)
    .set({
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.unit !== undefined ? { unit: current.valueType === 'number' ? data.unit : null } : {}),
      ...(data.defaultValue !== undefined ? { defaultValue: data.defaultValue } : {}),
      ...(data.displayOrder !== undefined ? { displayOrder: data.displayOrder } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(planFeatureDefinitions.id, id))
    .returning();
  return withEnforced(updated);
}

/** No se borra si el sistema la aplica o si algún plan la usa (se puede desactivar). */
export async function deletePlanFeature(id: number) {
  const [current] = await masterDb.select().from(planFeatureDefinitions).where(eq(planFeatureDefinitions.id, id));
  if (!current) throw new Error('Característica no encontrada');
  if (ENFORCED_PLAN_FEATURE_KEYS.has(current.key)) {
    throw new Error('Esta característica la aplica el sistema y no se puede eliminar; puedes desactivarla');
  }
  const usedBy = await masterDb
    .select({ name: plans.name })
    .from(plans)
    .where(sql`${plans.features} ? ${current.key}`);
  if (usedBy.length > 0) {
    throw new Error(`La usan los planes: ${usedBy.map((p) => p.name).join(', ')}. Quítala de esos planes o desactívala`);
  }
  await masterDb.delete(planFeatureDefinitions).where(eq(planFeatureDefinitions.id, id));
  return { message: 'Característica eliminada' };
}

/**
 * Valida los valores de un plan contra el catálogo: las claves registradas deben tener el
 * tipo correcto. Las claves no registradas se aceptan (planes antiguos) sin validar.
 */
export async function validatePlanFeatureValues(features: Record<string, unknown> | undefined) {
  if (!features) return;
  const keys = Object.keys(features);
  if (keys.length === 0) return;
  const defs = await masterDb.select().from(planFeatureDefinitions);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  for (const key of keys) {
    const def = byKey.get(key);
    if (def) assertValueType(def.label, def.valueType, features[key] as FeatureValue);
  }
}
