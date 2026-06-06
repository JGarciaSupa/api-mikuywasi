import { eq, asc, and, like, or, isNull, inArray, ne } from 'drizzle-orm';
import {
  itemCategories,
  itemSubcategories,
  storageAreas,
  suppliers,
  items,
  itemAreaAssignments,
  measurementUnits,
  warehouses,
  branches,
} from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';

// ─── Categorías ─────────────────────────────────────────────
export async function listCategories() {
  const db = getTenantDb();
  return db.select().from(itemCategories).orderBy(asc(itemCategories.name));
}

export async function createCategory(data: { name: string; description?: string; isActive?: boolean }) {
  const db = getTenantDb();
  const [row] = await db.insert(itemCategories).values(data).returning();
  return row;
}

export async function updateCategory(id: number, data: Partial<{ name: string; description: string; isActive: boolean }>) {
  const db = getTenantDb();
  const [row] = await db.update(itemCategories).set(data).where(eq(itemCategories.id, id)).returning();
  return row;
}

// ─── Subcategorías ──────────────────────────────────────────
export async function listSubcategories(categoryId?: number) {
  const db = getTenantDb();
  const conditions = [];
  if (categoryId) {
    conditions.push(eq(itemSubcategories.categoryId, categoryId));
  }
  const q = db.select().from(itemSubcategories);
  if (conditions.length) {
    return q.where(and(...conditions)).orderBy(asc(itemSubcategories.name));
  }
  return q.orderBy(asc(itemSubcategories.name));
}

export async function createSubcategory(data: { categoryId: number; name: string; description?: string; isActive?: boolean }) {
  const db = getTenantDb();
  const [row] = await db.insert(itemSubcategories).values(data).returning();
  return row;
}

export async function updateSubcategory(id: number, data: Partial<{ categoryId: number; name: string; description: string; isActive: boolean }>) {
  const db = getTenantDb();
  const [row] = await db.update(itemSubcategories).set(data).where(eq(itemSubcategories.id, id)).returning();
  return row;
}

export async function deleteCategory(id: number) {
  const db = getTenantDb();
  await db.delete(itemCategories).where(eq(itemCategories.id, id));
  return true;
}

export async function deleteSubcategory(id: number) {
  const db = getTenantDb();
  await db.delete(itemSubcategories).where(eq(itemSubcategories.id, id));
  return true;
}

// ─── Áreas de almacén ───────────────────────────────────────
export async function listAreas(branchId?: number) {
  const db = getTenantDb();
  const query = db
    .select({
      id: storageAreas.id,
      warehouseId: storageAreas.warehouseId,
      name: storageAreas.name,
      type: storageAreas.type,
      description: storageAreas.description,
      isActive: storageAreas.isActive,
      createdAt: storageAreas.createdAt,
      isCentral: warehouses.isCentral,
      branchId: warehouses.branchId,
    })
    .from(storageAreas)
    .innerJoin(warehouses, eq(storageAreas.warehouseId, warehouses.id));

  if (branchId) {
    return await query
      .where(or(eq(warehouses.branchId, branchId), isNull(warehouses.branchId)))
      .orderBy(asc(storageAreas.name));
  }

  return await query.orderBy(asc(storageAreas.name));
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
      branchId: warehouses.branchId,
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
  branchId?: number;
}) {
  const db = getTenantDb();
  let warehouseId = data.warehouseId;

  if (!warehouseId) {
    const isCentral = data.isCentral === true;

    // Find an existing warehouse with matching isCentral and branchId (for local)
    const conditions = [eq(warehouses.isCentral, isCentral)];
    if (!isCentral && data.branchId) {
      conditions.push(eq(warehouses.branchId, data.branchId));
    } else if (!isCentral) {
      conditions.push(isNull(warehouses.branchId));
    }

    const [existingWh] = await db
      .select()
      .from(warehouses)
      .where(and(...conditions))
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
        const branchId = data.branchId || null;
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
  isCentral: boolean;
  branchId: number | null;
}>) {
  const db = getTenantDb();
  let warehouseId = undefined;

  if (data.isCentral !== undefined || data.branchId !== undefined) {
    // We need to resolve the target warehouse
    const [currentArea] = await db
      .select({
        isCentral: warehouses.isCentral,
        branchId: warehouses.branchId,
      })
      .from(storageAreas)
      .innerJoin(warehouses, eq(storageAreas.warehouseId, warehouses.id))
      .where(eq(storageAreas.id, id))
      .limit(1);

    const isCentral = data.isCentral !== undefined ? data.isCentral : (currentArea?.isCentral ?? false);
    const branchId = data.branchId !== undefined ? data.branchId : (currentArea?.branchId ?? null);

    const conditions = [eq(warehouses.isCentral, isCentral)];
    if (!isCentral && branchId) {
      conditions.push(eq(warehouses.branchId, branchId));
    } else if (!isCentral) {
      conditions.push(isNull(warehouses.branchId));
    }

    const [existingWh] = await db
      .select()
      .from(warehouses)
      .where(and(...conditions))
      .limit(1);

    if (existingWh) {
      warehouseId = existingWh.id;
    } else {
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

  const updateData: any = {
    name: data.name,
    type: data.type,
    description: data.description,
    isActive: data.isActive,
  };

  if (warehouseId !== undefined) {
    updateData.warehouseId = warehouseId;
  }

  const [row] = await db.update(storageAreas).set(updateData).where(eq(storageAreas.id, id)).returning();

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
      branchId: warehouses.branchId,
    })
    .from(storageAreas)
    .innerJoin(warehouses, eq(storageAreas.warehouseId, warehouses.id))
    .where(eq(storageAreas.id, row.id));

  return result;
}

export async function deleteArea(id: number) {
  const db = getTenantDb();
  await db.delete(storageAreas).where(eq(storageAreas.id, id));
  return true;
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

  if (data.taxId) {
    const [existing] = await db.select().from(suppliers).where(eq(suppliers.taxId, data.taxId));
    if (existing) {
      throw new Error(`El documento o RUC ${data.taxId} ya se encuentra registrado (inválido)`);
    }
  }

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

  if (data.taxId) {
    const [existing] = await db.select().from(suppliers).where(and(eq(suppliers.taxId, data.taxId), ne(suppliers.id, id)));
    if (existing) {
      throw new Error(`El documento o RUC ${data.taxId} ya se encuentra registrado (inválido)`);
    }
  }

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
export async function listItems(filters?: { search?: string; subcategoryId?: number; categoryId?: number; isActive?: boolean }) {
  const db = getTenantDb();
  const conditions = [];
  if (filters?.subcategoryId) conditions.push(eq(items.subcategoryId, filters.subcategoryId));
  if (filters?.isActive !== undefined) conditions.push(eq(items.isActive, filters.isActive));
  if (filters?.search) {
    conditions.push(
      or(
        like(items.code, `%${filters.search}%`),
        like(items.shortDescription, `%${filters.search}%`)
      )!
    );
  }

  if (filters?.categoryId) {
    const subcats = await db
      .select({ id: itemSubcategories.id })
      .from(itemSubcategories)
      .where(eq(itemSubcategories.categoryId, filters.categoryId));
    const subcatIds = subcats.map((s) => s.id);
    if (subcatIds.length === 0) {
      return [];
    }
    conditions.push(inArray(items.subcategoryId, subcatIds));
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
  subcategoryId: number;
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
}) {
  const db = getTenantDb();

  return db.transaction(async (tx) => {
    if (data.ledgerUnitId && !data.ledgerUnit) {
      const [u] = await tx.select().from(measurementUnits).where(eq(measurementUnits.id, data.ledgerUnitId));
      if (u) data.ledgerUnit = u.code;
    }
    if (data.costUnitId && !data.costUnit) {
      const [u] = await tx.select().from(measurementUnits).where(eq(measurementUnits.id, data.costUnitId));
      if (u) data.costUnit = u.code;
    }
    if (!data.ledgerUnit) data.ledgerUnit = '';
    if (!data.costUnit) data.costUnit = data.ledgerUnit;

    const [item] = await tx.insert(items).values(data).returning();
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
