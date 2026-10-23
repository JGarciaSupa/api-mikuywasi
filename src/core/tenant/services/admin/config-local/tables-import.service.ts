import { eq } from 'drizzle-orm';
import { branches, salons, tables } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import { isInternalError } from '@/utils/errors';
import { tableImportRowSchema, type TableImportInput } from '@/core/tenant/validations/admin/config-local/tables-import.validation';
import { createSalon } from './salons.service';
import { createTable } from './tables.service';

export type TableImportRowStatus = 'created' | 'skipped' | 'failed';

export interface TableImportRowResult {
  row: number;
  salon: string;
  table: string;
  status: TableImportRowStatus;
  tableId?: number;
  message?: string;
}

export interface TableImportResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  createdSalons: string[];
  results: TableImportRowResult[];
}

const normalizeKey = (value: string) => value.trim().toLowerCase();

/**
 * Importa salones y mesas (con su pax) de una sucursal desde un archivo.
 *
 * - Reutiliza createSalon / createTable: mismas reglas que el alta manual (máx. 50 mesas
 *   por sucursal, salón de la misma sede, slug QR único).
 * - Los salones se buscan por nombre en la sucursal; si no existen se crean.
 * - Las mesas cuyo nombre ya existe en la sucursal (o se repite en el archivo) se omiten.
 * - Cada fila es independiente: una fila con error no deshace las demás.
 */
export async function importTables(input: TableImportInput): Promise<TableImportResult> {
  const db = getTenantDb();

  const [branch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, input.branchId)).limit(1);
  if (!branch) throw new Error('Sucursal no encontrada');

  const salonByName = new Map<string, { id: string; name: string }>();
  for (const salon of await db.select({ id: salons.id, name: salons.name }).from(salons).where(eq(salons.branchId, branch.id))) {
    if (!salonByName.has(normalizeKey(salon.name))) salonByName.set(normalizeKey(salon.name), salon);
  }
  const existingTables = new Set(
    (await db.select({ name: tables.name }).from(tables).where(eq(tables.branchId, branch.id))).map((t) => normalizeKey(t.name)),
  );
  const importedTables = new Set<string>();

  const results: TableImportRowResult[] = [];
  const createdSalons: string[] = [];

  for (let idx = 0; idx < input.items.length; idx++) {
    const raw = input.items[idx];
    const fallbackRow = Number(raw.row) || idx + 1;
    const parsed = tableImportRowSchema.safeParse({ ...raw, row: fallbackRow });
    if (!parsed.success) {
      results.push({
        row: fallbackRow,
        salon: typeof raw.salon === 'string' ? raw.salon : '',
        table: typeof raw.table === 'string' || typeof raw.table === 'number' ? String(raw.table) : '',
        status: 'failed',
        message: parsed.error.issues[0]?.message ?? 'Fila inválida',
      });
      continue;
    }

    const row = parsed.data;
    const tableKey = normalizeKey(row.table);
    if (existingTables.has(tableKey)) {
      results.push({
        row: row.row,
        salon: row.salon,
        table: row.table,
        status: 'skipped',
        message: importedTables.has(tableKey) ? 'Mesa repetida en el archivo' : 'Ya existe una mesa con este nombre en la sucursal',
      });
      continue;
    }

    try {
      let salon = salonByName.get(normalizeKey(row.salon));
      if (!salon) {
        const created = await createSalon({ name: row.salon, branchId: branch.id });
        salon = { id: created.id, name: created.name };
        salonByName.set(normalizeKey(created.name), salon);
        createdSalons.push(created.name);
      }

      const table = await createTable({
        name: row.table,
        branchId: branch.id,
        capacity: row.pax ?? 1,
        shape: row.shape ?? 'square',
        salonId: salon.id,
      });

      existingTables.add(tableKey);
      importedTables.add(tableKey);
      results.push({ row: row.row, salon: salon.name, table: row.table, status: 'created', tableId: table?.id });
    } catch (error) {
      const message = !isInternalError(error) && error instanceof Error && error.message
        ? error.message
        : 'No se pudo guardar la fila';
      if (isInternalError(error)) console.error('[importTables] fila', row.row, error);
      results.push({ row: row.row, salon: row.salon, table: row.table, status: 'failed', message });
    }
  }

  return {
    total: results.length,
    created: results.filter((r) => r.status === 'created').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    createdSalons,
    results,
  };
}
