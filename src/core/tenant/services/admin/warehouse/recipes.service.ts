import { eq, asc, and } from 'drizzle-orm';
import { recipes, recipeLines, products, items } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum, roundMoney } from './shared/numbers';

async function getRecipeWithLines(id: number) {
  const db = getTenantDb();
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
  if (!recipe) return null;
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
  return { ...recipe, lines };
}

export async function listRecipes(productId?: number) {
  const db = getTenantDb();
  let q = db
    .select({
      recipe: recipes,
      productName: products.name,
    })
    .from(recipes)
    .leftJoin(products, eq(recipes.productId, products.id))
    .orderBy(asc(recipes.name))
    .$dynamic();

  if (productId) {
    q = q.where(eq(recipes.productId, productId));
  }

  const results = await q;
  return results.map(row => ({
    ...row.recipe,
    productName: row.productName
  }));
}

export async function getRecipeById(id: number) {
  const recipe = await getRecipeWithLines(id);
  if (!recipe) return null;

  const cost = recipe.lines.reduce((sum, row) => {
    const qty = toNum(row.line.qty);
    const price = toNum(row.itemAvgPrice);
    return sum + qty * price;
  }, 0);

  const [product] = await getTenantDb()
    .select()
    .from(products)
    .where(eq(products.id, recipe.productId));

  const salePrice = toNum(product?.price);
  const servings = toNum(recipe.servings) || 1;
  const costPerServing = roundMoney(cost / servings);

  return {
    ...recipe,
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
    productId: number;
    name: string;
    servings?: string;
    yieldPct?: string;
    isActive?: boolean;
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
    const [recipe] = await tx.insert(recipes).values(header).returning();

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
  header: Partial<typeof recipes.$inferInsert>,
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
    await tx
      .update(recipes)
      .set({ ...header, updatedAt: new Date() })
      .where(eq(recipes.id, id));

    if (lines) {
      await tx.delete(recipeLines).where(eq(recipeLines.recipeId, id));
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

    return getRecipeById(id);
  });
}
