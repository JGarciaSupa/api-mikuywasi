import { eq } from 'drizzle-orm';
import { systemSettings } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { writeAuditLog } from './shared/audit.service';
import type { AuditActor } from './types';

const DEFAULTS: Record<string, { value: string; description: string }> = {
  igv_percentage: { value: '18', description: 'Tasa de IGV (%) en compras gravadas' },
  default_currency: { value: 'PEN', description: 'Moneda base del sistema' },
  costing_method: { value: 'PP', description: 'Método de costeo: PP = Precio Promedio Ponderado' },
  active_period: { value: '', description: 'Período contable activo AAAA-MM' },
  stock_alert_days: { value: '3', description: 'Días de anticipación para alertas de vencimiento' },
};

export async function listSettings() {
  const db = getTenantDb();
  const rows = await db.select().from(systemSettings);
  const map = new Map(rows.map((r) => [r.key, r]));

  return Object.entries(DEFAULTS).map(([key, def]) => {
    const existing = map.get(key);
    return existing ?? { key, value: def.value, description: def.description, updatedAt: null, userId: null };
  });
}

export async function upsertSetting(key: string, value: string, actor?: AuditActor) {
  const db = getTenantDb();
  const [before] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));

  const [row] = await db
    .insert(systemSettings)
    .values({
      key,
      value,
      description: DEFAULTS[key]?.description,
      userId: actor?.userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, userId: actor?.userId, updatedAt: new Date() },
    })
    .returning();

  await writeAuditLog({
    tableName: 'system_settings',
    operation: before ? 'UPDATE' : 'INSERT',
    recordId: null,
    beforeData: before,
    afterData: row,
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'configuracion_sistema',
    description: before
      ? `Cambió ${key}: ${before.value} → ${value}`
      : `Configuró ${key} = ${value}`,
    ipAddress: actor?.ip,
  });

  return row;
}
