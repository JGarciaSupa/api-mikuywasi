import { masterDb } from '../../../db';
import { tenants, subscriptions, plans, dbServers } from '../../../db/master/schema';
import { and, eq, sql, like } from 'drizzle-orm';
import type { CreateTenantInput, UpdateTenantInput, RenewSubscriptionInput } from '../validations/tenants.validation';
import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as tenantSchema from '../../../db/tenant/schema';
import * as path from 'path';

// Helper to create tenant database
async function createTenantDatabase(server: any, dbName: string) {
  const dbHost = process.env.DB_HOST_OVERRIDE || server.dbHost;
  const client = new Client({
    host: dbHost,
    port: server.dbPort,
    user: server.dbUser,
    password: server.dbPassword,
    database: 'postgres',
  });

  try {
    await client.connect();
    
    // Check if the database already exists
    const checkRes = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (checkRes.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[Database Creator] Base de datos "${dbName}" creada con éxito en el servidor "${server.name}".`);
    } else {
      console.log(`[Database Creator] La base de datos "${dbName}" ya existe en el servidor "${server.name}".`);
    }
  } catch (error) {
    console.error(`[Database Creator] Error al crear la base de datos "${dbName}":`, error);
    throw new Error(`Error al crear la base de datos: ${(error as any).message}`);
  } finally {
    await client.end();
  }
}

// Helper to run migrations on tenant database
async function runTenantMigrations(server: any, dbName: string) {
  const dbHost = process.env.DB_HOST_OVERRIDE || server.dbHost;
  const connectionString = `postgres://${encodeURIComponent(server.dbUser)}:${encodeURIComponent(server.dbPassword)}@${dbHost}:${server.dbPort}/${dbName}`;
  const tempPool = new Pool({
    connectionString,
    max: 1,
  });

  const tempDb = drizzle(tempPool, { schema: tenantSchema });

  try {
    const migrationsPath = path.resolve(process.cwd(), 'drizzle/tenant');
    await migrate(tempDb, {
      migrationsFolder: migrationsPath,
    });
    console.log(`[Migrations] Migraciones ejecutadas con éxito en la base de datos "${dbName}".`);
  } catch (error) {
    console.error(`[Migrations] Error al ejecutar migraciones en "${dbName}":`, error);
    throw new Error(`Error al ejecutar migraciones en la base de datos: ${(error as any).message}`);
  } finally {
    await tempPool.end();
  }
}

// Helper to drop tenant database during cleanup/rollback
async function dropTenantDatabase(server: any, dbName: string) {
  const dbHost = process.env.DB_HOST_OVERRIDE || server.dbHost;
  const client = new Client({
    host: dbHost,
    port: server.dbPort,
    user: server.dbUser,
    password: server.dbPassword,
    database: 'postgres',
  });

  try {
    await client.connect();
    
    // Terminate any active connections to drop database cleanly
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid();
    `, [dbName]);

    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`[Database Cleanup] Base de datos "${dbName}" eliminada debido a un fallo en el proceso de creación/registro.`);
  } catch (cleanupError) {
    console.error(`[Database Cleanup] Error crítico al intentar eliminar la base de datos "${dbName}" durante rollback:`, cleanupError);
  } finally {
    await client.end();
  }
}

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

  let createdTenantId: number | null = null;
  let dbCreated = false;

  try {
    // 1. Registrar el tenant en la base de datos maestra (dentro de una transacción)
    // Si esto falla, el flujo se detiene aquí mismo y no se altera el servidor.
    const newTenant = await masterDb.transaction(async (tx) => {
      const [insertedTenant] = await tx.insert(tenants).values({
        ...data,
        planStartsAt: startDate,
        planEndsAt: endDate,
        updatedAt: new Date(),
      }).returning();

      await tx.insert(subscriptions).values({
        tenantId: insertedTenant.id,
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

      return insertedTenant;
    });

    createdTenantId = newTenant.id;

    // 2. Crear base de datos física en el servidor shard
    await createTenantDatabase(server, data.dbName);
    dbCreated = true;

    // 3. Ejecutar las migraciones en la nueva base de datos
    await runTenantMigrations(server, data.dbName);

    return newTenant;

  } catch (error) {
    console.error('[Tenant Creation Flow] Falló el proceso. Iniciando rollback de seguridad...', error);

    // Rollback paso a paso en caso de fallos posteriores al registro:
    
    // Si se llegó a crear físicamente la base de datos, la eliminamos del servidor
    if (dbCreated) {
      try {
        await dropTenantDatabase(server, data.dbName);
      } catch (dbDropError) {
        console.error('[Tenant Creation Rollback] Error al eliminar la base de datos física:', dbDropError);
      }
    }

    // Si se llegó a registrar el tenant en la base de datos maestra, revertimos toda la transacción
    if (createdTenantId !== null) {
      try {
        await masterDb.transaction(async (tx) => {
          // Eliminar suscripciones asociadas
          await tx.delete(subscriptions).where(eq(subscriptions.tenantId, createdTenantId!));
          
          // Eliminar el tenant
          await tx.delete(tenants).where(eq(tenants.id, createdTenantId!));

          // Revertir contador del servidor
          await tx.update(dbServers)
            .set({
              currentTenants: sql`GREATEST(${dbServers.currentTenants} - 1, 0)`,
              updatedAt: new Date()
            })
            .where(eq(dbServers.id, data.serverId));
        });
        console.log(`[Tenant Creation Rollback] Registro del tenant ID ${createdTenantId} y sus suscripciones eliminados con éxito de la BD maestra.`);
      } catch (dbMasterError) {
        console.error('[Tenant Creation Rollback] Error crítico al revertir registro de BD maestra:', dbMasterError);
      }
    }

    // Propagamos el error original para que el controlador lo exponga
    throw error;
  }
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
