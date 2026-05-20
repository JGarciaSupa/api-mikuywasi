import { masterDb } from '../../../db';
import { subscriptions, tenants, plans } from '../../../db/master/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { UpdateSubscriptionInput } from '../validations/subscriptions.validation';

export const getAllSubscriptions = async (
  page = 1,
  limit = 10,
  filters?: { tenantId?: number; status?: string; planId?: number }
) => {
  const offset = (page - 1) * limit;
  const conditions = [];

  if (filters?.tenantId) conditions.push(eq(subscriptions.tenantId, filters.tenantId));
  if (filters?.status) conditions.push(eq(subscriptions.status, filters.status as any));
  if (filters?.planId) conditions.push(eq(subscriptions.planId, filters.planId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await masterDb
    .select({ count: sql<number>`count(*)` })
    .from(subscriptions)
    .where(whereClause);

  const data = await masterDb.query.subscriptions.findMany({
    where: whereClause,
    with: { tenant: true, plan: true },
    orderBy: (s, { desc }) => [desc(s.createdAt)],
    limit,
    offset,
  });

  return {
    data,
    meta: { total: Number(count || 0), page, limit, totalPages: Math.ceil(Number(count || 0) / limit) },
  };
};

export const getSubscriptionById = async (id: number) => {
  const sub = await masterDb.query.subscriptions.findFirst({
    where: eq(subscriptions.id, id),
    with: { tenant: true, plan: true },
  });
  if (!sub) throw new Error('Suscripción no encontrada');
  return sub;
};

export const getSubscriptionsByTenant = async (tenantId: number) => {
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw new Error('Tenant no encontrado');

  return masterDb.query.subscriptions.findMany({
    where: eq(subscriptions.tenantId, tenantId),
    with: { plan: true },
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
};

export const updateSubscription = async (id: number, data: UpdateSubscriptionInput) => {
  const [updated] = await masterDb.update(subscriptions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(subscriptions.id, id))
    .returning();

  if (!updated) throw new Error('Suscripción no encontrada');
  return updated;
};

export const cancelSubscription = async (id: number) => {
  const sub = await masterDb.query.subscriptions.findFirst({
    where: eq(subscriptions.id, id),
  });
  if (!sub) throw new Error('Suscripción no encontrada');
  if (sub.status === 'canceled') throw new Error('La suscripción ya está cancelada');

  const [updated] = await masterDb.update(subscriptions)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(eq(subscriptions.id, id))
    .returning();

  return updated;
};

// Marcar suscripciones vencidas como 'expired' (útil para jobs/cron)
export const markExpiredSubscriptions = async () => {
  const now = new Date();
  const result = await masterDb.update(subscriptions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.status, 'active'),
        sql`${subscriptions.endDate} < ${now}`
      )
    )
    .returning();

  return { updated: result.length };
};
