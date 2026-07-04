import { masterDb, getTenantDb } from '../../../db';
import { tenants, subscriptions, plans, dbServers, subActions, baseRoles, tenantFeatureGrants, tenantRoleGrants } from '../../../db/master/schema';
import { and, eq, sql, like } from 'drizzle-orm';
import { fullSyncTenant } from './rbac-sync.service';
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

// Helper to seed initial data on a fresh tenant database
async function seedTenantData(server: any, dbName: string, tenantName: string, tenantSlug: string) {
  const dbHost = process.env.DB_HOST_OVERRIDE || server.dbHost;
  const connectionString = `postgres://${encodeURIComponent(server.dbUser)}:${encodeURIComponent(server.dbPassword)}@${dbHost}:${server.dbPort}/${dbName}`;
  const tempPool = new Pool({ connectionString, max: 1 });
  const tempDb = drizzle(tempPool, { schema: tenantSchema });

  try {
    const brandCode = tenantSlug.toUpperCase().replace(/-/g, '-').slice(0, 20);
    const branchCode = (tenantSlug.slice(0, 17).toUpperCase() + '-01').slice(0, 20);
    const warehouseCode = ('ALM-' + tenantSlug.slice(0, 15).toUpperCase()).slice(0, 20);

    // 1. Marca por defecto
    // Las migraciones pueden haber creado un registro placeholder ("MARCA-01").
    // Si existe, lo actualizamos con los datos reales en lugar de insertar uno nuevo.
    const existingBrands = await tempDb.select({ id: tenantSchema.brands.id }).from(tenantSchema.brands).limit(1);
    let brand: { id: number };
    if (existingBrands.length > 0) {
      const [updated] = await tempDb
        .update(tenantSchema.brands)
        .set({ name: tenantName, code: brandCode })
        .where(eq(tenantSchema.brands.id, existingBrands[0].id))
        .returning({ id: tenantSchema.brands.id });
      brand = updated;
    } else {
      const [inserted] = await tempDb
        .insert(tenantSchema.brands)
        .values({ name: tenantName, code: brandCode })
        .returning({ id: tenantSchema.brands.id });
      brand = inserted;
    }
    if (!brand) throw new Error('No se pudo crear la marca por defecto');

    // 2. Sucursal principal
    // La migración 0009 crea "MAIN-01" como placeholder para DBs nuevas. Reutilizamos.
    const existingBranches = await tempDb.select({ id: tenantSchema.branches.id }).from(tenantSchema.branches).limit(1);
    let branch: { id: number };
    if (existingBranches.length > 0) {
      const [updated] = await tempDb
        .update(tenantSchema.branches)
        .set({ brandId: brand.id, name: 'Sede Principal', code: branchCode, isMain: true })
        .where(eq(tenantSchema.branches.id, existingBranches[0].id))
        .returning({ id: tenantSchema.branches.id });
      branch = updated;
    } else {
      const [inserted] = await tempDb
        .insert(tenantSchema.branches)
        .values({ brandId: brand.id, name: 'Sede Principal', code: branchCode, isMain: true })
        .returning({ id: tenantSchema.branches.id });
      branch = inserted;
    }
    if (!branch) throw new Error('No se pudo crear la sucursal por defecto');

    // 3. Almacén principal
    // La migración 0009 crea "ALM-MAIN" como placeholder. Reutilizamos.
    const existingWarehouses = await tempDb.select({ id: tenantSchema.warehouses.id }).from(tenantSchema.warehouses).limit(1);
    let warehouse: { id: number };
    if (existingWarehouses.length > 0) {
      const [updated] = await tempDb
        .update(tenantSchema.warehouses)
        .set({ branchId: branch.id, name: 'Almacén Principal', code: warehouseCode })
        .where(eq(tenantSchema.warehouses.id, existingWarehouses[0].id))
        .returning({ id: tenantSchema.warehouses.id });
      warehouse = updated;
    } else {
      const [inserted] = await tempDb
        .insert(tenantSchema.warehouses)
        .values({ branchId: branch.id, name: 'Almacén Principal', code: warehouseCode, isCentral: false })
        .returning({ id: tenantSchema.warehouses.id });
      warehouse = inserted;
    }
    if (!warehouse) throw new Error('No se pudo crear el almacén por defecto');

    // 4. Área de almacenamiento por defecto
    await tempDb
      .insert(tenantSchema.storageAreas)
      .values({ warehouseId: warehouse.id, name: 'Área General', type: 'ambient' })
      .onConflictDoNothing();

    console.log(`[Seed] Jerarquía inicial creada en "${dbName}": marca → sucursal → almacén.`);

    // 5. Unidades de medida por defecto
    const defaultUnits = [
      { code: 'KG', name: 'Kilogramo', dimension: 'mass', baseFactor: '1.000000' },
      { code: 'LT', name: 'Litro', dimension: 'volume', baseFactor: '1.000000' },
    ];

    for (const unit of defaultUnits) {
      const [existingUnit] = await tempDb
        .select({ id: tenantSchema.measurementUnits.id })
        .from(tenantSchema.measurementUnits)
        .where(eq(tenantSchema.measurementUnits.code, unit.code));

      if (!existingUnit) {
        await tempDb.insert(tenantSchema.measurementUnits).values(unit);
      }
    }
    console.log(`[Seed] Unidades de medida por defecto creadas en "${dbName}".`);

    console.log(`[Seed] Datos iniciales insertados en "${dbName}".`);
  } catch (error) {
    console.error(`[Seed] Error al insertar datos iniciales en "${dbName}":`, error);
    throw new Error(`Error al inicializar datos del tenant: ${(error as any).message}`);
  } finally {
    await tempPool.end();
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

// Otorga todas las sub-acciones y roles base activos a un tenant recién creado.
// Llamar ANTES de fullSyncTenant para que el sync encuentre los grants ya registrados.
async function autoGrantAllToNewTenant(tenantId: number) {
  const [allSubActions, allBaseRoles] = await Promise.all([
    masterDb.select({ id: subActions.id }).from(subActions).where(eq(subActions.isActive, true)),
    masterDb.select({ id: baseRoles.id }).from(baseRoles).where(eq(baseRoles.isActive, true)),
  ]);

  if (allSubActions.length > 0) {
    await masterDb
      .insert(tenantFeatureGrants)
      .values(allSubActions.map((sa) => ({ tenantId, subActionId: sa.id })))
      .onConflictDoNothing();
  }

  if (allBaseRoles.length > 0) {
    await masterDb
      .insert(tenantRoleGrants)
      .values(allBaseRoles.map((br) => ({ tenantId, baseRoleId: br.id })))
      .onConflictDoNothing();
  }

  console.log(`[RBAC Grant] Tenant ${tenantId}: ${allSubActions.length} features y ${allBaseRoles.length} roles concedidos.`);
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

    // 4. Insertar datos iniciales (marca, sucursal, almacén por defecto)
    await seedTenantData(server, data.dbName, data.name, data.slug);

    // 5. Otorgar automáticamente todos los módulos y roles activos al nuevo tenant
    try {
      await autoGrantAllToNewTenant(createdTenantId);
    } catch (grantError) {
      console.warn('[RBAC Grant] Auto-grant inicial falló (no crítico):', grantError);
    }

    // 6. Sincronizar RBAC: propaga los grants al catálogo y roles locales del tenant
    try {
      await fullSyncTenant(createdTenantId);
    } catch (syncError) {
      console.warn('[RBAC Sync] Sync RBAC inicial falló (no crítico):', syncError);
    }

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

// ── GET TENANT DATABASE INSTANCE (HELPER) ────────────────────────────────────
export async function getTenantDatabaseInstance(tenantId: number) {
  const tenantData = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    with: { server: true },
  });
  if (!tenantData) throw new Error('Tenant no encontrado');

  const server = tenantData.server;
  const host = process.env.DB_HOST_OVERRIDE || server.dbHost;
  const dbUrl = `postgres://${encodeURIComponent(server.dbUser)}:${encodeURIComponent(server.dbPassword)}@${host}:${server.dbPort}/${tenantData.dbName}`;

  return await getTenantDb(dbUrl);
}

// ── TENANT USERS CRUD SERVICES ───────────────────────────────────────────────

export const getTenantUsers = async (tenantId: number) => {
  const db = await getTenantDatabaseInstance(tenantId);
  const items = await db
    .select({
      id: tenantSchema.users.id,
      name: tenantSchema.users.name,
      username: tenantSchema.users.username,
      role: tenantSchema.roles.name,
      image: tenantSchema.users.image,
      createdAt: tenantSchema.users.createdAt,
      updatedAt: tenantSchema.users.updatedAt,
      rbacRoleCode: tenantSchema.roles.code,
      rbacRoleName: tenantSchema.roles.name,
    })
    .from(tenantSchema.users)
    .leftJoin(tenantSchema.userRoles, eq(tenantSchema.userRoles.userId, tenantSchema.users.id))
    .leftJoin(tenantSchema.roles, eq(tenantSchema.roles.id, tenantSchema.userRoles.roleId))
    .orderBy(tenantSchema.users.createdAt);
  return items;
};

export const createTenantUser = async (tenantId: number, data: any) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const [existing] = await db
    .select()
    .from(tenantSchema.users)
    .where(eq(tenantSchema.users.username, data.username));
  if (existing) throw new Error('El username ya está en uso');

  const hashedPassword = await Bun.password.hash(data.password, 'bcrypt');

  const [newUser] = await db
    .insert(tenantSchema.users)
    .values({
      username: data.username,
      password: hashedPassword,
      name: data.name,
      image: data.image ?? null,
    })
    .returning();

  const { password: _, ...safeUser } = newUser;

  let rbacRoleCode: string | null = null;
  let rbacRoleName: string | null = null;

  if (data.rbacBaseRoleCode) {
    const [rbacRole] = await db
      .select({ id: tenantSchema.roles.id, code: tenantSchema.roles.code, name: tenantSchema.roles.name })
      .from(tenantSchema.roles)
      .where(and(eq(tenantSchema.roles.code, data.rbacBaseRoleCode), eq(tenantSchema.roles.isActive, true)));

    if (rbacRole) {
      await db
        .insert(tenantSchema.userRoles)
        .values({ userId: newUser.id, roleId: rbacRole.id })
        .onConflictDoUpdate({
          target: tenantSchema.userRoles.userId,
          set: { roleId: rbacRole.id },
        });
      rbacRoleCode = rbacRole.code;
      rbacRoleName = rbacRole.name;
    }
  }

  return { ...safeUser, rbacRoleCode, rbacRoleName };
};

export const updateTenantUser = async (tenantId: number, userId: number, data: any) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const [existingUser] = await db
    .select()
    .from(tenantSchema.users)
    .where(eq(tenantSchema.users.id, userId));
  if (!existingUser) throw new Error('Usuario no encontrado');

  if (data.username && data.username !== existingUser.username) {
    const [taken] = await db
      .select()
      .from(tenantSchema.users)
      .where(eq(tenantSchema.users.username, data.username));
    if (taken) throw new Error('El username ya está en uso');
  }

  const [updatedUser] = await db
    .update(tenantSchema.users)
    .set({
      name: data.name ?? existingUser.name,
      username: data.username ?? existingUser.username,
      image: data.image !== undefined ? data.image : existingUser.image,
      updatedAt: new Date(),
    })
    .where(eq(tenantSchema.users.id, userId))
    .returning();

  const { password: _, ...safeUser } = updatedUser;

  let rbacRoleCode: string | null = null;
  let rbacRoleName: string | null = null;

  if (data.rbacBaseRoleCode) {
    const [rbacRole] = await db
      .select({ id: tenantSchema.roles.id, code: tenantSchema.roles.code, name: tenantSchema.roles.name })
      .from(tenantSchema.roles)
      .where(and(eq(tenantSchema.roles.code, data.rbacBaseRoleCode), eq(tenantSchema.roles.isActive, true)));

    if (rbacRole) {
      await db
        .insert(tenantSchema.userRoles)
        .values({ userId, roleId: rbacRole.id })
        .onConflictDoUpdate({
          target: tenantSchema.userRoles.userId,
          set: { roleId: rbacRole.id },
        });
      rbacRoleCode = rbacRole.code;
      rbacRoleName = rbacRole.name;
    }
  } else {
    const [existing] = await db
      .select({ code: tenantSchema.roles.code, name: tenantSchema.roles.name })
      .from(tenantSchema.userRoles)
      .leftJoin(tenantSchema.roles, eq(tenantSchema.roles.id, tenantSchema.userRoles.roleId))
      .where(eq(tenantSchema.userRoles.userId, userId));
    if (existing) {
      rbacRoleCode = existing.code ?? null;
      rbacRoleName = existing.name ?? null;
    }
  }

  return { ...safeUser, rbacRoleCode, rbacRoleName };
};

export const updateTenantUserPassword = async (tenantId: number, userId: number, data: any) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const [existingUser] = await db
    .select()
    .from(tenantSchema.users)
    .where(eq(tenantSchema.users.id, userId));
  if (!existingUser) throw new Error('Usuario no encontrado');

  const hashedPassword = await Bun.password.hash(data.password, 'bcrypt');

  await db
    .update(tenantSchema.users)
    .set({
      password: hashedPassword,
      updatedAt: new Date(),
    })
    .where(eq(tenantSchema.users.id, userId));

  return { success: true, message: 'Contraseña actualizada con éxito' };
};

export const deleteTenantUser = async (tenantId: number, userId: number) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const [existingUser] = await db
    .select()
    .from(tenantSchema.users)
    .where(eq(tenantSchema.users.id, userId));
  if (!existingUser) throw new Error('Usuario no encontrado');

  await db
    .delete(tenantSchema.users)
    .where(eq(tenantSchema.users.id, userId));

  return { success: true, message: 'Usuario eliminado correctamente' };
};

