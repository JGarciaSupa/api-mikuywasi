import { salons, tables } from '@/db/tenant/schema';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getTenantDb } from '@/utils/tenant-context';
import { getCachedTableStatusesMap } from '@/core/master/services/table-statuses.service';

/**
 * Verificar que el salón exista y pertenezca a la sucursal de la mesa.
 * Evita asignar mesas a salones de otra sede.
 */
async function assertSalonInBranch(salonId: string, branchId: number) {
  const db = getTenantDb();
  const [salon] = await db.select().from(salons).where(eq(salons.id, salonId));
  if (!salon) {
    throw new Error('El salón no existe');
  }
  if (salon.branchId !== branchId) {
    throw new Error('El salón pertenece a otra sucursal');
  }
}

/**
 * Obtener las mesas de UNA sucursal. branchId es obligatorio — sin esto, un
 * tenant con varias sedes filtraría (o mezclaría) mesas de sucursales ajenas.
 */
export async function getAllTables(branchId: number) {
  const db = getTenantDb();
  const rawTables = await db.select().from(tables)
    .where(eq(tables.branchId, branchId))
    .orderBy(tables.createdAt);

  const statusesMap = await getCachedTableStatusesMap();
  const defaultStatus = statusesMap.get('available') || {
    code: 'available',
    name: 'Disponible',
    colorHex: '#10B981',
    bgColorClass: 'bg-emerald-500',
    isOperational: true
  };

  return rawTables.map(t => {
    const s = statusesMap.get(t.statusCode) || defaultStatus;
    return {
      ...t,
      status: {
        code: s.code,
        name: s.name,
        colorHex: s.colorHex,
        bgColorClass: s.bgColorClass,
        isOperational: s.isOperational,
        updatedAt: t.statusUpdatedAt
      }
    };
  });
}

/**
 * Obtener una mesa por ID
 */
export async function getTableById(id: number) {
  const db = getTenantDb();
  const [table] = await db.select().from(tables).where(eq(tables.id, id));
  return table;
}

/**
 * Crear una nueva mesa con slug autogenerado y reintentos en caso de colisión
 */
export async function createTable(data: { name: string; branchId: number; capacity?: number; shape?: 'square' | 'round'; salonId?: string | null }) {
  const db = getTenantDb();
  const branchId = data.branchId;

  if (data.salonId) {
    await assertSalonInBranch(data.salonId, branchId);
  }

  // 1. Verificar límite de 50 mesas por sucursal
  const [totalResult] = await db.select({ count: sql<number>`count(*)` })
    .from(tables)
    .where(eq(tables.branchId, branchId));

  if (Number(totalResult?.count || 0) >= 50) {
    throw new Error('Solo se permite un máximo de 50 mesas por sucursal');
  }

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      const slug = nanoid(8);
      const [newTable] = await db.insert(tables).values({
        name: data.name,
        branchId,
        slug,
        capacity: data.capacity ?? 1,
        shape: data.shape ?? 'square',
        salonId: data.salonId ?? null,
      }).returning();

      return newTable;
    } catch (error: any) {
      // Si el error es de unicidad (slug o tenant_slug_unique)
      if (error.code === '23505') {
        attempts++;
        if (attempts === maxAttempts) {
          throw new Error('No se pudo generar un identificador único para la mesa después de varios intentos');
        }
        continue;
      }
      throw error;
    }
  }
}

/**
 * Actualizar una mesa existente
 */
export async function updateTable(id: number, data: { name: string; capacity?: number; shape?: 'square' | 'round'; salonId?: string | null }) {
  const db = getTenantDb();

  // salonId: undefined = no tocar; null = quitar del salón; string = validar y asignar
  if (data.salonId) {
    const table = await getTableById(id);
    if (!table) return undefined;
    await assertSalonInBranch(data.salonId, table.branchId);
  }

  const [updatedTable] = await db
    .update(tables)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tables.id, id))
    .returning();
  return updatedTable;
}

/**
 * Actualizar solo la posición de una mesa en el mapa visual (arrastrar y soltar).
 * Separado de updateTable para no revalidar/reenviar nombre, capacidad o salón en cada suelto.
 */
export async function updateTablePosition(id: number, data: { posX: number; posY: number }) {
  const db = getTenantDb();
  const [updatedTable] = await db
    .update(tables)
    .set({ posX: data.posX, posY: data.posY, updatedAt: new Date() })
    .where(eq(tables.id, id))
    .returning();
  return updatedTable;
}

/**
 * Eliminar una mesa
 */
export async function deleteTable(id: number) {
  const db = getTenantDb();
  const [deletedTable] = await db
    .delete(tables)
    .where(eq(tables.id, id))
    .returning();
  return deletedTable;
}

/**
 * Actualizar el estado operativo o administrativo de una mesa en tiempo real.
 * Re-inicia el cronómetro (statusUpdatedAt) al instante actual.
 */
export async function updateTableStatus(id: number, statusCode: string, reservationNote?: string | null) {
  const db = getTenantDb();
  const statusesMap = await getCachedTableStatusesMap();
  if (!statusesMap.has(statusCode)) {
    throw new Error(`El estado '${statusCode}' no existe en el catálogo principal`);
  }

  const [updatedTable] = await db
    .update(tables)
    .set({
      statusCode,
      statusUpdatedAt: new Date(),
      currentReservationNote: statusCode === 'reserved' ? (reservationNote || null) : null,
      updatedAt: new Date(),
    })
    .where(eq(tables.id, id))
    .returning();

  if (!updatedTable) return undefined;

  const s = statusesMap.get(updatedTable.statusCode)!;
  return {
    ...updatedTable,
    status: {
      code: s.code,
      name: s.name,
      colorHex: s.colorHex,
      bgColorClass: s.bgColorClass,
      isOperational: s.isOperational,
      updatedAt: updatedTable.statusUpdatedAt
    }
  };
}

