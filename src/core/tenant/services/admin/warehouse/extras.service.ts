import { eq, and, asc, inArray } from 'drizzle-orm';
import {
  productExtraGroups,
  productExtraGroupAssignments,
  productExtras,
  orderItemExtras,
  items,
  recipes,
  recipeLines,
  products,
  categories,
  branches,
} from '../../../../../db/tenant/schema';
import { getTenantDb, type TenantDb } from '../../../../../utils/tenant-context';
import { toNum, roundQty, roundMoney } from './shared/numbers';
import { fetchItemWithUnits } from './shared/item-select';

// ─── Grupos ─────────────────────────────────────────────────────────────────

export async function listExtraGroups(brandId: number) {
  const db = getTenantDb();
  const groups = await db
    .select()
    .from(productExtraGroups)
    .where(eq(productExtraGroups.brandId, brandId))
    .orderBy(asc(productExtraGroups.name));

  const groupIds = groups.map((g) => g.id);
  const extras = groupIds.length
    ? await db
        .select()
        .from(productExtras)
        .where(inArray(productExtras.groupId, groupIds))
        .orderBy(asc(productExtras.sortOrder), asc(productExtras.name))
    : [];

  return groups.map((g) => ({
    ...g,
    extras: extras.filter((e) => e.groupId === g.id),
  }));
}

export async function getExtraGroupById(id: number) {
  const db = getTenantDb();
  const [group] = await db.select().from(productExtraGroups).where(eq(productExtraGroups.id, id));
  if (!group) return null;
  const extras = await db
    .select()
    .from(productExtras)
    .where(eq(productExtras.groupId, id))
    .orderBy(asc(productExtras.sortOrder));
  return { ...group, extras };
}

export async function createExtraGroup(data: {
  brandId: number;
  name: string;
  description?: string;
  isMultiple?: boolean;
  maxSelections?: number | null;
  isRequired?: boolean;
}) {
  const db = getTenantDb();
  const [row] = await db.insert(productExtraGroups).values({
    brandId: data.brandId,
    name: data.name,
    description: data.description,
    isMultiple: data.isMultiple ?? true,
    maxSelections: data.maxSelections ?? null,
    isRequired: data.isRequired ?? false,
  }).returning();
  return row;
}

export async function updateExtraGroup(id: number, data: Partial<{
  name: string;
  description: string;
  isMultiple: boolean;
  maxSelections: number | null;
  isRequired: boolean;
  isActive: boolean;
}>) {
  const db = getTenantDb();
  const [row] = await db
    .update(productExtraGroups)
    .set(data)
    .where(eq(productExtraGroups.id, id))
    .returning();
  return row;
}

export async function deleteExtraGroup(id: number) {
  const db = getTenantDb();
  await db.delete(productExtraGroups).where(eq(productExtraGroups.id, id));
}

// ─── Extras individuales ─────────────────────────────────────────────────────

export async function createExtra(data: {
  groupId: number;
  name: string;
  price: number;
  sourceType: 'item' | 'recipe' | 'none';
  itemId?: number | null;
  itemQty?: number;
  recipeId?: number | null;
  sortOrder?: number;
}) {
  const db = getTenantDb();

  if (data.sourceType === 'item' && !data.itemId) {
    throw new Error('Se requiere itemId cuando sourceType es "item"');
  }
  if (data.sourceType === 'recipe' && !data.recipeId) {
    throw new Error('Se requiere recipeId cuando sourceType es "recipe"');
  }

  const [row] = await db.insert(productExtras).values({
    groupId: data.groupId,
    name: data.name,
    price: String(data.price),
    sourceType: data.sourceType,
    itemId: data.itemId ?? null,
    itemQty: String(data.itemQty ?? 1),
    recipeId: data.recipeId ?? null,
    sortOrder: data.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function updateExtra(id: number, data: Partial<{
  name: string;
  price: number;
  sourceType: 'item' | 'recipe' | 'none';
  itemId: number | null;
  itemQty: number;
  recipeId: number | null;
  sortOrder: number;
  isActive: boolean;
}>) {
  const db = getTenantDb();
  const payload: Record<string, unknown> = { ...data };
  if (data.price !== undefined) payload.price = String(data.price);
  if (data.itemQty !== undefined) payload.itemQty = String(data.itemQty);
  const [row] = await db
    .update(productExtras)
    .set(payload)
    .where(eq(productExtras.id, id))
    .returning();
  return row;
}

export async function deleteExtra(id: number) {
  const db = getTenantDb();
  await db.delete(productExtras).where(eq(productExtras.id, id));
}

// ─── Asignación de grupos a productos ───────────────────────────────────────

export async function getExtrasForProduct(productId: number) {
  const db = getTenantDb();

  const assignments = await db
    .select({ groupId: productExtraGroupAssignments.groupId, extraIds: productExtraGroupAssignments.extraIds })
    .from(productExtraGroupAssignments)
    .where(eq(productExtraGroupAssignments.productId, productId));

  if (!assignments.length) return [];

  const groupIds = assignments.map((a) => a.groupId);
  const extraIdsByGroup = new Map(assignments.map((a) => [a.groupId, a.extraIds]));

  const groups = await db
    .select()
    .from(productExtraGroups)
    .where(and(inArray(productExtraGroups.id, groupIds), eq(productExtraGroups.isActive, true)))
    .orderBy(asc(productExtraGroups.name));

  const extras = await db
    .select()
    .from(productExtras)
    .where(and(inArray(productExtras.groupId, groupIds), eq(productExtras.isActive, true)))
    .orderBy(asc(productExtras.sortOrder), asc(productExtras.name));

  return groups.map((g) => {
    const allowedIds = extraIdsByGroup.get(g.id);
    const groupExtras = extras.filter((e) => e.groupId === g.id);
    return {
      ...g,
      extras: allowedIds ? groupExtras.filter((e) => allowedIds.includes(e.id)) : groupExtras,
    };
  });
}

/** Lista los productos que tienen asignado un grupo de extras, para vincular/desvincular desde el propio grupo. */
export async function getProductsForGroup(groupId: number) {
  const db = getTenantDb();

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      isActive: products.isActive,
      extraIds: productExtraGroupAssignments.extraIds,
    })
    .from(productExtraGroupAssignments)
    .innerJoin(products, eq(productExtraGroupAssignments.productId, products.id))
    .where(eq(productExtraGroupAssignments.groupId, groupId))
    .orderBy(asc(products.name));

  return rows;
}

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

/**
 * Asigna un grupo de extras a un producto (o actualiza la asignación existente).
 * extraIds = undefined/null → el producto ofrece todos los extras del grupo.
 * extraIds = [..]           → el producto solo ofrece esos extras puntuales del grupo.
 */
export async function assignGroupToProduct(productId: number, groupId: number, extraIds?: number[] | null) {
  const db = getTenantDb();

  const productBrandId = await getBrandIdForProduct(productId);
  const [group] = await db.select().from(productExtraGroups).where(eq(productExtraGroups.id, groupId));
  if (!group) throw new Error('Grupo de extras no encontrado');
  if (productBrandId != null && group.brandId !== productBrandId) {
    throw new Error('El grupo de extras pertenece a otra marca y no puede asignarse a este producto');
  }

  const normalizedExtraIds = extraIds ?? null;

  const [row] = await db
    .insert(productExtraGroupAssignments)
    .values({ productId, groupId, extraIds: normalizedExtraIds })
    .onConflictDoUpdate({
      target: [productExtraGroupAssignments.productId, productExtraGroupAssignments.groupId],
      set: { extraIds: normalizedExtraIds },
    })
    .returning();
  return row;
}

export async function unassignGroupFromProduct(productId: number, groupId: number) {
  const db = getTenantDb();
  await db
    .delete(productExtraGroupAssignments)
    .where(
      and(
        eq(productExtraGroupAssignments.productId, productId),
        eq(productExtraGroupAssignments.groupId, groupId),
      )
    );
}

// ─── Lógica de extras para órdenes ──────────────────────────────────────────

/**
 * Calcula el stock requerido por los extras de una orden.
 * Retorna un mapa itemId → qty total requerida.
 */
export async function calcExtrasStockRequired(
  orderItemsInput: { extras?: { extraId: number; qty: number }[] }[]
): Promise<Map<number, number>> {
  const db = getTenantDb();
  const required = new Map<number, number>();

  for (const oi of orderItemsInput) {
    if (!oi.extras?.length) continue;

    const extraIds = oi.extras.map((e) => e.extraId);
    const extrasData = await db
      .select()
      .from(productExtras)
      .where(inArray(productExtras.id, extraIds));

    for (const sel of oi.extras) {
      const extra = extrasData.find((e) => e.id === sel.extraId);
      if (!extra) continue;

      if (extra.sourceType === 'item' && extra.itemId) {
        const totalQty = roundQty(sel.qty * toNum(extra.itemQty));
        required.set(extra.itemId, (required.get(extra.itemId) ?? 0) + totalQty);
      } else if (extra.sourceType === 'recipe' && extra.recipeId) {
        const lines = await db
          .select()
          .from(recipeLines)
          .where(eq(recipeLines.recipeId, extra.recipeId));

        for (const rl of lines) {
          if (rl.isOptional) continue;
          const item = await fetchItemWithUnits(db, rl.itemId);
          if (!item?.recipeDischarge) continue;
          let qty = toNum(rl.qty) * sel.qty;
          const factor1 = toNum(item.conversionFactor);
          if (factor1 > 0 && item.costUnitId && item.ledgerUnitId !== item.costUnitId) {
            qty = qty / factor1;
          }
          required.set(rl.itemId, (required.get(rl.itemId) ?? 0) + roundQty(qty));
        }
      }
    }
  }

  return required;
}

/**
 * Calcula las líneas de descarga de stock correspondientes a extras de un pedido.
 * Retorna líneas listas para insertar en sales_discharge_lines.
 */
export async function buildExtrasDischargeLines(
  db: TenantDb,
  orderItemId: number,
  areaId: number,
): Promise<{ itemId: number; qty: number; unit: string; avgPrice: number; lineCost: number }[]> {
  const extras = await db
    .select({
      extra: productExtras,
      qty: orderItemExtras.qty,
    })
    .from(orderItemExtras)
    .innerJoin(productExtras, eq(orderItemExtras.extraId, productExtras.id))
    .where(eq(orderItemExtras.orderItemId, orderItemId));

  const lines: { itemId: number; qty: number; unit: string; avgPrice: number; lineCost: number }[] = [];

  for (const { extra, qty: selQty } of extras) {
    if (extra.sourceType === 'item' && extra.itemId) {
      const totalQty = roundQty(selQty * toNum(extra.itemQty));
      const item = await fetchItemWithUnits(db, extra.itemId);
      if (!item) continue;
      const avgPrice = toNum(item.avgPrice);
      lines.push({
        itemId: extra.itemId,
        qty: totalQty,
        unit: item.ledgerUnit,
        avgPrice,
        lineCost: roundMoney(totalQty * avgPrice),
      });
    } else if (extra.sourceType === 'recipe' && extra.recipeId) {
      const rLines = await db
        .select()
        .from(recipeLines)
        .where(eq(recipeLines.recipeId, extra.recipeId));

      for (const rl of rLines) {
        if (rl.isOptional) continue;
        const item = await fetchItemWithUnits(db, rl.itemId);
        if (!item?.recipeDischarge) continue;
        const recipeQty = roundQty(toNum(rl.qty) * selQty);
        const factor2 = toNum(item.conversionFactor);
        const needsConversion = factor2 > 0 && item.costUnitId && item.ledgerUnitId !== item.costUnitId;
        const stockQty = needsConversion ? recipeQty / factor2 : recipeQty;
        const avgPrice = toNum(item.avgPrice);
        lines.push({
          itemId: rl.itemId,
          qty: recipeQty,
          unit: rl.unit,
          avgPrice,
          lineCost: roundMoney(stockQty * avgPrice),
        });
      }
    }
  }

  return lines;
}
