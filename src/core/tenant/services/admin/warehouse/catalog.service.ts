import { eq, asc, and, like, or } from 'drizzle-orm';
import {
  itemFamilies,
  storageAreas,
  suppliers,
  items,
  itemAreaAssignments,
  measurementUnits,
  warehouses,
  branches,
} from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';

// ─── Familias ───────────────────────────────────────────────
export async function listFamilies() {
  const db = getTenantDb();
  return db.select().from(itemFamilies).orderBy(asc(itemFamilies.name));
}

export async function createFamily(data: { name: string; description?: string; isActive?: boolean }) {
  const db = getTenantDb();
  const [row] = await db.insert(itemFamilies).values(data).returning();
  return row;
}

export async function updateFamily(id: number, data: Partial<{ name: string; description: string; isActive: boolean }>) {
  const db = getTenantDb();
  const [row] = await db.update(itemFamilies).set(data).where(eq(itemFamilies.id, id)).returning();
  return row;
}

// ─── Áreas de almacén ───────────────────────────────────────
export async function listAreas() {
  const db = getTenantDb();
  return db
    .select({
      id: storageAreas.id,
      warehouseId: storageAreas.warehouseId,
      name: storageAreas.name,
      type: storageAreas.type,
      description: storageAreas.description,
      isActive: storageAreas.isActive,
      createdAt: storageAreas.createdAt,
      isCentral: warehouses.isCentral,
    })
    .from(storageAreas)
    .innerJoin(warehouses, eq(storageAreas.warehouseId, warehouses.id))
    .orderBy(asc(storageAreas.name));
}

export async function getAreaById(id: number) {
  const db = getTenantDb();
  const [row] = await db
    .select({
      id: storageAreas.id,
      warehouseId: storageAreas.warehouseId,
      name: storageAreas.name,
      type: storageAreas.type,
      description: storageAreas.description,
      isActive: storageAreas.isActive,
      createdAt: storageAreas.createdAt,
      isCentral: warehouses.isCentral,
    })
    .from(storageAreas)
    .innerJoin(warehouses, eq(storageAreas.warehouseId, warehouses.id))
    .where(eq(storageAreas.id, id));
  return row;
}

export async function createArea(data: {
  warehouseId?: number;
  name: string;
  type?: 'ambient' | 'cold' | 'frozen' | 'sub_warehouse';
  description?: string;
  isActive?: boolean;
  isCentral?: boolean;
}) {
  const db = getTenantDb();
  let warehouseId = data.warehouseId;

  if (!warehouseId) {
    const isCentral = data.isCentral === true;

    // Find an existing warehouse with matching isCentral
    const [existingWh] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.isCentral, isCentral))
      .limit(1);

    if (existingWh) {
      warehouseId = existingWh.id;
    } else {
      // Create a new warehouse
      if (isCentral) {
        const [newWh] = await db
          .insert(warehouses)
          .values({
            name: 'Almacén Central',
            code: 'ALM-CENTRAL-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
            isCentral: true,
            isActive: true,
            description: 'Almacén central autogenerado',
          })
          .returning();
        warehouseId = newWh.id;
      } else {
        // Get the main branch or any branch if possible
        const [mainBranch] = await db.select().from(branches).where(eq(branches.isMain, true)).limit(1);
        const branchId = mainBranch?.id || null;

        const [newWh] = await db
          .insert(warehouses)
          .values({
            branchId,
            name: 'Almacén Local',
            code: 'ALM-LOCAL-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
            isCentral: false,
            isActive: true,
            description: 'Almacén local autogenerado',
          })
          .returning();
        warehouseId = newWh.id;
      }
    }
  }

  const insertData = {
    warehouseId: warehouseId!,
    name: data.name,
    type: data.type || 'ambient',
    description: data.description,
    isActive: data.isActive !== false,
  };

  const [row] = await db.insert(storageAreas).values(insertData).returning();

  // Return the row with isCentral field
  const [result] = await db
    .select({
      id: storageAreas.id,
      warehouseId: storageAreas.warehouseId,
      name: storageAreas.name,
      type: storageAreas.type,
      description: storageAreas.description,
      isActive: storageAreas.isActive,
      createdAt: storageAreas.createdAt,
      isCentral: warehouses.isCentral,
    })
    .from(storageAreas)
    .innerJoin(warehouses, eq(storageAreas.warehouseId, warehouses.id))
    .where(eq(storageAreas.id, row.id));

  return result;
}

export async function updateArea(id: number, data: Partial<{
  name: string;
  type: 'ambient' | 'cold' | 'frozen' | 'sub_warehouse';
  description: string;
  isActive: boolean;
}>) {
  const db = getTenantDb();
  const [row] = await db.update(storageAreas).set(data).where(eq(storageAreas.id, id)).returning();

  const [result] = await db
    .select({
      id: storageAreas.id,
      warehouseId: storageAreas.warehouseId,
      name: storageAreas.name,
      type: storageAreas.type,
      description: storageAreas.description,
      isActive: storageAreas.isActive,
      createdAt: storageAreas.createdAt,
      isCentral: warehouses.isCentral,
    })
    .from(storageAreas)
    .innerJoin(warehouses, eq(storageAreas.warehouseId, warehouses.id))
    .where(eq(storageAreas.id, row.id));

  return result;
}

// ─── Proveedores ────────────────────────────────────────────
export async function listSuppliers(search?: string) {
  const db = getTenantDb();
  if (search) {
    return db
      .select()
      .from(suppliers)
      .where(
        or(
          like(suppliers.legalName, `%${search}%`),
          like(suppliers.tradeName, `%${search}%`),
          like(suppliers.taxId, `%${search}%`)
        )
      )
      .orderBy(asc(suppliers.legalName));
  }
  return db.select().from(suppliers).orderBy(asc(suppliers.legalName));
}

export async function getSupplierById(id: number) {
  const db = getTenantDb();
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  return row;
}

export async function createSupplier(data: {
  taxId?: string;
  legalName: string;
  tradeName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
}) {
  const db = getTenantDb();
  const [row] = await db.insert(suppliers).values({
    phone: data.phone ?? '-',
    email: data.email ?? '-',
    ...data,
  }).returning();
  return row;
}

export async function updateSupplier(id: number, data: Partial<{
  taxId: string;
  legalName: string;
  tradeName: string;
  contactPerson: string;
  phone: string;
  email: string;
  isActive: boolean;
}>) {
  const db = getTenantDb();
  const [row] = await db
    .update(suppliers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(suppliers.id, id))
    .returning();
  return row;
}

// ─── Unidades de medida ─────────────────────────────────────
type UnitDimension = string;

export async function listMeasurementUnits(dimension?: UnitDimension) {
  const db = getTenantDb();
  const q = db.select().from(measurementUnits).where(eq(measurementUnits.isActive, true));
  if (dimension) {
    return db.select().from(measurementUnits)
      .where(and(eq(measurementUnits.isActive, true), eq(measurementUnits.dimension, dimension)))
      .orderBy(asc(measurementUnits.code));
  }
  return q.orderBy(asc(measurementUnits.code));
}

export async function createMeasurementUnit(data: {
  code: string;
  name: string;
  dimension: UnitDimension;
  baseFactor?: string | null;
  isActive?: boolean;
}) {
  const db = getTenantDb();
  const [row] = await db.insert(measurementUnits).values(data).returning();
  return row;
}

export async function updateMeasurementUnit(id: number, data: Partial<{
  code: string;
  name: string;
  dimension: UnitDimension;
  baseFactor: string | null;
  isActive: boolean;
}>) {
  const db = getTenantDb();
  const [row] = await db.update(measurementUnits)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(measurementUnits.id, id))
    .returning();
  return row;
}

// ─── Artículos (maestro) ────────────────────────────────────
export async function listItems(filters?: { search?: string; familyId?: number; isActive?: boolean }) {
  const db = getTenantDb();
  const conditions = [];
  if (filters?.familyId) conditions.push(eq(items.familyId, filters.familyId));
  if (filters?.isActive !== undefined) conditions.push(eq(items.isActive, filters.isActive));
  if (filters?.search) {
    conditions.push(
      or(
        like(items.code, `%${filters.search}%`),
        like(items.shortDescription, `%${filters.search}%`)
      )!
    );
  }

  const q = db.select().from(items);
  if (conditions.length) {
    return q.where(and(...conditions)).orderBy(asc(items.code));
  }
  return q.orderBy(asc(items.code));
}

export async function getItemById(id: number) {
  const db = getTenantDb();
  const [item] = await db.select().from(items).where(eq(items.id, id));
  if (!item) return null;

  const assignments = await db
    .select({
      id: itemAreaAssignments.id,
      areaId: itemAreaAssignments.areaId,
      isActive: itemAreaAssignments.isActive,
      areaName: storageAreas.name,
    })
    .from(itemAreaAssignments)
    .innerJoin(storageAreas, eq(itemAreaAssignments.areaId, storageAreas.id))
    .where(eq(itemAreaAssignments.itemId, id));

  return { ...item, areaAssignments: assignments };
}

export async function createItem(data: {
  code: string;
  shortDescription: string;
  familyId: number;
  ledgerUnitId?: number;
  costUnitId?: number;
  ledgerUnit?: string;
  costUnit?: string;
  conversionFactor?: string;
  minStock?: string;
  expiryDays?: number;
  portionable?: boolean;
  recipeDischarge?: boolean;
  dailyControl?: boolean;
  useMarketPrice?: boolean;
  centralAreaId?: number;
}) {
  const db = getTenantDb();
  const { centralAreaId, ...itemData } = data;

  return db.transaction(async (tx) => {
    // Resolve legacy string unit codes from FK if provided
    if (itemData.ledgerUnitId && !itemData.ledgerUnit) {
      const [u] = await tx.select().from(measurementUnits).where(eq(measurementUnits.id, itemData.ledgerUnitId));
      if (u) itemData.ledgerUnit = u.code;
    }
    if (itemData.costUnitId && !itemData.costUnit) {
      const [u] = await tx.select().from(measurementUnits).where(eq(measurementUnits.id, itemData.costUnitId));
      if (u) itemData.costUnit = u.code;
    }
    if (!itemData.ledgerUnit) itemData.ledgerUnit = '';
    if (!itemData.costUnit) itemData.costUnit = itemData.ledgerUnit;

    const [item] = await tx.insert(items).values(itemData).returning();

    const [central] = centralAreaId
      ? await tx.select().from(storageAreas).where(eq(storageAreas.id, centralAreaId))
      : [];

    if (central) {
      await tx.insert(itemAreaAssignments).values({
        itemId: item.id,
        areaId: central.id,
        isActive: true,
      });
    }

    return item;
  });
}

export async function updateItem(id: number, data: Record<string, unknown>) {
  const db = getTenantDb();

  return db.transaction(async (tx) => {
    const payload: Record<string, unknown> = { ...data, updatedAt: new Date() };

    if (payload.ledgerUnitId && !payload.ledgerUnit) {
      const [u] = await tx.select().from(measurementUnits).where(eq(measurementUnits.id, payload.ledgerUnitId as number));
      if (u) payload.ledgerUnit = u.code;
    }
    if (payload.costUnitId && !payload.costUnit) {
      const [u] = await tx.select().from(measurementUnits).where(eq(measurementUnits.id, payload.costUnitId as number));
      if (u) payload.costUnit = u.code;
    }

    const [row] = await tx.update(items).set(payload).where(eq(items.id, id)).returning();
    return row;
  });
}

export async function assignItemToArea(itemId: number, areaId: number) {
  const db = getTenantDb();
  const [row] = await db
    .insert(itemAreaAssignments)
    .values({ itemId, areaId, isActive: true })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function removeItemFromArea(itemId: number, areaId: number) {
  const db = getTenantDb();
  await db
    .delete(itemAreaAssignments)
    .where(and(eq(itemAreaAssignments.itemId, itemId), eq(itemAreaAssignments.areaId, areaId)));
}

export async function listItemsByArea(areaId: number, search?: string) {
  const db = getTenantDb();
  const conditions = [
    eq(itemAreaAssignments.areaId, areaId),
    eq(itemAreaAssignments.isActive, true),
    eq(items.isActive, true),
  ];
  if (search) {
    conditions.push(
      or(
        like(items.shortDescription, `%${search}%`),
        like(items.code, `%${search}%`)
      )!
    );
  }

  return db
    .select({
      item: items,
      assignmentId: itemAreaAssignments.id,
    })
    .from(itemAreaAssignments)
    .innerJoin(items, eq(itemAreaAssignments.itemId, items.id))
    .where(and(...conditions))
    .orderBy(asc(items.shortDescription));
}
