import { and, eq, asc } from 'drizzle-orm';
import { masterDb } from '@/db';
import { activations } from '@/db/master/schema';
import { registerActivations } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';

// ─── Activaciones por caja ───────────────────────────────────────────────────
// El catálogo (qué activaciones existen) vive en el maestro; el estado ON/OFF
// vive por caja en el tenant. Valor efectivo = override de la caja ?? default
// del maestro. Sin nivel corporación por ahora.

interface RegisterActivationView {
  code: string;
  name: string;
  description: string | null;
  module: string;
  category: string;
  defaultEnabled: boolean;
  isEnabled: boolean;    // valor efectivo (override de la caja o default)
  isOverridden: boolean; // true si la caja tiene un valor propio guardado
}

// Catálogo de activaciones activas del maestro + estado propio de la caja.
// Si se pasa `module`, solo se devuelven las de ese módulo (para acotar la pantalla).
export async function listForRegister(registerId: number, module?: string): Promise<RegisterActivationView[]> {
  const catalog = await masterDb
    .select()
    .from(activations)
    .where(module
      ? and(eq(activations.isActive, true), eq(activations.module, module))
      : eq(activations.isActive, true))
    .orderBy(asc(activations.category), asc(activations.order), asc(activations.name));

  const db = getTenantDb();
  const overrides = await db
    .select({ code: registerActivations.activationCode, isEnabled: registerActivations.isEnabled })
    .from(registerActivations)
    .where(eq(registerActivations.registerId, registerId));

  const overrideMap = new Map(overrides.map((o) => [o.code, o.isEnabled]));

  return catalog.map((a) => {
    const has = overrideMap.has(a.code);
    return {
      code: a.code,
      name: a.name,
      description: a.description,
      module: a.module,
      category: a.category,
      defaultEnabled: a.defaultEnabled,
      isEnabled: has ? overrideMap.get(a.code)! : a.defaultEnabled,
      isOverridden: has,
    };
  });
}

// Enciende/apaga una activación para una caja (upsert por (registerId, code)).
export async function setForRegister(registerId: number, code: string, isEnabled: boolean) {
  const db = getTenantDb();

  const [existing] = await db
    .select({ id: registerActivations.id })
    .from(registerActivations)
    .where(and(
      eq(registerActivations.registerId, registerId),
      eq(registerActivations.activationCode, code),
    ));

  if (existing) {
    const [updated] = await db
      .update(registerActivations)
      .set({ isEnabled, updatedAt: new Date() })
      .where(eq(registerActivations.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(registerActivations)
    .values({ registerId, activationCode: code, isEnabled })
    .returning();
  return created;
}

// Mapa efectivo { code: boolean } para consumo del POS. Ignora códigos que ya no
// existan (o estén inactivos) en el maestro.
export async function resolveForRegister(registerId: number): Promise<Record<string, boolean>> {
  const views = await listForRegister(registerId);
  return Object.fromEntries(views.map((v) => [v.code, v.isEnabled]));
}
