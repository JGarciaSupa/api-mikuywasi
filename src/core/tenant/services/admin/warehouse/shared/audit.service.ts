import { eq } from 'drizzle-orm';
import { auditLog, users } from '../../../../../../db/tenant/schema';
import { getTenantDb, type TenantDb } from '../../../../../../utils/tenant-context';
import type { GeoAuditFields } from '../../../../../../utils/geo';

type AuditOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'PROCESS' | 'VOID' | 'ADJUST';

export interface AuditParams {
  tableName: string;
  operation: AuditOperation;
  recordId?: number | null;
  beforeData?: unknown;
  afterData?: unknown;
  userId?: number | null;
  userName?: string | null;
  module: string;
  description: string;
  ipAddress?: string | null;
  /** Ubicación del dispositivo (login y apertura/cierre de caja), ver utils/geo */
  geo?: GeoAuditFields;
}

export async function writeAuditLog(params: AuditParams, tx?: TenantDb) {
  const db = tx ?? getTenantDb();

  // El token del tenant solo trae userId: si no llega el nombre, se busca para que
  // Auditoría muestre quién fue (antes salía «Sistema»). Nunca bloquea el registro: la
  // consulta va fuera de `tx` para que un fallo no aborte la transacción del llamador.
  let userName = params.userName ?? null;
  if (!userName && params.userId) {
    try {
      const [u] = await getTenantDb().select({ name: users.name }).from(users).where(eq(users.id, params.userId));
      userName = u?.name ?? null;
    } catch {
      userName = null;
    }
  }

  await db.insert(auditLog).values({
    tableName: params.tableName,
    operation: params.operation,
    recordId: params.recordId ?? null,
    beforeData: params.beforeData ?? null,
    afterData: params.afterData ?? null,
    userId: params.userId ?? null,
    userName,
    module: params.module,
    description: params.description,
    ipAddress: params.ipAddress ?? null,
    ...(params.geo ?? {}),
  });
}
