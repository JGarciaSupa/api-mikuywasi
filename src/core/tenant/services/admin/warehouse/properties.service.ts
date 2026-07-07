import { eq, and, asc, inArray } from 'drizzle-orm';
import {
  productPropertyGroups,
  productPropertyGroupAssignments,
  productProperties,
  products,
  categories,
  branches,
} from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';

// ─── Grupos ─────────────────────────────────────────────────────────────────

export async function listPropertyGroups(brandId: number) {
  const db = getTenantDb();
  const groups = await db
    .select()
    .from(productPropertyGroups)
    .where(eq(productPropertyGroups.brandId, brandId))
    .orderBy(asc(productPropertyGroups.sortOrder), asc(productPropertyGroups.name));

  const groupIds = groups.map((g) => g.id);
  const properties = groupIds.length
    ? await db
        .select()
        .from(productProperties)
        .where(inArray(productProperties.groupId, groupIds))
        .orderBy(asc(productProperties.sortOrder), asc(productProperties.name))
    : [];

  return groups.map((g) => ({
    ...g,
    properties: properties.filter((p) => p.groupId === g.id),
  }));
}

export async function getPropertyGroupById(id: number) {
  const db = getTenantDb();
  const [group] = await db.select().from(productPropertyGroups).where(eq(productPropertyGroups.id, id));
  if (!group) return null;
  const properties = await db
    .select()
    .from(productProperties)
    .where(eq(productProperties.groupId, id))
    .orderBy(asc(productProperties.sortOrder));
  return { ...group, properties };
}

export async function createPropertyGroup(data: {
  brandId: number;
  name: string;
  description?: string;
  isMultiple?: boolean;
  isRequired?: boolean;
  sortOrder?: number;
}) {
  const db = getTenantDb();
  const [row] = await db.insert(productPropertyGroups).values({
    brandId: data.brandId,
    name: data.name,
    description: data.description,
    isMultiple: data.isMultiple ?? false,
    isRequired: data.isRequired ?? false,
    sortOrder: data.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function updatePropertyGroup(id: number, data: Partial<{
  name: string;
  description: string;
  isMultiple: boolean;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
}>) {
  const db = getTenantDb();
  const [row] = await db
    .update(productPropertyGroups)
    .set(data)
    .where(eq(productPropertyGroups.id, id))
    .returning();
  return row;
}

export async function deletePropertyGroup(id: number) {
  const db = getTenantDb();
  await db.delete(productPropertyGroups).where(eq(productPropertyGroups.id, id));
}

// ─── Propiedades individuales ───────────────────────────────────────────────

export async function createProperty(data: {
  groupId: number;
  name: string;
  sortOrder?: number;
}) {
  const db = getTenantDb();
  const [row] = await db.insert(productProperties).values({
    groupId: data.groupId,
    name: data.name,
    sortOrder: data.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function updateProperty(id: number, data: Partial<{
  name: string;
  sortOrder: number;
  isActive: boolean;
}>) {
  const db = getTenantDb();
  const [row] = await db
    .update(productProperties)
    .set(data)
    .where(eq(productProperties.id, id))
    .returning();
  return row;
}

export async function deleteProperty(id: number) {
  const db = getTenantDb();
  await db.delete(productProperties).where(eq(productProperties.id, id));
}

// ─── Asignación de grupos a productos ───────────────────────────────────────

/** Resuelve la marca (brandId) a la que pertenece un producto vía category → branch → brand. */
export async function getBrandIdForProduct(productId: number): Promise<number | null> {
  const db = getTenantDb();
  const [row] = await db
    .select({ brandId: branches.brandId })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(branches, eq(categories.branchId, branches.id))
    .where(eq(products.id, productId));
  return row?.brandId ?? null;
}

export async function getPropertiesForProduct(productId: number) {
  const db = getTenantDb();

  const assignments = await db
    .select({ groupId: productPropertyGroupAssignments.groupId })
    .from(productPropertyGroupAssignments)
    .where(eq(productPropertyGroupAssignments.productId, productId));

  if (!assignments.length) return [];

  const groupIds = assignments.map((a) => a.groupId);

  const groups = await db
    .select()
    .from(productPropertyGroups)
    .where(and(inArray(productPropertyGroups.id, groupIds), eq(productPropertyGroups.isActive, true)))
    .orderBy(asc(productPropertyGroups.sortOrder), asc(productPropertyGroups.name));

  const properties = await db
    .select()
    .from(productProperties)
    .where(and(inArray(productProperties.groupId, groupIds), eq(productProperties.isActive, true)))
    .orderBy(asc(productProperties.sortOrder), asc(productProperties.name));

  return groups.map((g) => ({
    ...g,
    properties: properties.filter((p) => p.groupId === g.id),
  }));
}

export async function assignGroupToProduct(productId: number, groupId: number) {
  const db = getTenantDb();

  const productBrandId = await getBrandIdForProduct(productId);
  const [group] = await db.select().from(productPropertyGroups).where(eq(productPropertyGroups.id, groupId));
  if (!group) throw new Error('Grupo de propiedades no encontrado');
  if (productBrandId != null && group.brandId !== productBrandId) {
    throw new Error('El grupo de propiedades pertenece a otra marca y no puede asignarse a este producto');
  }

  const [row] = await db
    .insert(productPropertyGroupAssignments)
    .values({ productId, groupId })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function unassignGroupFromProduct(productId: number, groupId: number) {
  const db = getTenantDb();
  await db
    .delete(productPropertyGroupAssignments)
    .where(
      and(
        eq(productPropertyGroupAssignments.productId, productId),
        eq(productPropertyGroupAssignments.groupId, groupId),
      )
    );
}
