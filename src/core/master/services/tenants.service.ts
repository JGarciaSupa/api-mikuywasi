import { masterDb } from '../../../db';
import { tenants, subscriptions, plans, dbServers } from '../../../db/master/schema';
import { and, eq, sql, like } from 'drizzle-orm';
import type { CreateTenantInput, UpdateTenantInput, RenewSubscriptionInput } from '../validations/tenants.validation';

export const getAllTenants = async (
  page = 1,
  limit = 10,
  filters?: { name?: string; status?: string; planId?: number; serverId?: number }
) => {
  const offset = (page - 1) * limit;
  const conditions = [];

  if (filters?.name?.trim()) {
    conditions.push(sql`lower(${tenants.name}) LIKE lower(${'%' + filters.name + '%'})`);
  }
  if (filters?.status) {
    conditions.push(eq(tenants.status, filters.status as any));
  }
  if (filters?.planId) {
    conditions.push(eq(tenants.planId, filters.planId));
  }
  if (filters?.serverId) {
    conditions.push(eq(tenants.serverId, filters.serverId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await masterDb
    .select({ count: sql<number>`count(*)` })
    .from(tenants)
    .where(whereClause);

  const data = await masterDb.query.tenants.findMany({
    where: whereClause,
    with: { plan: true, server: true },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit,
    offset,
  });

  return {
    data,
    meta: { total: Number(count || 0), page, limit, totalPages: Math.ceil(Number(count || 0) / limit) },
  };
};

export const getTenantById = async (id: number) => {
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, id),
    with: { plan: true, server: true, subscriptions: true },
  });
  if (!tenant) throw new Error('Tenant no encontrado');
  return tenant;
};

export const getTenantBySlug = async (slug: string) => {
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    with: { plan: true, server: true },
  });
  if (!tenant) throw new Error('Tenant no encontrado');
  return tenant;
};

export const createTenant = async (data: CreateTenantInput) => {
  // Validaciones previas
  const [existingSlug, existingDbName, plan, server] = await Promise.all([
    masterDb.query.tenants.findFirst({ where: eq(tenants.slug, data.slug) }),
    masterDb.query.tenants.findFirst({ where: eq(tenants.dbName, data.dbName) }),
    masterDb.query.plans.findFirst({ where: eq(plans.id, data.planId) }),
    masterDb.query.dbServers.findFirst({ where: eq(dbServers.id, data.serverId) }),
  ]);

  if (existingSlug) throw new Error('El slug ya está en uso por otro tenant');
  if (existingDbName) throw new Error('El nombre de base de datos ya está en uso');
  if (!plan) throw new Error('El plan seleccionado no existe');
  if (!server) throw new Error('El servidor seleccionado no existe');
  if (!server.isActive) throw new Error('El servidor seleccionado no está activo');
  if (server.currentTenants >= server.maxTenants) {
    throw new Error('El servidor seleccionado ha alcanzado su límite de tenants');
  }

  const startDate = new Date();
  let endDate = new Date();
  let pricePaid = data.billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;

  if (data.planEndsAt) {
    endDate = new Date(data.planEndsAt);
    pricePaid = '0.00';
  } else {
    if (data.billingCycle === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
  }

  return masterDb.transaction(async (tx) => {
    const [newTenant] = await tx.insert(tenants).values({
      ...data,
      planStartsAt: startDate,
      planEndsAt: endDate,
      updatedAt: new Date(),
    }).returning();

    await tx.insert(subscriptions).values({
      tenantId: newTenant.id,
      planId: plan.id,
      billingCycle: data.billingCycle,
      pricePaid: pricePaid.toString(),
      startDate,
      endDate,
      status: 'active',
      paymentStatus: 'paid',
    });

    // Incrementar contador del servidor
    await tx.update(dbServers)
      .set({ currentTenants: server.currentTenants + 1, updatedAt: new Date() })
      .where(eq(dbServers.id, data.serverId));

    return newTenant;
  });
};

export const updateTenant = async (id: number, data: UpdateTenantInput) => {
  const updateData: any = { ...data, updatedAt: new Date() };
  if (data.planEndsAt) updateData.planEndsAt = new Date(data.planEndsAt);

  const [updated] = await masterDb.update(tenants)
    .set(updateData)
    .where(eq(tenants.id, id))
    .returning();

  if (!updated) throw new Error('Tenant no encontrado');
  return updated;
};

export const renewSubscription = async (tenantId: number, data: RenewSubscriptionInput) => {
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw new Error('Tenant no encontrado');

  const planId = data.planId || tenant.planId;
  const billingCycle = data.billingCycle || (tenant.billingCycle as 'monthly' | 'yearly') || 'monthly';

  const plan = await masterDb.query.plans.findFirst({ where: eq(plans.id, planId) });
  if (!plan) throw new Error('Plan no encontrado');

  const startDate = data.startDate ? new Date(data.startDate) : new Date(tenant.planEndsAt || new Date());
  let endDate = data.endDate ? new Date(data.endDate) : new Date(startDate);

  if (!data.endDate) {
    if (billingCycle === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
  }

  const pricePaid = data.pricePaid || (billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice);

  return masterDb.transaction(async (tx) => {
    const [updated] = await tx.update(tenants).set({
      planId,
      billingCycle,
      planStartsAt: startDate,
      planEndsAt: endDate,
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId)).returning();

    await tx.insert(subscriptions).values({
      tenantId,
      planId,
      billingCycle,
      pricePaid: pricePaid.toString(),
      startDate,
      endDate,
      status: 'active',
      paymentStatus: 'paid',
      notes: data.notes ?? null,
      gatewayName: data.gatewayName ?? null,
      gatewayInvoiceId: data.gatewayInvoiceId ?? null,
    });

    return updated;
  });
};

export const deleteTenant = async (id: number) => {
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, id),
  });
  if (!tenant) throw new Error('Tenant no encontrado');

  await masterDb.transaction(async (tx) => {
    await tx.delete(tenants).where(eq(tenants.id, id));

    // Decrementar contador del servidor
    await tx.update(dbServers)
      .set({
        currentTenants: sql`GREATEST(${dbServers.currentTenants} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(dbServers.id, tenant.serverId));
  });

  return { message: 'Tenant eliminado correctamente' };
};
