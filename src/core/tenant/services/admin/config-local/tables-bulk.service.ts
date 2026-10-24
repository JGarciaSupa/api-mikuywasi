import { and, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { tables } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import type { BulkCreateTablesInput } from '@/core/tenant/validations/admin/config-local/tables.validation';
import { assertSalonInBranch } from './tables.service';

export interface BulkCreateTablesResult {
  /** Nombres que se crean (o se crearían con dryRun) */
  names: string[];
  /** Nombres pedidos que ya existen en la sucursal: se omiten */
  skipped: string[];
  created: number;
  tables?: (typeof tables.$inferSelect)[];
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Mesa" → "Mesa ", "T-" → "T-", "" → "" (el número va pegado tras un separador) */
function baseFromPrefix(prefix: string) {
  const trimmed = prefix.trim();
  if (!trimmed) return '';
  return /[-_#/.]$/.test(trimmed) ? trimmed : `${trimmed} `;
}

/** "Mesa 5" → { base: "Mesa ", number: 5 }; "Barra" → { base: "Barra ", number: 1 } */
function splitTableName(name: string) {
  const match = name.match(/^(.*?)(\d+)$/);
  if (match) return { base: match[1], number: Number(match[2]) };
  return { base: `${name.trim()} `, number: 1 };
}

/**
 * Crea varias mesas de una vez en un salón:
 * - Numeración: prefijo + número desde `start` (o el siguiente libre) hasta completar `count`.
 * - Replicar (`sourceTableId`): copia salón, pax y forma de la mesa y sigue su numeración.
 * Los nombres que ya existen en la sucursal se omiten. Todo en una transacción.
 * dryRun = true → solo devuelve los nombres, sin escribir.
 */
export async function bulkCreateTables(input: BulkCreateTablesInput): Promise<BulkCreateTablesResult> {
  const db = getTenantDb();

  let salonId = input.salonId;
  let capacity = input.capacity;
  let shape = input.shape;
  let base = baseFromPrefix(input.prefix ?? 'Mesa');

  if (input.sourceTableId) {
    const [source] = await db
      .select()
      .from(tables)
      .where(and(eq(tables.id, input.sourceTableId), eq(tables.branchId, input.branchId)));
    if (!source) throw new Error('La mesa a replicar no existe en esta sucursal');
    if (!source.salonId) throw new Error('La mesa a replicar no tiene salón; asígnale uno antes de replicarla');
    salonId = source.salonId;
    capacity = source.capacity ?? 1;
    shape = (source.shape as 'square' | 'round' | null) ?? 'square';
    base = splitTableName(source.name).base;
  }

  if (!salonId) throw new Error('Es obligatorio asignar un salón a las mesas');
  await assertSalonInBranch(salonId, input.branchId);

  const existingNames = (await db.select({ name: tables.name }).from(tables).where(eq(tables.branchId, input.branchId)))
    .map((t) => t.name);
  const existingLower = new Set(existingNames.map((n) => n.trim().toLowerCase()));

  // Siguiente número libre para esta base (ej. si existen "Mesa 1..12" → 13)
  let start = input.start;
  if (start === undefined) {
    const pattern = new RegExp(`^${escapeRegExp(base.toLowerCase())}(\\d+)$`);
    const numbers = existingNames.map((n) => n.trim().toLowerCase().match(pattern)?.[1]).filter(Boolean).map(Number);
    start = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  }

  const requested = Array.from({ length: input.count }, (_, i) => `${base}${start! + i}`);
  const tooLong = requested.find((n) => n.length > 50);
  if (tooLong) throw new Error(`El nombre "${tooLong}" supera los 50 caracteres; usa un prefijo más corto`);

  const names = requested.filter((n) => !existingLower.has(n.toLowerCase()));
  const skipped = requested.filter((n) => existingLower.has(n.toLowerCase()));

  if (input.dryRun || names.length === 0) return { names, skipped, created: 0 };

  // Slugs del QR únicos: se generan y se descartan los que ya existan
  const slugs = new Set<string>();
  while (slugs.size < names.length) {
    const candidates = Array.from({ length: names.length - slugs.size }, () => nanoid(8)).filter((s) => !slugs.has(s));
    const taken = new Set(
      (await db.select({ slug: tables.slug }).from(tables).where(inArray(tables.slug, candidates))).map((t) => t.slug),
    );
    candidates.filter((s) => !taken.has(s)).forEach((s) => slugs.add(s));
  }
  const slugList = [...slugs];

  try {
    const created = await db.transaction(async (tx) =>
      tx.insert(tables).values(names.map((name, i) => ({
        name,
        branchId: input.branchId,
        slug: slugList[i],
        capacity: capacity ?? 1,
        shape: shape ?? 'square',
        salonId,
      }))).returning(),
    );
    return { names, skipped, created: created.length, tables: created };
  } catch (error: any) {
    const dbError = error.cause || error;
    if (dbError.code === '23505' && dbError.constraint === 'restaurant_tables_branch_name_unique_idx') {
      throw new Error('Otra persona creó una mesa con uno de esos nombres al mismo tiempo; vuelve a intentarlo');
    }
    throw error;
  }
}
