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
import { uploadToR2, deleteFromR2, getImageUrl } from '@/utils/r2';

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
  let results;
  if (conditions.length) {
    results = await q.where(and(...conditions)).orderBy(asc(items.code));
  } else {
    results = await q.orderBy(asc(items.code));
  }
  return results.map((item) => ({
    ...item,
    image: getImageUrl(item.image),
  }));
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

  return {
    ...item,
    image: getImageUrl(item.image),
    areaAssignments: assignments,
  };
}

export async function createItem(
  data: {
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
    isActive?: boolean;
  },
  imageFile?: File,
  centralAreaId?: number,
  tenantSlug: string = 'general'
) {
  const db = getTenantDb();

  let imageUrl = null;
  if (imageFile) {
    imageUrl = await uploadToR2(imageFile, `${tenantSlug}/insumos`, 200);
  }

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

    const [item] = await tx.insert(items).values({
      ...data,
      image: imageUrl,
    }).returning();

    if (centralAreaId) {
      await tx.insert(itemAreaAssignments).values({
        itemId: item.id,
        areaId: centralAreaId,
        isActive: true,
      }).onConflictDoNothing();
    }

    return {
      ...item,
      image: getImageUrl(item.image),
    };
  });
}

export async function importItems(itemsList: any[], tenantSlug: string = 'general') {
  const db = getTenantDb();

  // Load cache of existing masters
  const allCategories = await db.select().from(itemCategories);
  const allSubcategories = await db.select().from(itemSubcategories);
  const allUnits = await db.select().from(measurementUnits).where(eq(measurementUnits.isActive, true));
  const allAreas = await db.select().from(storageAreas).where(eq(storageAreas.isActive, true));

  const successes: any[] = [];
  const failures: any[] = [];

  // Local lookup tables/helper structures
  const categoryCache = new Map<string, typeof itemCategories.$inferSelect>();
  for (const cat of allCategories) {
    categoryCache.set(cat.name.trim().toLowerCase(), cat);
  }

  const subcategoryCache = new Map<string, typeof itemSubcategories.$inferSelect>();
  for (const subcat of allSubcategories) {
    subcategoryCache.set(`${subcat.categoryId}:${subcat.name.trim().toLowerCase()}`, subcat);
  }

  const unitCache = new Map<string, typeof measurementUnits.$inferSelect>();
  for (const unit of allUnits) {
    unitCache.set(unit.code.trim().toLowerCase(), unit);
  }

  const areaCache = new Map<string, typeof storageAreas.$inferSelect>();
  for (const area of allAreas) {
    areaCache.set(area.name.trim().toLowerCase(), area);
  }

  for (let idx = 0; idx < itemsList.length; idx++) {
    const row = itemsList[idx];
    const rowNum = idx + 1;

    try {
      // Basic validations
      const code = String(row.code || '').trim().toUpperCase();
      const shortDescription = String(row.shortDescription || '').trim();
      const categoryName = String(row.categoryName || '').trim();
      const subcategoryName = String(row.subcategoryName || '').trim();
      const ledgerUnitCode = String(row.ledgerUnitCode || '').trim();
      const costUnitCode = String(row.costUnitCode || '').trim();
      const areaName = String(row.areaName || '').trim();

      if (!code) throw new Error('El código es requerido');
      if (!shortDescription) throw new Error('La descripción es requerida');
      if (!categoryName) throw new Error('La categoría es requerida');
      if (!subcategoryName) throw new Error('La subcategoría es requerida');
      if (!ledgerUnitCode) throw new Error('La unidad de medida contable es requerida');

      // We process each item inside a mini-transaction
      const importedItem = await db.transaction(async (tx) => {
        // 1. Check if item code already exists
        const [existingItem] = await tx.select().from(items).where(eq(items.code, code)).limit(1);
        if (existingItem) {
          throw new Error(`El código "${code}" ya está registrado`);
        }

        // 2. Resolve or create Category
        const catKey = categoryName.toLowerCase();
        let category = categoryCache.get(catKey);
        if (!category) {
          const [newCat] = await tx
            .insert(itemCategories)
            .values({ name: categoryName })
            .returning();
          category = newCat;
          categoryCache.set(catKey, category);
        }

        // 3. Resolve or create Subcategory
        const subcatKey = `${category.id}:${subcategoryName.toLowerCase()}`;
        let subcategory = subcategoryCache.get(subcatKey);
        if (!subcategory) {
          const [newSub] = await tx
            .insert(itemSubcategories)
            .values({ categoryId: category.id, name: subcategoryName })
            .returning();
          subcategory = newSub;
          subcategoryCache.set(subcatKey, subcategory);
        }

        // 4. Resolve Ledger Unit
        const ledgerUnit = unitCache.get(ledgerUnitCode.toLowerCase());
        if (!ledgerUnit) {
          throw new Error(`La unidad de medida contable "${ledgerUnitCode}" no existe`);
        }

        // 5. Resolve Cost Unit (optional, defaults to ledgerUnit)
        let costUnit = ledgerUnit;
        if (costUnitCode) {
          const resolvedCostUnit = unitCache.get(costUnitCode.toLowerCase());
          if (!resolvedCostUnit) {
            throw new Error(`La unidad de medida de costo "${costUnitCode}" no existe`);
          }
          costUnit = resolvedCostUnit;
        }

        // 6. Resolve Storage Area (optional)
        let areaId: number | undefined;
        if (areaName) {
          const storageArea = areaCache.get(areaName.toLowerCase());
          if (!storageArea) {
            throw new Error(`El almacén/área "${areaName}" no existe en el sistema`);
          }
          areaId = storageArea.id;
        }

        // Prepare flags & decimals
        const conversionFactor = row.conversionFactor ? String(parseFloat(row.conversionFactor)) : '1';
        const minStock = row.minStock ? String(parseFloat(row.minStock)) : '0';
        const expiryDays = row.expiryDays ? parseInt(row.expiryDays, 10) || 0 : 0;
        
        const portionable = row.portionable === true || String(row.portionable).toUpperCase() === 'SI' || String(row.portionable).toUpperCase() === 'TRUE';
        const recipeDischarge = row.recipeDischarge === true || String(row.recipeDischarge).toUpperCase() === 'SI' || String(row.recipeDischarge).toUpperCase() === 'TRUE';
        const dailyControl = row.dailyControl !== false && String(row.dailyControl).toUpperCase() !== 'NO' && String(row.dailyControl).toUpperCase() !== 'FALSE';
        const useMarketPrice = row.useMarketPrice === true || String(row.useMarketPrice).toUpperCase() === 'SI' || String(row.useMarketPrice).toUpperCase() === 'TRUE';
        const isActive = row.isActive !== false && String(row.isActive).toUpperCase() !== 'NO' && String(row.isActive).toUpperCase() !== 'FALSE';

        // Insert item
        const [insertedItem] = await tx.insert(items).values({
          code,
          shortDescription,
          subcategoryId: subcategory.id,
          ledgerUnitId: ledgerUnit.id,
          costUnitId: costUnit.id,
          ledgerUnit: ledgerUnit.code,
          costUnit: costUnit.code,
          conversionFactor,
          minStock,
          expiryDays,
          portionable,
          recipeDischarge,
          dailyControl,
          useMarketPrice,
          isActive,
        }).returning();

        // Assign area if specified
        if (areaId) {
          await tx.insert(itemAreaAssignments).values({
            itemId: insertedItem.id,
            areaId,
            isActive: true,
          }).onConflictDoNothing();
        }

        return insertedItem;
      });

      successes.push({
        row: rowNum,
        code: importedItem.code,
        shortDescription: importedItem.shortDescription,
      });

    } catch (err: any) {
      failures.push({
        row: rowNum,
        code: row.code || 'S/C',
        description: row.shortDescription || 'S/D',
        error: err.message || 'Error desconocido',
      });
    }
  }

  return { successes, failures };
}

export async function updateItem(
  id: number,
  data: Record<string, unknown>,
  imageFile?: File,
  tenantSlug: string = 'general'
) {
  const db = getTenantDb();

  return db.transaction(async (tx) => {
    const [existingItem] = await tx.select().from(items).where(eq(items.id, id));
    if (!existingItem) throw new Error('Artículo no encontrado');

    let imageUrl = existingItem.image;
    if (imageFile) {
      if (existingItem.image) {
        await deleteFromR2(existingItem.image);
      }
      imageUrl = await uploadToR2(imageFile, `${tenantSlug}/insumos`, 200);
    } else if (data.image === '') {
      if (existingItem.image) {
        await deleteFromR2(existingItem.image);
      }
      imageUrl = '';
    }

    const payload: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (imageFile || data.image === '') {
      payload.image = imageUrl;
    }

    if (payload.ledgerUnitId && !payload.ledgerUnit) {
      const [u] = await tx.select().from(measurementUnits).where(eq(measurementUnits.id, payload.ledgerUnitId as number));
      if (u) payload.ledgerUnit = u.code;
    }
    if (payload.costUnitId && !payload.costUnit) {
      const [u] = await tx.select().from(measurementUnits).where(eq(measurementUnits.id, payload.costUnitId as number));
      if (u) payload.costUnit = u.code;
    }

    const [row] = await tx.update(items).set(payload).where(eq(items.id, id)).returning();
    return {
      ...row,
      image: getImageUrl(row.image),
    };
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

  const results = await db
    .select({
      item: items,
      assignmentId: itemAreaAssignments.id,
    })
    .from(itemAreaAssignments)
    .innerJoin(items, eq(itemAreaAssignments.itemId, items.id))
    .where(and(...conditions))
    .orderBy(asc(items.shortDescription));

  return results.map((row) => ({
    ...row,
    item: {
      ...row.item,
      image: getImageUrl(row.item.image),
    },
  }));
}
