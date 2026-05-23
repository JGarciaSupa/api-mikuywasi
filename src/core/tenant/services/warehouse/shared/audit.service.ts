import { auditLog } from '../../../../../db/tenant/schema';
import { getTenantDb, type TenantDb } from '../../../../../utils/tenant-context';

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
}

export async function writeAuditLog(params: AuditParams, tx?: TenantDb) {
  const db = tx ?? getTenantDb();
  await db.insert(auditLog).values({
    tableName: params.tableName,
    operation: params.operation,
    recordId: params.recordId ?? null,
    beforeData: params.beforeData ?? null,
    afterData: params.afterData ?? null,
    userId: params.userId ?? null,
    userName: params.userName ?? null,
    module: params.module,
    description: params.description,
    ipAddress: params.ipAddress ?? null,
  });
}
