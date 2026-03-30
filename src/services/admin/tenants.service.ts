import { db } from '../../db';
import { tenants, subscriptions, plans } from '../../db/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { CreateTenantInput, UpdateTenantInput, RenewSubscriptionInput } from '../../validations/admin/tenant.validation';

export const createTenant = async (data: CreateTenantInput) => {
  // Verificar si el slug ya existe
  const existingTenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, data.slug),
  });

  if (existingTenant) {
    throw new Error('El slug ya está en uso por otro negocio');
  }

  // Obtener el plan para calcular fechas y precios
  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, data.planId),
  });

  if (!plan) {
    throw new Error('El plan seleccionado no existe');
  }

  const startDate = new Date();
  let endDate = new Date();
  let pricePaid = data.billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;

  if (data.planEndsAt) {
    endDate = new Date(data.planEndsAt);
    pricePaid = '0.00' as any; // Si se define a mano al crear, lo tratamos como periodo de prueba/gratis
  } else {
    if (data.billingCycle === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
  }

  return await db.transaction(async (tx) => {
    // 1. Crear el tenant
    const [newTenant] = await tx.insert(tenants).values({
      ...data,
      planStartsAt: startDate,
      planEndsAt: endDate,
      updatedAt: new Date(),
    }).returning();

    // 2. Crear el registro de suscripción inicial
    await tx.insert(subscriptions).values({
      tenantId: newTenant.id,
      planId: plan.id,
      billingCycle: data.billingCycle,
      pricePaid: pricePaid.toString(),
      startDate: startDate,
      endDate: endDate,
      status: 'active',
      paymentStatus: 'paid', // Por ahora asumimos pagado al crear por admin
    });

    return newTenant;
  });
};

export const getAllTenants = async (page: number = 1, limit: number = 10, filters?: { name?: string; status?: string; planId?: number }) => {
  const offset = (page - 1) * limit;

  // Construir condiciones dinámicas usando el helper and() de Drizzle
  const conditions = [];
  if (filters?.name?.trim()) {
    conditions.push(sql`lower(${tenants.name}) LIKE lower(${"%" + filters.name + "%"})`);
  }
  if (filters?.status) {
    conditions.push(eq(tenants.status, filters.status as any));
  }
  if (filters?.planId) {
    conditions.push(eq(tenants.planId, filters.planId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Obtener total con filtros
  const [totalResult] = await db.select({ count: sql<number>`count(*)` })
    .from(tenants)
    .where(whereClause);
  
  const total = Number(totalResult?.count || 0);

  const results = await db.query.tenants.findMany({
    where: whereClause,
    orderBy: (tenants, { desc }) => [desc(tenants.createdAt)],
    limit,
    offset,
  });

  return {
    data: results,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  };
};

export const updateTenant = async (id: number, data: UpdateTenantInput) => {
  const updateData: any = { ...data, updatedAt: new Date() };
  if (data.planEndsAt) {
    updateData.planEndsAt = new Date(data.planEndsAt);
  }

  const [updatedTenant] = await db.update(tenants)
    .set(updateData)
    .where(eq(tenants.id, id))
    .returning();
  
  if (!updatedTenant) throw new Error('Tenant no encontrado');
  return updatedTenant;
};

export const renewSubscription = async (tenantId: number, data: RenewSubscriptionInput) => {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  if (!tenant) throw new Error('Tenant no encontrado');

  const planId = data.planId || tenant.planId;
  const billingCycle = data.billingCycle || (tenant.billingCycle as 'monthly' | 'yearly') || 'monthly';

  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
  });

  if (!plan) throw new Error('Plan no encontrado');

  // Lógica de fechas
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

  return await db.transaction(async (tx) => {
    // 1. Actualizar el tenant con el nuevo periodo
    const [updatedTenant] = await tx.update(tenants).set({
      planId,
      billingCycle,
      planStartsAt: startDate,
      planEndsAt: endDate,
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId)).returning();

    // 2. Registrar la nueva suscripción
    await tx.insert(subscriptions).values({
      tenantId,
      planId,
      billingCycle,
      pricePaid: pricePaid.toString(),
      startDate,
      endDate,
      status: 'active',
      paymentStatus: 'paid',
    });

    return updatedTenant;
  });
};
