import { kitchenStations, productKitchenStations, categories, products } from '@/db/tenant/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getTenantDb } from '@/utils/tenant-context';

// ─── Catálogo de estaciones (por sucursal) ───────────────────────────────────

export async function listKitchenStations(branchId: number) {
  const db = getTenantDb();
  return db.select().from(kitchenStations)
    .where(eq(kitchenStations.branchId, branchId))
    .orderBy(asc(kitchenStations.name));
}

export async function getKitchenStationById(id: number) {
  const db = getTenantDb();
  const [station] = await db.select().from(kitchenStations).where(eq(kitchenStations.id, id));
  return station;
}

export async function createKitchenStation(data: any) {
  const db = getTenantDb();

  const existing = await db.select({ id: kitchenStations.id })
    .from(kitchenStations)
    .where(and(eq(kitchenStations.code, data.code), eq(kitchenStations.branchId, data.branchId)));

  if (existing.length > 0) {
    throw new Error(`Ya existe una estación con el código "${data.code}" en esta sucursal`);
  }

  const [newStation] = await db.insert(kitchenStations).values(data).returning();
  return newStation;
}

export async function updateKitchenStation(id: number, data: any) {
  const db = getTenantDb();

  if (data.code) {
    const [current] = await db.select({ branchId: kitchenStations.branchId })
      .from(kitchenStations)
      .where(eq(kitchenStations.id, id));

    const existing = await db.select({ id: kitchenStations.id })
      .from(kitchenStations)
      .where(and(eq(kitchenStations.code, data.code), eq(kitchenStations.branchId, current?.branchId)));

    if (existing.length > 0 && existing[0].id !== id) {
      throw new Error(`Ya existe una estación con el código "${data.code}" en esta sucursal`);
    }
  }

  const [updated] = await db
    .update(kitchenStations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(kitchenStations.id, id))
    .returning();
  return updated;
}

export async function deleteKitchenStation(id: number) {
  const db = getTenantDb();
  const [deleted] = await db
    .delete(kitchenStations)
    .where(eq(kitchenStations.id, id))
    .returning();
  return deleted;
}

// ─── Asignación de estaciones a productos (excepción, por código) ───────────
//
// El producto es tenant-wide (no tiene sucursal propia), así que la excepción se
// guarda por código y se resuelve dentro de la sucursal en la que cae cada pedido
// — por eso getStationsForProduct/assign/unassign necesitan branchId: son la
// "traducción" código↔fila para la sucursal que está mirando el admin ahora mismo.

export async function getStationsForProduct(productId: number, branchId: number) {
  const db = getTenantDb();

  const assignments = await db
    .select({ stationCode: productKitchenStations.stationCode })
    .from(productKitchenStations)
    .where(eq(productKitchenStations.productId, productId));

  if (!assignments.length) return [];

  const codes = assignments.map((a) => a.stationCode);

  return db
    .select()
    .from(kitchenStations)
    .where(and(
      inArray(kitchenStations.code, codes),
      eq(kitchenStations.branchId, branchId),
      eq(kitchenStations.isActive, true),
    ))
    .orderBy(asc(kitchenStations.name));
}

export async function assignStationToProduct(productId: number, stationCode: string) {
  const db = getTenantDb();
  const [row] = await db
    .insert(productKitchenStations)
    .values({ productId, stationCode })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function unassignStationFromProduct(productId: number, stationCode: string) {
  const db = getTenantDb();
  await db
    .delete(productKitchenStations)
    .where(
      and(
        eq(productKitchenStations.productId, productId),
        eq(productKitchenStations.stationCode, stationCode),
      )
    );
}

// ─── Resolución de estaciones efectivas (excepción de producto > categoría) ──
//
// Un producto resuelve su(s) estación(es) en cascada, dentro de la sucursal del
// pedido en curso (branchId):
//   1. Excepción explícita en product_kitchen_stations (por código; puede ser varias).
//   2. Código de estación de su subcategoría (categories.kitchenStationCode).
//   3. Código de estación de la categoría padre de esa subcategoría.
//   4. Sin asignar (array vacío) → fail-open, se muestra en todas las pantallas.
// Cada código se traduce a la fila real de kitchen_stations de esa sucursal; si el
// código no existe ahí (p.ej. una excepción apunta a una estación que ese local no
// tiene), se descarta esa opción y se sigue con el siguiente nivel de la cascada.
//
// Centralizado acá porque kitchen.service.ts lo necesita en dos lugares
// (getRequiredStationsForOrder y getActiveKitchenOrders) y ya tuvimos un caso
// real donde esos dos cálculos podían divergir por estar duplicados.
export async function resolveEffectiveStations(
  db: ReturnType<typeof getTenantDb>,
  productIds: number[],
  branchId: number,
): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  if (productIds.length === 0) return result;

  const branchStations = await db
    .select()
    .from(kitchenStations)
    .where(eq(kitchenStations.branchId, branchId));
  const stationIdByCode = new Map(branchStations.map((s) => [s.code, s.id]));

  const overrides = await db
    .select()
    .from(productKitchenStations)
    .where(inArray(productKitchenStations.productId, productIds));

  const overridesByProduct = new Map<number, string[]>();
  for (const o of overrides) {
    const list = overridesByProduct.get(o.productId) ?? [];
    list.push(o.stationCode);
    overridesByProduct.set(o.productId, list);
  }

  const remainingIds: number[] = [];
  for (const productId of productIds) {
    const codes = overridesByProduct.get(productId);
    if (codes) {
      const stationIds = codes.map((c) => stationIdByCode.get(c)).filter((id): id is number => !!id);
      if (stationIds.length > 0) {
        result.set(productId, stationIds);
        continue;
      }
    }
    remainingIds.push(productId);
  }

  if (remainingIds.length === 0) return result;

  const parentCategories = alias(categories, 'parent_categories');

  const rows = await db
    .select({
      productId: products.id,
      categoryStationCode: categories.kitchenStationCode,
      parentStationCode: parentCategories.kitchenStationCode,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .where(inArray(products.id, remainingIds));

  for (const row of rows) {
    const code = row.categoryStationCode ?? row.parentStationCode ?? null;
    const stationId = code ? stationIdByCode.get(code) : undefined;
    result.set(row.productId, stationId ? [stationId] : []);
  }

  return result;
}
