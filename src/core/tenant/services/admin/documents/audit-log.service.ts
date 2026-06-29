import { eq, and, gte, lte, desc, count, ilike, sql } from 'drizzle-orm';
import { auditLog, users } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  userId?: number;
  module?: string;
  tableName?: string;
  operation?: string;
  search?: string; // busca en description
  from?: string;   // YYYY-MM-DD
  to?: string;     // YYYY-MM-DD
}

export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const db = getTenantDb();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;

  const conds = [];
  if (filters.userId) conds.push(eq(auditLog.userId, filters.userId));
  if (filters.module) conds.push(eq(auditLog.module, filters.module));
  if (filters.tableName) conds.push(eq(auditLog.tableName, filters.tableName));
  if (filters.operation) conds.push(eq(auditLog.operation, filters.operation as any));
  if (filters.search) conds.push(ilike(auditLog.description, `%${filters.search}%`));
  if (filters.from) conds.push(gte(auditLog.createdAt, new Date(filters.from)));
  if (filters.to) conds.push(lte(auditLog.createdAt, new Date(filters.to + 'T23:59:59')));

  const where = conds.length ? and(...conds) : undefined;

  const [totalRow] = await db.select({ total: count() }).from(auditLog).where(where);
  const total = totalRow?.total ?? 0;

  // LEFT JOIN con users para rellenar userName en registros viejos que solo tienen userId
  const rows = await db
    .select({
      id: auditLog.id,
      tableName: auditLog.tableName,
      operation: auditLog.operation,
      recordId: auditLog.recordId,
      beforeData: auditLog.beforeData,
      afterData: auditLog.afterData,
      userId: auditLog.userId,
      userName: sql<string | null>`COALESCE(${auditLog.userName}, ${users.name})`,
      module: auditLog.module,
      description: auditLog.description,
      ipAddress: auditLog.ipAddress,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items: rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

// Lista todos los usuarios activos del sistema para poblar el filtro de auditoría.
// Módulos: solo los que ya tienen entradas en audit_logs.
export async function getAuditFacets() {
  const db = getTenantDb();

  const modules = await db
    .selectDistinct({ module: auditLog.module })
    .from(auditLog)
    .orderBy(auditLog.module);

  const allUsers = await db
    .select({ userId: users.id, userName: users.name })
    .from(users)
    .orderBy(users.name);

  return {
    modules: modules.map((m) => m.module).filter(Boolean) as string[],
    users: allUsers.map((u) => ({ userId: u.userId, userName: u.userName })),
  };
}
