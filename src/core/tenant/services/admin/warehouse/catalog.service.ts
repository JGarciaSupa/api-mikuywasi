import { eq, asc, and, like, or, sql } from 'drizzle-orm';
import {
  itemFamilies,
  itemSubfamilies,
  storageAreas,
  suppliers,
  items,
  itemAreaAssignments,
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

// ─── Subfamilias ────────────────────────────────────────────
export async function listSubfamilies(familyId?: number) {
  const db = getTenantDb();
  const q = db.select().from(itemSubfamilies);
  if (familyId) {
    return q.where(eq(itemSubfamilies.familyId, familyId)).orderBy(asc(itemSubfamilies.name));
  }
  return q.orderBy(asc(itemSubfamilies.name));
}

export async function createSubfamily(data: { familyId: number; name: string; description?: string; isActive?: boolean }) {
  const db = getTenantDb();
  const [row] = await db.insert(itemSubfamilies).values(data).returning();
  return row;
}

export async function updateSubfamily(id: number, data: Partial<{ familyId: number; name: string; description: string; isActive: boolean }>) {
  const db = getTenantDb();
  const [row] = await db.update(itemSubfamilies).set(data).where(eq(itemSubfamilies.id, id)).returning();
  return row;
}

// ─── Áreas de almacén ───────────────────────────────────────
export async function listAreas() {
  const db = getTenantDb();
  return db.select().from(storageAreas).orderBy(asc(storageAreas.name));
}

export async function getAreaById(id: number) {
  const db = getTenantDb();
  const [row] = await db.select().from(storageAreas).where(eq(storageAreas.id, id));
  return row;
}

export async function createArea(data: {
  name: string;
  type?: 'ambient' | 'cold' | 'frozen' | 'sub_warehouse';
  isCentral?: boolean;
  description?: string;
  isActive?: boolean;
}) {
  const db = getTenantDb();
  const [row] = await db.insert(storageAreas).values(data).returning();
  return row;
}

export async function updateArea(id: number, data: Partial<{
  name: string;
  type: 'ambient' | 'cold' | 'frozen' | 'sub_warehouse';
  isCentral: boolean;
  description: string;
  isActive: boolean;
}>) {
  const db = getTenantDb();
  const [row] = await db.update(storageAreas).set(data).where(eq(storageAreas.id, id)).returning();
  return row;
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

// ─── Artículos (maestro) ────────────────────────────────────
export async function listItems(filters?: { search?: string; subfamilyId?: number; isActive?: boolean }) {
  const db = getTenantDb();
  const conditions = [];
  if (filters?.subfamilyId) conditions.push(eq(items.subfamilyId, filters.subfamilyId));
  if (filters?.isActive !== undefined) conditions.push(eq(items.isActive, filters.isActive));
  if (filters?.search) {
    conditions.push(
      or(
        like(items.code, `%${filters.search}%`),
        like(items.fullDescription, `%${filters.search}%`),
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
      isCentral: storageAreas.isCentral,
    })
    .from(itemAreaAssignments)
    .innerJoin(storageAreas, eq(itemAreaAssignments.areaId, storageAreas.id))
    .where(eq(itemAreaAssignments.itemId, id));

  return { ...item, areaAssignments: assignments };
}

export async function createItem(data: {
  code: string;
  fullDescription: string;
  shortDescription: string;
  subfamilyId: number;
  itemType?: 'goods' | 'service' | 'fixed_asset';
  ledgerUnit: string;
  costUnit: string;
  conversionFactor?: string;
  minStock?: string;
  maxStock?: string;
  targetStock?: string;
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
    const [item] = await tx.insert(items).values(itemData).returning();

    const [central] = centralAreaId
      ? await tx.select().from(storageAreas).where(eq(storageAreas.id, centralAreaId))
      : await tx.select().from(storageAreas).where(eq(storageAreas.isCentral, true)).limit(1);

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
  const [row] = await db
    .update(items)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(items.id, id))
    .returning();
  return row;
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
        like(items.fullDescription, `%${search}%`),
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
    .orderBy(asc(items.fullDescription));
}
