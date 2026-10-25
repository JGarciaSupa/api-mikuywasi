import { Client } from 'pg';
import { and, eq, ne, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { masterDb } from '../../../db';
import { tenants, subscriptions, plans, dbServers, tenantFeatureGrants, tenantRoleGrants } from '../../../db/master/schema';
import { fullSyncTenant } from './rbac-sync.service';
import { copyLinksFromSourceTenant, provisionFlaggedUsersToTenant } from './platform-tenant-admins.service';
import { createTenantDatabase, runTenantMigrations, dropTenantDatabase } from './tenants.service';
import type { CreateTenantInput } from '../validations/tenants.validation';
import { getS3Client } from '../../../utils/s3';

// ─── Duplicación de tenants ─────────────────────────────────────────────────
// Copia la configuración y el catálogo de un tenant a uno nuevo (BD nueva + registro en master).
// El origen solo se lee. La copia queda sin facturación electrónica y con sus propias imágenes en R2.

// Movimientos, historial y datos de clientes: no se copian (la copia es para configurar o probar).
const TRANSACTIONAL_TABLES = new Set([
  'orders', 'order_items', 'order_item_extras', 'order_payments', 'order_splits',
  'order_station_confirmations', 'orders_items_deleted',
  'billing_documents', 'billing_document_lines',
  'cash_sessions', 'cash_movements', 'cash_session_sequences',
  'sales_discharge', 'sales_discharge_lines', 'area_ledger', 'main_ledger', 'stock_snapshot', 'batches', 'waste_log',
  'purchase_documents', 'purchase_document_lines', 'purchase_price_history',
  'inventory_adjustments', 'adjustment_lines', 'stock_transfers', 'stock_transfer_lines',
  'stock_exits', 'stock_exit_lines', 'requisitions', 'requisition_lines', 'portionings', 'portioning_lines',
  'customers', 'customer_addresses', 'customer_contacts', 'customer_tax_profiles',
  'exchange_rate', 'audit_log', 'refresh_tokens',
]);

// Columnas que pueden guardar claves de R2 (ej: "mi-slug/productos/uuid.webp")
const IMAGE_COLUMN = /(image|logo|url|photo|icon|banner)/;
const BATCH_SIZE = 500;
const IMAGE_CONCURRENCY = 5;

type DbServer = typeof dbServers.$inferSelect;

export interface CloneTenantResult {
  tenant: typeof tenants.$inferSelect;
  stats: { tablesCopied: number; rowsCopied: number; imagesCopied: number; imagesFailed: number };
}

function tenantClient(server: DbServer, dbName: string) {
  return new Client({
    host: process.env.DB_HOST_OVERRIDE || server.dbHost,
    port: server.dbPort,
    user: server.dbUser,
    password: server.dbPassword,
    database: dbName,
  });
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Fecha (ms) de la última migración de tenant del repo, para exigir que el origen esté al día. */
function latestTenantMigrationWhen(): number {
  const journalPath = path.resolve(process.cwd(), 'drizzle/tenant/meta/_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as { entries: { when: number }[] };
  return Math.max(...journal.entries.map((e) => e.when));
}

/** Copia todas las tablas (salvo las transaccionales) del origen al destino y aplica los ajustes de la copia. */
async function copyTenantData(source: Client, target: Client, newName: string) {
  const tablesRes = await source.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  const targetTablesRes = await target.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const targetTables = new Set(targetTablesRes.rows.map((r) => r.table_name));
  const tables = tablesRes.rows.map((r) => r.table_name).filter((t) => targetTables.has(t) && !TRANSACTIONAL_TABLES.has(t));

  // Las migraciones del destino siembran filas de ejemplo: se vacía todo antes de copiar
  await target.query(`TRUNCATE ${[...targetTables].map(q).join(', ')} RESTART IDENTITY CASCADE`);

  // Columnas por tabla en una sola consulta por lado (solo las que existen en origen y destino)
  const columnsByTable = async (client: Client, onlyInsertable: boolean) => {
    const res = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' ${onlyInsertable ? "AND is_generated = 'NEVER'" : ''}
       ORDER BY table_name, ordinal_position`,
    );
    const map = new Map<string, string[]>();
    for (const r of res.rows) map.set(r.table_name, [...(map.get(r.table_name) ?? []), r.column_name]);
    return map;
  };
  const [targetCols, sourceCols] = await Promise.all([columnsByTable(target, true), columnsByTable(source, false)]);

  let rowsCopied = 0;
  for (const table of tables) {
    const inSource = new Set(sourceCols.get(table) ?? []);
    const cols = (targetCols.get(table) ?? []).filter((c) => inSource.has(c));
    if (cols.length === 0) continue;
    const colList = cols.map(q).join(', ');

    for (let offset = 0; ; offset += BATCH_SIZE) {
      const batch = await source.query<{ data: string | null; n: number }>(
        `SELECT json_agg(x)::text AS data, count(*)::int AS n
         FROM (SELECT ${colList} FROM ${q(table)} ORDER BY ctid LIMIT ${BATCH_SIZE} OFFSET ${offset}) x`,
      );
      const { data, n } = batch.rows[0];
      if (!data || n === 0) break;
      await target.query(
        `INSERT INTO ${q(table)} (${colList}) SELECT ${colList} FROM json_populate_recordset(NULL::${q(table)}, $1::json)`,
        [data],
      );
      rowsCopied += n;
      if (n < BATCH_SIZE) break;
    }
  }

  // Secuencias al máximo id copiado (un solo viaje a la BD)
  await target.query(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT table_name, column_name, pg_get_serial_sequence(format('public.%I', table_name), column_name) AS seq
        FROM information_schema.columns
        WHERE table_schema = 'public' AND (column_default LIKE 'nextval(%' OR is_identity = 'YES')
      LOOP
        IF r.seq IS NOT NULL THEN
          EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM public.%I), 0) + 1, false)', r.seq, r.column_name, r.table_name);
        END IF;
      END LOOP;
    END $$;
  `);

  // Ajustes de la copia: sin facturación electrónica, mesas libres y la marca con el nombre nuevo
  await target.query(`UPDATE tenant_configs SET facturador_empresa_id = NULL, facturador_ruc = NULL`);
  await target.query(`UPDATE branches SET fiscal_id = NULL, fiscal_name = NULL, facturador_empresa_id = NULL`);
  await target.query(`UPDATE cash_register_document_series SET is_active_facturacion = false`);
  await target.query(`UPDATE restaurant_tables SET status_code = 'available', status_updated_at = now()`);
  await target.query(`UPDATE brands SET name = $1 WHERE (SELECT count(*) FROM brands) = 1`, [newName.slice(0, 100)]);

  return { tablesCopied: tables.length, rowsCopied };
}

/**
 * Copia en R2 las imágenes que cuelgan del slug origen a la carpeta del slug nuevo y actualiza las claves.
 * Si una imagen no se puede copiar, la copia queda sin esa imagen (nunca apunta al archivo del original).
 */
async function copyTenantImages(target: Client, sourceSlug: string, newSlug: string) {
  const s3 = getS3Client();
  const publicUrl = process.env.R2_PUBLIC_URL ?? '';
  const prefixes = [`${sourceSlug}/`, ...(publicUrl ? [`${publicUrl}/${sourceSlug}/`] : [])];

  const colsRes = await target.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type IN ('text', 'character varying')`,
  );
  const imageCols = colsRes.rows.filter((c) => IMAGE_COLUMN.test(c.column_name));

  const refs: { table: string; column: string; value: string }[] = [];
  for (const { table_name, column_name } of imageCols) {
    const res = await target.query<{ v: string }>(
      `SELECT DISTINCT ${q(column_name)} AS v FROM ${q(table_name)} WHERE ${prefixes.map((_, i) => `${q(column_name)} LIKE $${i + 1}`).join(' OR ')}`,
      prefixes.map((p) => `${p.replace(/[%_\\]/g, '\\$&')}%`),
    );
    for (const { v } of res.rows) refs.push({ table: table_name, column: column_name, value: v });
  }

  const toKey = (value: string) => (publicUrl && value.startsWith(`${publicUrl}/`) ? value.slice(publicUrl.length + 1) : value);
  const keys = [...new Set(refs.map((r) => toKey(r.value)))];
  const newKeyOf = (key: string) => `${newSlug}/${key.slice(sourceSlug.length + 1)}`;

  const copied = new Set<string>();
  for (let i = 0; i < keys.length; i += IMAGE_CONCURRENCY) {
    await Promise.all(keys.slice(i, i + IMAGE_CONCURRENCY).map(async (key) => {
      try {
        await s3.write(newKeyOf(key), s3.file(key));
        copied.add(key);
      } catch (error) {
        console.error(`[Tenant Clone] No se pudo copiar la imagen "${key}":`, error);
      }
    }));
  }

  for (const ref of refs) {
    const key = toKey(ref.value);
    await target.query(
      `UPDATE ${q(ref.table)} SET ${q(ref.column)} = $1 WHERE ${q(ref.column)} = $2`,
      [copied.has(key) ? newKeyOf(key) : null, ref.value],
    );
  }

  return { imagesCopied: copied.size, imagesFailed: keys.length - copied.size, copiedKeys: [...copied].map(newKeyOf) };
}

/** Duplica el tenant `sourceId` en un tenant nuevo con los datos de `data` (mismos campos que el alta). */
export async function cloneTenant(sourceId: number, data: CreateTenantInput): Promise<CloneTenantResult> {
  const source = await masterDb.query.tenants.findFirst({ where: eq(tenants.id, sourceId), with: { server: true } });
  if (!source) throw new Error('Tenant origen no encontrado');

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

  // Nunca reutilizar una BD física existente (podría ser de otro tenant o huérfana): la copia la vaciaría
  const adminDb = tenantClient(server, 'postgres');
  await adminDb.connect();
  try {
    const exists = await adminDb.query('SELECT 1 FROM pg_database WHERE datname = $1', [data.dbName]);
    if (exists.rowCount) throw new Error(`Ya existe una base de datos "${data.dbName}" en el servidor. Elige otro nombre`);
  } finally {
    await adminDb.end();
  }

  // El origen debe tener todas las migraciones: si no, la copia tendría columnas sin datos
  const sourceDb = tenantClient(source.server, source.dbName);
  await sourceDb.connect();
  try {
    const migRes = await sourceDb.query<{ last: string | null }>(`SELECT max(created_at)::text AS last FROM drizzle.__drizzle_migrations`);
    if (Number(migRes.rows[0]?.last ?? 0) < latestTenantMigrationWhen()) {
      throw new Error(`El tenant origen "${source.slug}" tiene migraciones pendientes. Ejecuta las migraciones de tenants antes de duplicarlo`);
    }
  } catch (error) {
    await sourceDb.end();
    throw error;
  }

  const startDate = new Date();
  let endDate = new Date();
  let pricePaid = data.billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
  if (data.planEndsAt) {
    endDate = new Date(data.planEndsAt);
    pricePaid = '0.00';
  } else if (data.billingCycle === 'monthly') {
    endDate.setMonth(endDate.getMonth() + 1);
  } else {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }

  let createdTenantId: number | null = null;
  let dbCreated = false;
  let copiedImageKeys: string[] = [];

  try {
    // 1. Registro en master (tenant + suscripción + contador del servidor)
    const newTenant = await masterDb.transaction(async (tx) => {
      const [inserted] = await tx.insert(tenants).values({
        ...data,
        planStartsAt: startDate,
        planEndsAt: endDate,
        updatedAt: new Date(),
      }).returning();

      await tx.insert(subscriptions).values({
        tenantId: inserted.id,
        planId: plan.id,
        billingCycle: data.billingCycle,
        pricePaid: pricePaid.toString(),
        startDate,
        endDate,
        status: 'active',
        paymentStatus: 'paid',
      });

      await tx.update(dbServers)
        .set({ currentTenants: sql`${dbServers.currentTenants} + 1`, updatedAt: new Date() })
        .where(eq(dbServers.id, data.serverId));

      return inserted;
    });
    createdTenantId = newTenant.id;

    // 2. BD física con el esquema al día
    await createTenantDatabase(server, data.dbName);
    dbCreated = true;
    await runTenantMigrations(server, data.dbName);

    // 3. Copia de datos: lectura consistente del origen, escritura sin disparar FKs ni triggers
    const targetDb = tenantClient(server, data.dbName);
    await targetDb.connect();
    let copyStats: { tablesCopied: number; rowsCopied: number };
    try {
      await sourceDb.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await targetDb.query('BEGIN');
      await targetDb.query(`SET LOCAL session_replication_role = replica`);
      copyStats = await copyTenantData(sourceDb, targetDb, data.name);
      await targetDb.query('COMMIT');
      await sourceDb.query('COMMIT');

      // 4. Imágenes propias en R2
      const images = await copyTenantImages(targetDb, source.slug, data.slug);
      copiedImageKeys = images.copiedKeys;

      // 5. Permisos: los mismos grants que el origen, luego sync al catálogo local
      const [featureGrants, roleGrants] = await Promise.all([
        masterDb.select({ subActionId: tenantFeatureGrants.subActionId }).from(tenantFeatureGrants).where(eq(tenantFeatureGrants.tenantId, sourceId)),
        masterDb.select({ baseRoleId: tenantRoleGrants.baseRoleId }).from(tenantRoleGrants).where(eq(tenantRoleGrants.tenantId, sourceId)),
      ]);
      if (featureGrants.length > 0) {
        await masterDb.insert(tenantFeatureGrants)
          .values(featureGrants.map((g) => ({ tenantId: newTenant.id, subActionId: g.subActionId })))
          .onConflictDoNothing();
      }
      if (roleGrants.length > 0) {
        await masterDb.insert(tenantRoleGrants)
          .values(roleGrants.map((g) => ({ tenantId: newTenant.id, baseRoleId: g.baseRoleId })))
          .onConflictDoNothing();
      }

      try {
        await fullSyncTenant(newTenant.id);
      } catch (syncError) {
        console.warn('[Tenant Clone] Sync RBAC falló (no crítico):', syncError);
      }

      // Cuentas Admin de plataforma: vínculos copiados del origen y alta de las que falten
      try {
        await copyLinksFromSourceTenant(sourceId, newTenant.id);
        const provisioned = await provisionFlaggedUsersToTenant(newTenant.id);
        const notReady = provisioned.filter((r) => r.status !== 'created' && r.status !== 'existing');
        if (notReady.length > 0) {
          console.warn('[Tenant Clone] Cuentas Admin no creadas (no crítico):', notReady);
        }
      } catch (provisionError) {
        console.warn('[Tenant Clone] Provisión de cuentas Admin falló (no crítico):', provisionError);
      }

      console.log(`[Tenant Clone] "${source.slug}" → "${data.slug}": ${copyStats.tablesCopied} tablas, ${copyStats.rowsCopied} filas, ${images.imagesCopied} imágenes (${images.imagesFailed} fallidas).`);

      return {
        tenant: newTenant,
        stats: { ...copyStats, imagesCopied: images.imagesCopied, imagesFailed: images.imagesFailed },
      };
    } catch (error) {
      await targetDb.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      await targetDb.end();
    }
  } catch (error) {
    console.error('[Tenant Clone] Falló la duplicación. Iniciando rollback...', error);
    await sourceDb.query('ROLLBACK').catch(() => {});

    if (copiedImageKeys.length > 0) {
      const s3 = getS3Client();
      await Promise.all(copiedImageKeys.map((key) => s3.delete(key).catch(() => {})));
    }
    if (dbCreated) {
      await dropTenantDatabase(server, data.dbName);
    }
    if (createdTenantId !== null) {
      try {
        await masterDb.transaction(async (tx) => {
          await tx.delete(tenantFeatureGrants).where(eq(tenantFeatureGrants.tenantId, createdTenantId!));
          await tx.delete(tenantRoleGrants).where(eq(tenantRoleGrants.tenantId, createdTenantId!));
          await tx.delete(subscriptions).where(eq(subscriptions.tenantId, createdTenantId!));
          await tx.delete(tenants).where(eq(tenants.id, createdTenantId!));
          await tx.update(dbServers)
            .set({ currentTenants: sql`GREATEST(${dbServers.currentTenants} - 1, 0)`, updatedAt: new Date() })
            .where(eq(dbServers.id, data.serverId));
        });
      } catch (masterError) {
        console.error('[Tenant Clone Rollback] Error al revertir el registro en master:', masterError);
      }
    }
    throw error;
  } finally {
    await sourceDb.end().catch(() => {});
  }
}

/** Marca (o desmarca) un tenant como plantilla por defecto. Solo puede haber una. */
export async function setDefaultTemplate(id: number, isDefault: boolean) {
  const tenant = await masterDb.query.tenants.findFirst({ where: eq(tenants.id, id) });
  if (!tenant) throw new Error('Tenant no encontrado');

  return masterDb.transaction(async (tx) => {
    if (isDefault) {
      await tx.update(tenants)
        .set({ isDefaultTemplate: false })
        .where(and(eq(tenants.isDefaultTemplate, true), ne(tenants.id, id)));
    }
    const [updated] = await tx.update(tenants)
      .set({ isDefaultTemplate: isDefault, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return updated;
  });
}
