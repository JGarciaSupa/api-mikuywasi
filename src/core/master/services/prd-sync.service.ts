import { Client } from 'pg';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { masterDb } from '../../../db';
import { tenants, subscriptions, plans, dbServers, subActions, baseRoles, tenantFeatureGrants, tenantRoleGrants, auditLogs } from '../../../db/master/schema';
import { syncPermissionsCatalog } from './rbac-sync.service';
import { createTenantDatabase, runTenantMigrations, dropTenantDatabase } from './tenants.service';
import type { RefreshFromPrdInput, CloneFromPrdInput } from '../validations/prd-sync.validation';
import { getS3Client } from '../../../utils/s3';
import { safeMessage } from '../../../utils/errors';
import { invalidateUserPermissions } from '../../../utils/permissions';

// ─── Sincronización PRD → QAS ───────────────────────────────────────────────
// Solo para QAS (PRD_SYNC_ENABLED=true). Copia TODOS los datos de un tenant de PRD:
//   - "Actualizar": reemplaza los datos del tenant QAS con el mismo slug.
//   - "Clonar": crea el tenant en esta plataforma (master + BD) y copia los datos.
// PRD solo se lee, con un usuario de solo lectura y sesiones read-only.
// La copia va en una única transacción en QAS: si falla, QAS queda como estaba.
// Se conserva la empresa del facturador configurada en QAS (los ids de PRD son de otro facturador),
// las imágenes se copian a la carpeta "<slug>-qas/" de R2 y los ids de RBAC se traducen por código.

// Sesiones de PRD: no deben servir en QAS
const EXCLUDED_TABLES = new Set(['refresh_tokens']);
// Columnas que pueden guardar claves de R2 (ej: "mi-slug/productos/uuid.webp")
const IMAGE_COLUMN = /(image|logo|url|photo|icon|banner)/;
const BATCH_SIZE = 500;
const IMAGE_CONCURRENCY = 5;
const MAX_JOBS = 20;

type DbServer = typeof dbServers.$inferSelect;

interface PrdConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  masterDb: string;
}

export interface PrdTenant {
  id: number;
  slug: string;
  name: string;
  dbName: string;
  status: string;
  dbHost: string;
  dbPort: number;
}

interface PrdRbac {
  subActionMap: { prd: number; qas: number }[];
  baseRoleMap: { prd: number; qas: number }[];
  featureGrants: number[]; // ids QAS
  roleGrants: number[];    // ids QAS
  warnings: string[];
}

export interface PrdSyncStats {
  tablesCopied: number;
  rowsCopied: number;
  imagesCopied: number;
  imagesFailed: number;
}

export interface PrdSyncJob {
  id: string;
  mode: 'refresh' | 'clone';
  prdSlug: string;
  qasSlug: string;
  qasTenantId: number | null;
  status: 'running' | 'done' | 'failed';
  step: string;
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  stats: PrdSyncStats | null;
  warnings: string[];
}

export interface PrdSyncContext {
  userId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
}

// ─── Configuración y conexiones ─────────────────────────────────────────────

function readPrdConfig(): { config: PrdConfig | null; reason: string | null } {
  if (process.env.PRD_SYNC_ENABLED !== 'true') {
    return { config: null, reason: 'La sincronización desde PRD no está activada en este entorno' };
  }
  const host = process.env.PRD_SYNC_DB_HOST;
  const user = process.env.PRD_SYNC_DB_USER;
  const password = process.env.PRD_SYNC_DB_PASSWORD;
  if (!host || !user || !password) {
    return { config: null, reason: 'Faltan las credenciales de lectura de PRD (PRD_SYNC_DB_HOST, PRD_SYNC_DB_USER, PRD_SYNC_DB_PASSWORD)' };
  }
  const port = Number(process.env.PRD_SYNC_DB_PORT || 5432);

  // Protección: si la master de esta API está en el mismo servidor que PRD, esto no es QAS
  try {
    const own = new URL(process.env.DATABASE_URL ?? '');
    if (own.hostname === host && Number(own.port || 5432) === port) {
      return { config: null, reason: 'Esta API usa el mismo servidor de BD que PRD: la sincronización solo se permite en QAS' };
    }
  } catch {
    return { config: null, reason: 'No se pudo comprobar el servidor de BD de esta API' };
  }

  return { config: { host, port, user, password, masterDb: process.env.PRD_SYNC_MASTER_DB || 'db_master' }, reason: null };
}

function requirePrdConfig(): PrdConfig {
  const { config, reason } = readPrdConfig();
  if (!config) throw new Error(reason ?? 'La sincronización desde PRD no está disponible');
  return config;
}

function prdClient(cfg: PrdConfig, host: string, port: number, database: string) {
  return new Client({
    host,
    port,
    user: cfg.user,
    password: cfg.password,
    database,
    options: '-c default_transaction_read_only=on',
    connectionTimeoutMillis: 15_000,
  });
}

function qasClient(server: DbServer, dbName: string) {
  return new Client({
    host: process.env.DB_HOST_OVERRIDE || server.dbHost,
    port: server.dbPort,
    user: server.dbUser,
    password: server.dbPassword,
    database: dbName,
  });
}

async function withPrdMaster<T>(cfg: PrdConfig, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = prdClient(cfg, cfg.host, cfg.port, cfg.masterDb);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function fetchPrdTenants(client: Client, slug?: string): Promise<PrdTenant[]> {
  const res = await client.query<PrdTenant>(
    `SELECT t.id, t.slug, t.name, t.db_name AS "dbName", t.status, s.db_host AS "dbHost", s.db_port AS "dbPort"
     FROM tenants t JOIN db_servers s ON s.id = t.server_id
     ${slug ? 'WHERE t.slug = $1' : ''}
     ORDER BY t.name`,
    slug ? [slug] : [],
  );
  return res.rows;
}

/** Nunca escribir en un servidor de PRD. */
function assertTargetIsNotPrd(server: DbServer, prd: PrdTenant, cfg: PrdConfig) {
  const host = process.env.DB_HOST_OVERRIDE || server.dbHost;
  const samePrdTenantServer = host === prd.dbHost && server.dbPort === prd.dbPort;
  const samePrdMasterServer = host === cfg.host && server.dbPort === cfg.port;
  if (samePrdTenantServer || samePrdMasterServer) {
    throw new Error(`El servidor "${server.name}" es el mismo de PRD: no se puede escribir en él`);
  }
}

/** Traduce los ids de RBAC de PRD a los de esta master (por código) y lee los grants del tenant en PRD. */
async function loadPrdRbac(cfg: PrdConfig, prdTenantId: number): Promise<PrdRbac> {
  const [prd, qasSubs, qasRoles] = await Promise.all([
    withPrdMaster(cfg, async (client) => {
      // Un Client de pg no admite consultas en paralelo
      const subs = await client.query<{ id: number; code: string }>('SELECT id, code FROM sub_actions');
      const roles = await client.query<{ id: number; code: string }>('SELECT id, code FROM base_roles');
      const featureGrants = await client.query<{ id: number }>('SELECT sub_action_id AS id FROM tenant_feature_grants WHERE tenant_id = $1', [prdTenantId]);
      const roleGrants = await client.query<{ id: number }>('SELECT base_role_id AS id FROM tenant_role_grants WHERE tenant_id = $1', [prdTenantId]);
      return { subs: subs.rows, roles: roles.rows, featureGrants: featureGrants.rows, roleGrants: roleGrants.rows };
    }),
    masterDb.select({ id: subActions.id, code: subActions.code }).from(subActions),
    masterDb.select({ id: baseRoles.id, code: baseRoles.code }).from(baseRoles),
  ]);

  const qasSubByCode = new Map(qasSubs.map((s) => [s.code, s.id]));
  const qasRoleByCode = new Map(qasRoles.map((r) => [r.code, r.id]));
  const subActionMap = prd.subs.filter((s) => qasSubByCode.has(s.code)).map((s) => ({ prd: s.id, qas: qasSubByCode.get(s.code)! }));
  const baseRoleMap = prd.roles.filter((r) => qasRoleByCode.has(r.code)).map((r) => ({ prd: r.id, qas: qasRoleByCode.get(r.code)! }));

  const missingSubs = prd.subs.filter((s) => !qasSubByCode.has(s.code)).map((s) => s.code);
  const missingRoles = prd.roles.filter((r) => !qasRoleByCode.has(r.code)).map((r) => r.code);
  const warnings: string[] = [];
  if (missingSubs.length) warnings.push(`Permisos de PRD que no existen en QAS (no se copian): ${missingSubs.join(', ')}`);
  if (missingRoles.length) warnings.push(`Roles base de PRD que no existen en QAS: ${missingRoles.join(', ')}`);

  const subPrdToQas = new Map(subActionMap.map((m) => [m.prd, m.qas]));
  const rolePrdToQas = new Map(baseRoleMap.map((m) => [m.prd, m.qas]));
  return {
    subActionMap,
    baseRoleMap,
    featureGrants: prd.featureGrants.map((g) => subPrdToQas.get(g.id)).filter((id): id is number => id !== undefined),
    roleGrants: prd.roleGrants.map((g) => rolePrdToQas.get(g.id)).filter((id): id is number => id !== undefined),
    warnings,
  };
}

// ─── Copia de datos (dentro de la transacción del destino) ──────────────────

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function copyAllData(source: Client, target: Client, warnings: string[]) {
  const listTables = async (client: Client) => {
    const res = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    );
    return res.rows.map((r) => r.table_name);
  };
  const [sourceTables, targetTableList] = await Promise.all([listTables(source), listTables(target)]);
  const targetTables = new Set(targetTableList);

  const missingTables = sourceTables.filter((t) => !targetTables.has(t));
  if (missingTables.length) warnings.push(`Tablas de PRD que no existen en QAS (no se copian): ${missingTables.join(', ')}`);

  const tables = sourceTables.filter((t) => targetTables.has(t) && !EXCLUDED_TABLES.has(t));

  // Se vacían las tablas que se reemplazan (y las sesiones). Las tablas que solo existen en QAS
  // conservan sus datos salvo que dependan por FK de las vaciadas.
  const toTruncate = [...tables, ...[...EXCLUDED_TABLES].filter((t) => targetTables.has(t))];
  await target.query(`TRUNCATE ${toTruncate.map(q).join(', ')} RESTART IDENTITY CASCADE`);

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

  const missingColumns: string[] = [];
  let rowsCopied = 0;
  for (const table of tables) {
    const inTarget = new Set(targetCols.get(table) ?? []);
    const inSource = new Set(sourceCols.get(table) ?? []);
    for (const c of inSource) if (!inTarget.has(c)) missingColumns.push(`${table}.${c}`);
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
  if (missingColumns.length) warnings.push(`Columnas de PRD que no existen en QAS (no se copian): ${missingColumns.join(', ')}`);

  // Secuencias al máximo id copiado
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

  return { tablesCopied: tables.length, rowsCopied };
}

/** Empresa del facturador configurada en QAS (se lee antes de copiar y se repone después). */
async function readFacturadorOverrides(target: Client) {
  const branchesRes = await target.query(`SELECT id, facturador_empresa_id, fiscal_id, fiscal_name FROM branches WHERE facturador_empresa_id IS NOT NULL`);
  const configsRes = await target.query(`SELECT id, facturador_empresa_id, facturador_ruc FROM tenant_configs WHERE facturador_empresa_id IS NOT NULL`);
  return { branches: branchesRes.rows, configs: configsRes.rows };
}

async function applyFacturadorOverrides(target: Client, overrides: Awaited<ReturnType<typeof readFacturadorOverrides>>) {
  // Los ids de empresa de PRD son de otro facturador: nunca deben quedar en QAS
  await target.query(`UPDATE branches SET facturador_empresa_id = NULL`);
  await target.query(`UPDATE tenant_configs SET facturador_empresa_id = NULL`);
  await target.query(
    `UPDATE branches b SET facturador_empresa_id = o.facturador_empresa_id, fiscal_id = o.fiscal_id, fiscal_name = o.fiscal_name
     FROM json_to_recordset($1::json) AS o(id int, facturador_empresa_id int, fiscal_id text, fiscal_name text)
     WHERE b.id = o.id`,
    [JSON.stringify(overrides.branches)],
  );
  await target.query(
    `UPDATE tenant_configs t SET facturador_empresa_id = o.facturador_empresa_id, facturador_ruc = o.facturador_ruc
     FROM json_to_recordset($1::json) AS o(id int, facturador_empresa_id int, facturador_ruc text)
     WHERE t.id = o.id`,
    [JSON.stringify(overrides.configs)],
  );
}

/** Los ids de master guardados en el tenant (permisos y roles base) pasan a ser los de esta master. */
async function remapRbacIds(target: Client, rbac: PrdRbac) {
  // permissions_catalog.master_sub_action_id es único: primero ids provisionales negativos
  await target.query(
    `CREATE TEMP TABLE _prd_sync_pc ON COMMIT DROP AS
     SELECT pc.id, m.qas FROM permissions_catalog pc
     LEFT JOIN json_to_recordset($1::json) AS m(prd int, qas int) ON m.prd = pc.master_sub_action_id`,
    [JSON.stringify(rbac.subActionMap)],
  );
  await target.query(`UPDATE permissions_catalog SET master_sub_action_id = -id`);
  await target.query(
    `UPDATE permissions_catalog pc SET master_sub_action_id = t.qas FROM _prd_sync_pc t WHERE t.id = pc.id AND t.qas IS NOT NULL`,
  );

  // Roles clonados de un rol base que no existe en QAS quedan sin vínculo (masterRoleId NULL)
  await target.query(
    `UPDATE roles r SET master_role_id = m.qas
     FROM (SELECT r2.id, mm.qas FROM roles r2
           LEFT JOIN json_to_recordset($1::json) AS mm(prd int, qas int) ON mm.prd = r2.master_role_id
           WHERE r2.master_role_id IS NOT NULL) m
     WHERE m.id = r.id`,
    [JSON.stringify(rbac.baseRoleMap)],
  );
}

/**
 * Copia en R2 las imágenes del slug de PRD a "<destPrefix>/" y actualiza las claves.
 * Si una imagen ya fue copiada antes, se reutiliza. Si no se puede copiar, queda sin imagen
 * (nunca apunta al archivo de PRD: borrarla desde QAS la borraría en PRD).
 */
async function copyImagesToQas(target: Client, prdSlug: string, destPrefix: string) {
  const s3 = getS3Client();
  const publicUrl = process.env.R2_PUBLIC_URL ?? '';
  const prefixes = [`${prdSlug}/`, ...(publicUrl ? [`${publicUrl}/${prdSlug}/`] : [])];

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
  const newKeyOf = (key: string) => `${destPrefix}/${key.slice(prdSlug.length + 1)}`;

  const copied = new Set<string>();
  const written: string[] = [];
  for (let i = 0; i < keys.length; i += IMAGE_CONCURRENCY) {
    await Promise.all(keys.slice(i, i + IMAGE_CONCURRENCY).map(async (key) => {
      try {
        const newKey = newKeyOf(key);
        if (!(await s3.file(newKey).exists())) {
          await s3.write(newKey, s3.file(key));
          written.push(newKey);
        }
        copied.add(key);
      } catch (error) {
        console.error(`[PRD Sync] No se pudo copiar la imagen "${key}":`, error);
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

  return { imagesCopied: copied.size, imagesFailed: keys.length - copied.size, writtenKeys: written };
}

/**
 * Copia el tenant de PRD a la BD de QAS en una sola transacción.
 * `onImagesWritten` recibe las claves nuevas de R2 (para limpiarlas si la clonación se revierte).
 */
async function copyPrdIntoQas(
  cfg: PrdConfig,
  prd: PrdTenant,
  server: DbServer,
  dbName: string,
  qasSlug: string,
  rbac: PrdRbac,
  job: PrdSyncJob,
  onImagesWritten: (keys: string[]) => void = () => {},
) {
  const source = prdClient(cfg, prd.dbHost, prd.dbPort, prd.dbName);
  const target = qasClient(server, dbName);
  await source.connect();
  try {
    await target.connect();
    try {
      // Lectura consistente de PRD; escritura sin disparar FKs ni triggers
      await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await target.query('BEGIN');
      await target.query('SET LOCAL session_replication_role = replica');

      const overrides = await readFacturadorOverrides(target);

      job.step = 'Copiando datos de PRD';
      const copy = await copyAllData(source, target, job.warnings);

      await applyFacturadorOverrides(target, overrides);
      await remapRbacIds(target, rbac);

      job.step = 'Copiando imágenes';
      const images = await copyImagesToQas(target, prd.slug, `${qasSlug}-qas`);
      onImagesWritten(images.writtenKeys);

      const usersRes = await target.query<{ id: number }>('SELECT id FROM users');

      job.step = 'Guardando cambios';
      await target.query('COMMIT');
      await source.query('COMMIT');

      return {
        stats: { ...copy, imagesCopied: images.imagesCopied, imagesFailed: images.imagesFailed },
        userIds: usersRes.rows.map((r) => r.id),
      };
    } catch (error) {
      await target.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      await target.end().catch(() => {});
    }
  } finally {
    await source.query('ROLLBACK').catch(() => {});
    await source.end().catch(() => {});
  }
}

/** Grants de PRD (solo se añaden, no se revoca nada de QAS) y catálogo de permisos del tenant. */
async function mirrorGrantsAndSync(rbac: PrdRbac, qasTenantId: number, job: PrdSyncJob) {
  if (rbac.featureGrants.length > 0) {
    await masterDb.insert(tenantFeatureGrants)
      .values(rbac.featureGrants.map((subActionId) => ({ tenantId: qasTenantId, subActionId })))
      .onConflictDoNothing();
  }
  if (rbac.roleGrants.length > 0) {
    await masterDb.insert(tenantRoleGrants)
      .values(rbac.roleGrants.map((baseRoleId) => ({ tenantId: qasTenantId, baseRoleId })))
      .onConflictDoNothing();
  }
  try {
    await syncPermissionsCatalog(qasTenantId);
  } catch (error) {
    console.warn('[PRD Sync] Sync del catálogo de permisos falló (no crítico):', error);
    job.warnings.push('No se pudo sincronizar el catálogo de permisos: hazlo desde RBAC');
  }
}

// ─── Trabajos en segundo plano ──────────────────────────────────────────────
// La copia puede tardar más que el timeout de una petición HTTP: se lanza y el panel consulta el estado.

const jobs: PrdSyncJob[] = [];
let running = false;

/** Mensaje para el panel: los errores de permisos conocidos dicen qué falta; el resto se oculta. */
function syncErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === '42501' && e.message?.includes('session_replication_role')) {
    return 'El usuario de BD de QAS no puede desactivar las claves foráneas durante la copia. '
      + 'En el Postgres de QAS ejecuta: GRANT SET ON PARAMETER session_replication_role TO <usuario de db_servers>;';
  }
  if (e?.code === '42501') {
    return 'Falta un permiso en la base de datos (de QAS o del usuario de lectura de PRD). Revisa los logs de la API';
  }
  return safeMessage(error, 'La sincronización falló. Revisa los logs de la API');
}

function startJob(
  mode: PrdSyncJob['mode'],
  prdSlug: string,
  qasSlug: string,
  ctx: PrdSyncContext,
  work: (job: PrdSyncJob) => Promise<PrdSyncStats>,
): PrdSyncJob {
  if (running) throw new Error('Ya hay una sincronización en curso. Espera a que termine');
  running = true;

  const job: PrdSyncJob = {
    id: nanoid(),
    mode,
    prdSlug,
    qasSlug,
    qasTenantId: null,
    status: 'running',
    step: 'Iniciando',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: null,
    stats: null,
    warnings: [],
  };
  jobs.unshift(job);
  if (jobs.length > MAX_JOBS) jobs.length = MAX_JOBS;

  work(job)
    .then((stats) => {
      job.status = 'done';
      job.stats = stats;
      job.step = 'Completado';
      console.log(`[PRD Sync] ${mode} "${prdSlug}" → "${qasSlug}": ${stats.tablesCopied} tablas, ${stats.rowsCopied} filas, ${stats.imagesCopied} imágenes (${stats.imagesFailed} fallidas).`);
    })
    .catch((error) => {
      console.error(`[PRD Sync] Falló ${mode} "${prdSlug}":`, error);
      job.status = 'failed';
      job.message = syncErrorMessage(error);
    })
    .finally(async () => {
      job.finishedAt = new Date().toISOString();
      running = false;
      try {
        await masterDb.insert(auditLogs).values({
          tenantId: job.qasTenantId,
          userId: ctx.userId,
          action: mode === 'refresh' ? 'PRD_SYNC_REFRESH' : 'PRD_SYNC_CLONE',
          tableName: 'tenants',
          rowId: job.qasTenantId,
          newValues: JSON.stringify({ prdSlug, qasSlug, status: job.status, message: job.message, stats: job.stats, warnings: job.warnings }),
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });
      } catch (auditError) {
        console.warn('[PRD Sync] No se pudo registrar la auditoría:', auditError);
      }
    });

  return job;
}

// ─── API del servicio ───────────────────────────────────────────────────────

export function getPrdSyncStatus() {
  const { config, reason } = readPrdConfig();
  return { enabled: config !== null, reason, running, jobs };
}

export function getPrdSyncJob(id: string) {
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error('Sincronización no encontrada');
  return job;
}

/** Tenants de PRD y si ya existen en esta plataforma (mismo slug). */
export async function listPrdTenants() {
  const cfg = requirePrdConfig();
  const [prdTenants, qasTenants] = await Promise.all([
    withPrdMaster(cfg, (client) => fetchPrdTenants(client)),
    masterDb.select({ id: tenants.id, slug: tenants.slug, name: tenants.name, dbName: tenants.dbName }).from(tenants),
  ]);
  const qasBySlug = new Map(qasTenants.map((t) => [t.slug, t]));
  return prdTenants.map((t) => {
    const qas = qasBySlug.get(t.slug);
    return {
      slug: t.slug,
      name: t.name,
      dbName: t.dbName,
      status: t.status,
      qasTenant: qas ? { id: qas.id, name: qas.name, dbName: qas.dbName } : null,
    };
  });
}

async function getPrdTenant(cfg: PrdConfig, slug: string) {
  const [prd] = await withPrdMaster(cfg, (client) => fetchPrdTenants(client, slug));
  if (!prd) throw new Error(`El tenant "${slug}" no existe en PRD`);
  return prd;
}

/** Reemplaza los datos del tenant QAS con los de PRD (mismo slug). */
export async function startRefreshFromPrd(slug: string, input: RefreshFromPrdInput, ctx: PrdSyncContext) {
  const cfg = requirePrdConfig();
  if (input.confirmSlug !== slug) throw new Error('El slug de confirmación no coincide');
  if (running) throw new Error('Ya hay una sincronización en curso. Espera a que termine');

  const qas = await masterDb.query.tenants.findFirst({ where: eq(tenants.slug, slug), with: { server: true } });
  if (!qas) throw new Error(`El tenant "${slug}" no existe en QAS: usa "Clonar a QAS"`);
  const prd = await getPrdTenant(cfg, slug);
  assertTargetIsNotPrd(qas.server, prd, cfg);

  return startJob('refresh', slug, slug, ctx, async (job) => {
    job.qasTenantId = qas.id;

    job.step = 'Leyendo permisos de PRD';
    const rbac = await loadPrdRbac(cfg, prd.id);
    job.warnings.push(...rbac.warnings);

    job.step = 'Aplicando migraciones en QAS';
    await runTenantMigrations(qas.server, qas.dbName);

    const { stats, userIds } = await copyPrdIntoQas(cfg, prd, qas.server, qas.dbName, qas.slug, rbac, job);

    job.step = 'Sincronizando permisos';
    await mirrorGrantsAndSync(rbac, qas.id, job);
    for (const userId of userIds) invalidateUserPermissions(qas.id, userId);

    return stats;
  });
}

/** Crea el tenant en QAS (master + BD) con los datos de PRD. */
export async function startCloneFromPrd(prdSlug: string, input: CloneFromPrdInput, ctx: PrdSyncContext) {
  const cfg = requirePrdConfig();
  if (input.confirmSlug !== prdSlug) throw new Error('El slug de confirmación no coincide');
  if (running) throw new Error('Ya hay una sincronización en curso. Espera a que termine');

  const prd = await getPrdTenant(cfg, prdSlug);
  const slug = input.slug ?? prd.slug;
  const dbName = input.dbName ?? prd.dbName;
  const name = input.name ?? prd.name;

  const [existingSlug, existingDbName, plan, server] = await Promise.all([
    masterDb.query.tenants.findFirst({ where: eq(tenants.slug, slug) }),
    masterDb.query.tenants.findFirst({ where: eq(tenants.dbName, dbName) }),
    masterDb.query.plans.findFirst({ where: eq(plans.id, input.planId) }),
    masterDb.query.dbServers.findFirst({ where: eq(dbServers.id, input.serverId) }),
  ]);
  if (existingSlug) throw new Error(`El slug "${slug}" ya existe en QAS: usa "Actualizar QAS"`);
  if (existingDbName) throw new Error('El nombre de base de datos ya está en uso');
  if (!plan) throw new Error('El plan seleccionado no existe');
  if (!server) throw new Error('El servidor seleccionado no existe');
  if (!server.isActive) throw new Error('El servidor seleccionado no está activo');
  if (server.currentTenants >= server.maxTenants) throw new Error('El servidor seleccionado ha alcanzado su límite de tenants');
  assertTargetIsNotPrd(server, prd, cfg);

  // Nunca reutilizar una BD física existente: la copia la vaciaría
  const adminDb = qasClient(server, 'postgres');
  await adminDb.connect();
  try {
    const exists = await adminDb.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount) throw new Error(`Ya existe una base de datos "${dbName}" en el servidor. Elige otro nombre`);
  } finally {
    await adminDb.end();
  }

  const startDate = new Date();
  let endDate = new Date();
  let pricePaid = input.billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
  if (input.planEndsAt) {
    endDate = new Date(input.planEndsAt);
    pricePaid = '0.00';
  } else if (input.billingCycle === 'monthly') {
    endDate.setMonth(endDate.getMonth() + 1);
  } else {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }

  return startJob('clone', prdSlug, slug, ctx, async (job) => {
    let createdTenantId: number | null = null;
    let dbCreated = false;
    const imageKeys: string[] = [];

    try {
      job.step = 'Leyendo permisos de PRD';
      const rbac = await loadPrdRbac(cfg, prd.id);
      job.warnings.push(...rbac.warnings);

      job.step = 'Registrando el tenant en QAS';
      const newTenant = await masterDb.transaction(async (tx) => {
        const [inserted] = await tx.insert(tenants).values({
          name,
          slug,
          status: 'active',
          serverId: server.id,
          dbName,
          planId: plan.id,
          billingCycle: input.billingCycle,
          planStartsAt: startDate,
          planEndsAt: endDate,
          internalNotes: `Clonado desde PRD (${prd.slug})`,
          updatedAt: new Date(),
        }).returning();

        await tx.insert(subscriptions).values({
          tenantId: inserted.id,
          planId: plan.id,
          billingCycle: input.billingCycle,
          pricePaid: pricePaid.toString(),
          startDate,
          endDate,
          status: 'active',
          paymentStatus: 'paid',
        });

        await tx.update(dbServers)
          .set({ currentTenants: sql`${dbServers.currentTenants} + 1`, updatedAt: new Date() })
          .where(eq(dbServers.id, server.id));

        return inserted;
      });
      createdTenantId = newTenant.id;
      job.qasTenantId = newTenant.id;

      job.step = 'Creando la base de datos';
      await createTenantDatabase(server, dbName);
      dbCreated = true;
      await runTenantMigrations(server, dbName);

      const { stats } = await copyPrdIntoQas(cfg, prd, server, dbName, slug, rbac, job, (keys) => imageKeys.push(...keys));

      job.step = 'Sincronizando permisos';
      await mirrorGrantsAndSync(rbac, newTenant.id, job);

      return stats;
    } catch (error) {
      console.error('[PRD Sync] Falló la clonación. Revirtiendo...', error);
      if (imageKeys.length > 0) {
        const s3 = getS3Client();
        await Promise.all(imageKeys.map((key) => s3.delete(key).catch(() => {})));
      }
      if (dbCreated) {
        await dropTenantDatabase(server, dbName).catch((dropError) => console.error('[PRD Sync Rollback] No se pudo borrar la BD:', dropError));
      }
      if (createdTenantId !== null) {
        const tenantId = createdTenantId;
        try {
          await masterDb.transaction(async (tx) => {
            await tx.delete(tenantFeatureGrants).where(eq(tenantFeatureGrants.tenantId, tenantId));
            await tx.delete(tenantRoleGrants).where(eq(tenantRoleGrants.tenantId, tenantId));
            await tx.delete(subscriptions).where(eq(subscriptions.tenantId, tenantId));
            await tx.delete(tenants).where(eq(tenants.id, tenantId));
            await tx.update(dbServers)
              .set({ currentTenants: sql`GREATEST(${dbServers.currentTenants} - 1, 0)`, updatedAt: new Date() })
              .where(eq(dbServers.id, server.id));
          });
        } catch (masterError) {
          console.error('[PRD Sync Rollback] Error al revertir el registro en master:', masterError);
        }
        job.qasTenantId = null;
      }
      throw error;
    }
  });
}
