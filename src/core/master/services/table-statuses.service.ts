import { eq, asc } from 'drizzle-orm';
import { masterDb } from '@/db';
import { tableStatuses } from '@/db/master/schema';
import type { CreateTableStatusInput, UpdateTableStatusInput } from '../validations/table-statuses.validation';

// Caché en memoria para optimizar lecturas masivas desde los tenants sin JOIN inter-DB
let cachedStatusesList: any[] | null = null;
let cachedStatusesMap: Map<string, any> | null = null;

export async function refreshTableStatusesCache() {
  const list = await masterDb
    .select()
    .from(tableStatuses)
    .orderBy(asc(tableStatuses.displayOrder), asc(tableStatuses.id));
  
  cachedStatusesList = list;
  const map = new Map<string, any>();
  for (const status of list) {
    map.set(status.code, status);
  }
  cachedStatusesMap = map;
  return { list, map };
}

export async function getCachedTableStatusesMap(): Promise<Map<string, any>> {
  if (!cachedStatusesMap) {
    const { map } = await refreshTableStatusesCache();
    return map;
  }
  return cachedStatusesMap;
}

/** Sucia se muestra como disponible. Si el catálogo no tiene el código, no se cambia por Disponible. */
export function presentTableStatus(map: Map<string, any>, code: string | null | undefined) {
  const safe = code && code.length > 0 ? code : 'available';
  if (safe === 'dirty') {
    const available = map.get('available');
    return {
      code: 'dirty',
      name: 'Disponible',
      colorHex: available?.colorHex || '#10B981',
      bgColorClass: available?.bgColorClass || 'bg-emerald-500',
      isOperational: true,
    };
  }
  const found = map.get(safe);
  if (found) {
    return {
      code: found.code as string,
      name: found.name as string,
      colorHex: found.colorHex as string,
      bgColorClass: found.bgColorClass as string,
      isOperational: Boolean(found.isOperational),
    };
  }
  return {
    code: safe,
    name: '',
    colorHex: '',
    bgColorClass: '',
    isOperational: safe !== 'reserved' && safe !== 'disabled',
  };
}

export async function getAllTableStatuses(fromCache = false) {
  if (fromCache && cachedStatusesList) {
    return cachedStatusesList;
  }
  const { list } = await refreshTableStatusesCache();
  return list;
}

export async function getTableStatusByCode(code: string) {
  const [status] = await masterDb.select().from(tableStatuses).where(eq(tableStatuses.code, code));
  return status;
}

export async function createTableStatus(data: CreateTableStatusInput) {
  const existing = await getTableStatusByCode(data.code);
  if (existing) {
    throw new Error('Ya existe un estado de mesa con ese código');
  }

  const [created] = await masterDb.insert(tableStatuses).values(data).returning();
  await refreshTableStatusesCache(); // Revalidamos la caché
  return created;
}

export async function updateTableStatus(code: string, data: UpdateTableStatusInput) {
  const [updated] = await masterDb
    .update(tableStatuses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tableStatuses.code, code))
    .returning();
  if (updated) {
    await refreshTableStatusesCache();
  }
  return updated;
}

export async function deleteTableStatus(code: string) {
  const [deleted] = await masterDb
    .delete(tableStatuses)
    .where(eq(tableStatuses.code, code))
    .returning();
  if (deleted) {
    await refreshTableStatusesCache();
  }
  return deleted;
}
