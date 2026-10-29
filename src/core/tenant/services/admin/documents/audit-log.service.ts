import { eq, and, gte, lte, desc, count, ilike, sql, getTableColumns } from 'drizzle-orm';
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

  // Registros antiguos sin user_name: el nombre se completa con el usuario actual
  const items = await db
    .select({
      ...getTableColumns(auditLog),
      userName: sql<string | null>`coalesce(${auditLog.userName}, ${users.name})`,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

// Valores disponibles para poblar los filtros (módulos y usuarios presentes en la auditoría).
export async function getAuditFacets() {
  const db = getTenantDb();

  const modules = await db
    .selectDistinct({ module: auditLog.module })
    .from(auditLog)
    .orderBy(auditLog.module);

  // Un registro por usuario (antes salía repetido si tenía filas con y sin nombre)
  const auditUsers = await db
    .select({
      userId: auditLog.userId,
      userName: sql<string | null>`coalesce(max(${users.name}), max(${auditLog.userName}))`,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(sql`${auditLog.userId} is not null`)
    .groupBy(auditLog.userId);

  return {
    modules: modules.map((m) => m.module).filter(Boolean),
    users: auditUsers
      .filter((u) => u.userId != null)
      .map((u) => ({ userId: u.userId as number, userName: u.userName ?? `Usuario ${u.userId}` })),
  };
}
