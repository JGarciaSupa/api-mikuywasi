import { eq, asc, and, desc } from 'drizzle-orm';
import { recipes, recipeLines, products, items, branchRecipeAreas } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum, roundMoney } from './shared/numbers';

async function getRecipeWithLines(id: number) {
  const db = getTenantDb();
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
  if (!recipe) return null;

  let bra = null;
  if (recipe.productId) {
    [bra] = await db.select().from(branchRecipeAreas).where(
      and(
        eq(branchRecipeAreas.branchId, 1),
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

export async function listRecipes(productId?: number) {
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
      eq(branchRecipeAreas.branchId, 1)
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

export async function getRecipeById(id: number) {
  const recipe = await getRecipeWithLines(id);
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

export async function getRecipeByProductId(productId: number) {
  const db = getTenantDb();
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.productId, productId), eq(recipes.isActive, true)))
    .limit(1);
  if (!recipe) return null;
  return getRecipeById(recipe.id);
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
    const { productionAreaId, ...recipeData } = header;

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
          eq(branchRecipeAreas.branchId, 1),
          eq(branchRecipeAreas.productId, recipeData.productId)
        )
      );
      await tx.insert(branchRecipeAreas).values({
        branchId: 1,
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
    }

    return getRecipeById(recipe.id);
  });
}

export async function updateRecipe(
  id: number,
  header: Partial<typeof recipes.$inferInsert> & { productionAreaId?: number | null },
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
    const { productionAreaId, ...recipeData } = header;
    
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
        updatedAt: new Date() 
      })
      .where(eq(recipes.id, id));

    if (productionAreaId && mergedProductId) {
      await tx.delete(branchRecipeAreas).where(
        and(
          eq(branchRecipeAreas.branchId, 1),
          eq(branchRecipeAreas.productId, mergedProductId)
        )
      );
      await tx.insert(branchRecipeAreas).values({
        branchId: 1,
        productId: mergedProductId,
        areaId: productionAreaId,
      });
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
      }
    }

    return getRecipeById(id);
  });
}
