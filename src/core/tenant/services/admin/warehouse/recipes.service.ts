import { eq, asc, and, desc, inArray } from 'drizzle-orm';
import { recipes, recipeLines, products, items, branchRecipeAreas, branches } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum, roundMoney } from './shared/numbers';

async function getRecipeWithLines(id: number, branchId = 1) {
  const db = getTenantDb();
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
  if (!recipe) return null;

  let bra = null;
  if (recipe.productId) {
    [bra] = await db.select().from(branchRecipeAreas).where(
      and(
        eq(branchRecipeAreas.branchId, branchId),
        eq(branchRecipeAreas.productId, recipe.productId)
      )
    ).limit(1);
  }

  const lines = await db
    .select({
      line: recipeLines,
      itemCode: items.code,
      itemDescription: items.shortDescription,
      itemAvgPrice: items.avgPrice,
    })
    .from(recipeLines)
    .innerJoin(items, eq(recipeLines.itemId, items.id))
    .where(eq(recipeLines.recipeId, id));

  let producedItemName = null;
  if (recipe.producedItemId) {
    const [item] = await db.select().from(items).where(eq(items.id, recipe.producedItemId)).limit(1);
    producedItemName = item?.shortDescription || null;
  }

  return { ...recipe, productionAreaId: bra?.areaId || null, producedItemName, lines };
}

export async function listRecipes(productId?: number, branchId = 1) {
  const db = getTenantDb();
  let q = db
    .select({
      recipe: recipes,
      productName: products.name,
      producedItemName: items.shortDescription,
      productionAreaId: branchRecipeAreas.areaId,
    })
    .from(recipes)
    .leftJoin(products, eq(recipes.productId, products.id))
    .leftJoin(items, eq(recipes.producedItemId, items.id))
    .leftJoin(branchRecipeAreas, and(
      eq(branchRecipeAreas.productId, recipes.productId),
      eq(branchRecipeAreas.branchId, branchId)
    ))
    .orderBy(desc(recipes.createdAt))
    .$dynamic();

  if (productId) {
    q = q.where(eq(recipes.productId, productId));
  }

  const results = await q;
  return results.map(row => {
    let resolvedName = row.recipe.name;
    if (row.recipe.type === 'sales') {
      resolvedName = row.productName || row.recipe.name || 'Receta de Venta';
    } else if (row.recipe.type === 'production') {
      resolvedName = row.producedItemName || row.recipe.name || 'Receta de Producción';
    }
    return {
      ...row.recipe,
      name: resolvedName,
      productName: row.productName,
      producedItemName: row.producedItemName,
      productionAreaId: row.productionAreaId,
    };
  });
}

export async function getRecipeById(id: number, branchId = 1) {
  const recipe = await getRecipeWithLines(id, branchId);
  if (!recipe) return null;

  const cost = recipe.lines.reduce((sum, row) => {
    const qty = toNum(row.line.qty);
    const price = toNum(row.itemAvgPrice);
    return sum + qty * price;
  }, 0);

  let salePrice = 0;
  let productName = undefined;
  let producedItemName = undefined;

  const db = getTenantDb();
  if (recipe.productId) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, recipe.productId));
    if (product) {
      salePrice = toNum(product.price);
      productName = product.name;
    }
  }

  if (recipe.producedItemId) {
    const [item] = await db
      .select()
      .from(items)
      .where(eq(items.id, recipe.producedItemId));
    if (item) {
      producedItemName = item.shortDescription;
    }
  }

  const servings = toNum(recipe.servings) || 1;
  const costPerServing = roundMoney(cost / servings);

  let resolvedName = recipe.name;
  if (recipe.type === 'sales') {
    resolvedName = productName || recipe.name || 'Receta de Venta';
  } else if (recipe.type === 'production') {
    resolvedName = producedItemName || recipe.name || 'Receta de Producción';
  }

  return {
    ...recipe,
    name: resolvedName,
    productName,
    producedItemName,
    costAnalysis: {
      totalCost: roundMoney(cost),
      costPerServing,
      salePrice,
      margin: roundMoney(salePrice - costPerServing),
    },
  };
}

export async function getRecipeByProductId(productId: number, branchId = 1) {
  const db = getTenantDb();
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.productId, productId), eq(recipes.isActive, true)))
    .limit(1);
  if (!recipe) return null;
  return getRecipeById(recipe.id, branchId);
}

export async function createRecipe(
  header: {
    productId?: number | null;
    producedItemId?: number | null;
    type?: 'sales' | 'production';
    name?: string | null;
    preparation?: string | null;
    servings?: string;
    yieldPct?: string;
    isActive?: boolean;
    productionAreaId?: number | null;
    branchId?: number | null;
  },
  lines: {
    itemId: number;
    qty: number;
    unit: string;
    isCost?: boolean;
    isOptional?: boolean;
    notes?: string;
  }[]
) {
  const db = getTenantDb();

  return db.transaction(async (tx) => {
    const { productionAreaId, branchId: rawBranchId, ...recipeData } = header;
    const branchId = rawBranchId ?? 1;

    let finalName = recipeData.name;
    if (!finalName) {
      if (recipeData.type === 'sales' && recipeData.productId) {
        const [product] = await tx.select().from(products).where(eq(products.id, recipeData.productId)).limit(1);
        finalName = product ? `Receta ${product.name}` : 'Receta de Venta';
      } else if (recipeData.type === 'production' && recipeData.producedItemId) {
        const [item] = await tx.select().from(items).where(eq(items.id, recipeData.producedItemId)).limit(1);
        finalName = item ? `Receta ${item.shortDescription}` : 'Receta de Producción';
      } else {
        finalName = recipeData.type === 'production' ? 'Receta de Producción' : 'Receta de Venta';
      }
    }

    const [recipe] = await tx.insert(recipes).values({
      ...recipeData,
      name: finalName,
    }).returning();

    if (productionAreaId && recipeData.productId) {
      await tx.delete(branchRecipeAreas).where(
        and(
          eq(branchRecipeAreas.branchId, branchId),
          eq(branchRecipeAreas.productId, recipeData.productId)
        )
      );
      await tx.insert(branchRecipeAreas).values({
        branchId,
        productId: recipeData.productId,
        areaId: productionAreaId,
      });
    }

    if (lines.length) {
      await tx.insert(recipeLines).values(
        lines.map((l) => ({
          recipeId: recipe.id,
          itemId: l.itemId,
          qty: String(l.qty),
          unit: l.unit,
          isCost: l.isCost ?? false,
          isOptional: l.isOptional ?? false,
          notes: l.notes,
        }))
      );
      // Auto-activar descarga por receta en todos los insumos de las líneas
      const itemIds = lines.map((l) => l.itemId);
      if (itemIds.length) {
        await tx.update(items).set({ recipeDischarge: true }).where(inArray(items.id, itemIds));
      }
    }

    return getRecipeById(recipe.id, branchId);
  });
}

export async function updateRecipe(
  id: number,
  header: Partial<typeof recipes.$inferInsert> & { productionAreaId?: number | null; branchId?: number | null },
  lines?: {
    itemId: number;
    qty: number;
    unit: string;
    isCost?: boolean;
    isOptional?: boolean;
    notes?: string;
  }[]
) {
  const db = getTenantDb();

  return db.transaction(async (tx) => {
    const { productionAreaId, branchId: rawBranchId, ...recipeData } = header;
    const branchId = rawBranchId ?? 1;

    const [existing] = await tx.select().from(recipes).where(eq(recipes.id, id));
    if (!existing) return null;

    const mergedType = recipeData.type || existing.type;
    const mergedProductId = recipeData.productId !== undefined ? recipeData.productId : existing.productId;
    const mergedProducedItemId = recipeData.producedItemId !== undefined ? recipeData.producedItemId : existing.producedItemId;

    let finalName = recipeData.name;
    if (finalName === undefined) {
      finalName = existing.name;
    }

    if (!finalName) {
      if (mergedType === 'sales' && mergedProductId) {
        const [product] = await tx.select().from(products).where(eq(products.id, mergedProductId)).limit(1);
        finalName = product ? `Receta ${product.name}` : 'Receta de Venta';
      } else if (mergedType === 'production' && mergedProducedItemId) {
        const [item] = await tx.select().from(items).where(eq(items.id, mergedProducedItemId)).limit(1);
        finalName = item ? `Receta ${item.shortDescription}` : 'Receta de Producción';
      }
    }

    await tx
      .update(recipes)
      .set({
        ...recipeData,
        name: finalName,
        productId: recipeData.productId === undefined ? existing.productId : recipeData.productId,
        producedItemId: recipeData.producedItemId === undefined ? existing.producedItemId : recipeData.producedItemId,
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, id));

    if (productionAreaId !== undefined && mergedProductId) {
      // Eliminar la configuración de área para esta sucursal (si existe)
      await tx.delete(branchRecipeAreas).where(
        and(
          eq(branchRecipeAreas.branchId, branchId),
          eq(branchRecipeAreas.productId, mergedProductId)
        )
      );
      // Solo insertar si se proporcionó un área válida
      if (productionAreaId) {
        await tx.insert(branchRecipeAreas).values({
          branchId,
          productId: mergedProductId,
          areaId: productionAreaId,
        });
      }
    }

    if (lines) {
      await tx.delete(recipeLines).where(eq(recipeLines.recipeId, id));
      if (lines.length) {
        await tx.insert(recipeLines).values(
          lines.map((l) => ({
            recipeId: id,
            itemId: l.itemId,
            qty: String(l.qty),
            unit: l.unit,
            isCost: l.isCost ?? false,
            isOptional: l.isOptional ?? false,
            notes: l.notes,
          }))
        );
        // Auto-activar descarga por receta en todos los insumos de las líneas
        const itemIds = lines.map((l) => l.itemId);
        if (itemIds.length) {
          await tx.update(items).set({ recipeDischarge: true }).where(inArray(items.id, itemIds));
        }
      }
    }

    return getRecipeById(id, branchId);
  });
}

/**
 * Propaga la configuración de áreas de producción desde la sucursal 1
 * a todas las demás sucursales activas que aún no tengan configuración propia.
 * También activa recipeDischarge=true en todos los insumos que están en alguna receta.
 * Devuelve el número de registros creados y el número de insumos actualizados.
 */
export async function propagateBranchAreas(): Promise<{
  areasCreated: number;
  itemsActivated: number;
}> {
  const db = getTenantDb();

  return db.transaction(async (tx) => {
    // 1. Obtener todas las sucursales excepto la 1
    const allBranches = await tx
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.isActive, true)));

    const otherBranchIds = allBranches.map((b) => b.id).filter((id) => id !== 1);

    // 2. Obtener toda la configuración de sucursal 1
    const sourceMappings = await tx
      .select()
      .from(branchRecipeAreas)
      .where(eq(branchRecipeAreas.branchId, 1));

    let areasCreated = 0;

    for (const mapping of sourceMappings) {
      for (const targetBranchId of otherBranchIds) {
        // Verificar si ya existe configuración para esta sucursal+producto
        const [existing] = await tx
          .select()
          .from(branchRecipeAreas)
          .where(
            and(
              eq(branchRecipeAreas.branchId, targetBranchId),
              eq(branchRecipeAreas.productId, mapping.productId)
            )
          )
          .limit(1);

        if (!existing) {
          await tx.insert(branchRecipeAreas).values({
            branchId: targetBranchId,
            productId: mapping.productId,
            areaId: mapping.areaId,
          });
          areasCreated++;
        }
      }
    }

    // 3. Activar recipeDischarge=true en todos los insumos que están en recetas activas
    const recipeItemIds = await tx
      .select({ itemId: recipeLines.itemId })
      .from(recipeLines)
      .innerJoin(recipes, eq(recipeLines.recipeId, recipes.id))
      .where(eq(recipes.isActive, true));

    const uniqueItemIds = [...new Set(recipeItemIds.map((r) => r.itemId))];
    let itemsActivated = 0;

    if (uniqueItemIds.length > 0) {
      const result = await tx
        .update(items)
        .set({ recipeDischarge: true })
        .where(
          and(
            inArray(items.id, uniqueItemIds),
            eq(items.recipeDischarge, false)
          )
        )
        .returning({ id: items.id });
      itemsActivated = result.length;
    }

    return { areasCreated, itemsActivated };
  });
}
