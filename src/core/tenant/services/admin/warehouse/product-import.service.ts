import { and, count, eq, inArray, isNull, or } from 'drizzle-orm';
import { branches, categories, products, productSalesChannelPrices, salesChannels } from '@/db/tenant/schema';
import { normalizeTaxConfigList } from '@/core/tenant/services/shared/taxes.service';
import { getTenantDb } from '@/utils/tenant-context';
import { isInternalError } from '@/utils/errors';
import {
  productImportRowSchema,
  type ProductImportInput,
} from '@/core/tenant/validations/admin/warehouse/product-import.validation';
import { getMaxProductsForTenant } from './product-limit.service';

// Mismo tope que createCategory (categories.service.ts) para categorías principales.
const MAX_ROOT_CATEGORIES = 50;

export type ProductImportRowStatus = 'created' | 'skipped' | 'failed';

export interface ProductImportRowResult {
  row: number;
  name: string;
  status: ProductImportRowStatus;
  productId?: number;
  message?: string;
}

export interface ProductImportResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  maxProducts: number;
  createdCategories: string[];
  results: ProductImportRowResult[];
}

type CategoryRow = typeof categories.$inferSelect;

const normalizeKey = (value: string) => value.trim().toLowerCase();

/**
 * Importa productos en lote para una sucursal.
 *
 * - Cada fila se guarda en su propia transacción: una fila con error no deshace las demás.
 * - Los productos se crean igual que desde el modal del admin: precio base + un precio por
 *   cada canal activo de la sucursal (o global) con los impuestos de la sucursal según su
 *   `defaultActive`. Así el POS, la cocina y la facturación los tratan como uno creado a mano.
 * - Los productos con un nombre que ya existe en la sucursal (o repetido en el archivo) se omiten.
 * - Respeta el límite de productos del plan y el de 50 categorías principales.
 */
export async function importProducts(input: ProductImportInput): Promise<ProductImportResult> {
  const db = getTenantDb();

  const [branch] = await db.select().from(branches).where(eq(branches.id, input.branchId)).limit(1);
  if (!branch) throw new Error('Sucursal no encontrada');

  // ── Catálogos de la sucursal (se cargan una sola vez por lote) ──────────────
  const channels = await db
    .select({ id: salesChannels.id })
    .from(salesChannels)
    .where(and(
      or(eq(salesChannels.branchId, branch.id), isNull(salesChannels.branchId)),
      eq(salesChannels.isActive, true),
    ));

  const branchTaxes = normalizeTaxConfigList(branch.taxes ?? undefined).filter((tax) => tax.isActive);
  const channelTaxes = branchTaxes.map((tax) => ({
    key: tax.key,
    label: tax.label,
    rate: tax.rate,
    defaultActive: tax.defaultActive ?? false,
    isActive: tax.defaultActive ?? false,
  }));

  const branchCategories = await db
    .select()
    .from(categories)
    .where(or(eq(categories.branchId, branch.id), isNull(categories.branchId)));

  const rootByName = new Map<string, CategoryRow>();
  const subByKey = new Map<string, CategoryRow>();
  const categoryIds = new Set<number>();
  for (const cat of branchCategories) {
    categoryIds.add(cat.id);
    if (cat.parentId) subByKey.set(`${cat.parentId}:${normalizeKey(cat.name)}`, cat);
    else if (!rootByName.has(normalizeKey(cat.name))) rootByName.set(normalizeKey(cat.name), cat);
  }

  if (input.defaultCategoryId && !categoryIds.has(input.defaultCategoryId)) {
    throw new Error('La categoría por defecto no pertenece a la sucursal seleccionada');
  }

  // Nombres ya visibles en la sucursal: productos de sus categorías o sin categoría.
  const existingProducts = await db
    .select({ name: products.name })
    .from(products)
    .where(categoryIds.size > 0
      ? or(inArray(products.categoryId, [...categoryIds]), isNull(products.categoryId))
      : isNull(products.categoryId));
  const existingNames = new Set(existingProducts.map((p) => normalizeKey(p.name)));
  const importedNames = new Set<string>();

  const [rootCount] = await db.select({ count: count() }).from(categories).where(isNull(categories.parentId));
  let rootCategoriesTotal = Number(rootCount?.count ?? 0);

  const maxProducts = await getMaxProductsForTenant();
  const [productCount] = await db.select({ count: count() }).from(products);
  let productsTotal = Number(productCount?.count ?? 0);

  // ── Procesamiento fila a fila ───────────────────────────────────────────────
  const results: ProductImportRowResult[] = [];
  const createdCategories: string[] = [];

  for (let idx = 0; idx < input.items.length; idx++) {
    const rawRow = input.items[idx];
    const fallbackRow = Number(rawRow.row) || idx + 1;
    const fallbackName = typeof rawRow.name === 'string' ? rawRow.name.trim() : '';

    const parsed = productImportRowSchema.safeParse({ ...rawRow, row: fallbackRow });
    if (!parsed.success) {
      results.push({ row: fallbackRow, name: fallbackName, status: 'failed', message: parsed.error.issues[0]?.message ?? 'Fila inválida' });
      continue;
    }

    const row = parsed.data;
    const nameKey = normalizeKey(row.name);

    if (existingNames.has(nameKey)) {
      const message = importedNames.has(nameKey)
        ? 'Nombre repetido en el archivo'
        : 'Ya existe un producto con este nombre en la sucursal';
      results.push({ row: row.row, name: row.name, status: 'skipped', message });
      continue;
    }

    if (productsTotal >= maxProducts) {
      results.push({ row: row.row, name: row.name, status: 'failed', message: `Se alcanzó el límite de ${maxProducts} productos de tu plan` });
      continue;
    }

    try {
      const outcome = await db.transaction(async (tx) => {
        const newCategories: CategoryRow[] = [];

        // 1. Resolver categoría (y subcategoría) por nombre dentro de la sucursal
        let category: CategoryRow | undefined;
        if (row.categoryName) {
          category = rootByName.get(normalizeKey(row.categoryName));
          if (!category) {
            if (!input.createMissingCategories) {
              throw new Error(`La categoría "${row.categoryName}" no existe en la sucursal`);
            }
            if (rootCategoriesTotal >= MAX_ROOT_CATEGORIES) {
              throw new Error(`No se puede crear la categoría "${row.categoryName}": máximo ${MAX_ROOT_CATEGORIES} categorías`);
            }
            const [created] = await tx.insert(categories).values({
              name: row.categoryName,
              branchId: branch.id,
            }).returning();
            category = created;
            newCategories.push(created);
          }
        }

        let subcategory: CategoryRow | undefined;
        if (row.subcategoryName) {
          if (!category) throw new Error('Para usar una subcategoría indique también la categoría');
          subcategory = subByKey.get(`${category.id}:${normalizeKey(row.subcategoryName)}`);
          if (!subcategory) {
            if (!input.createMissingCategories) {
              throw new Error(`La subcategoría "${row.subcategoryName}" no existe en "${category.name}"`);
            }
            const [created] = await tx.insert(categories).values({
              name: row.subcategoryName,
              parentId: category.id,
              branchId: branch.id,
            }).returning();
            subcategory = created;
            newCategories.push(created);
          }
        }

        // 2. Crear el producto
        const [product] = await tx.insert(products).values({
          categoryId: subcategory?.id ?? category?.id ?? input.defaultCategoryId ?? null,
          name: row.name,
          shortName: row.shortName ?? null,
          description: row.description ?? null,
          price: row.price,
          discountPrice: row.discountPrice ?? null,
          packagingFee: row.packagingFee ?? '0.00',
          order: row.order ?? 0,
          isActive: row.isActive ?? input.activate,
          allowSellWithoutStock: row.allowSellWithoutStock ?? false,
          stock: row.stock ?? null,
        }).returning({ id: products.id });

        // 3. Precio por canal, igual que el modal del admin
        if (channels.length > 0) {
          await tx.insert(productSalesChannelPrices).values(
            channels.map((channel) => ({
              productId: product.id,
              salesChannelId: channel.id,
              price: row.price,
              discountPrice: row.discountPrice ?? null,
              taxes: channelTaxes,
              isActive: true,
            }))
          );
        }

        return { productId: product.id, newCategories };
      });

      // Solo tras confirmar la transacción se actualizan las cachés del lote
      for (const cat of outcome.newCategories) {
        categoryIds.add(cat.id);
        createdCategories.push(cat.name);
        if (cat.parentId) {
          subByKey.set(`${cat.parentId}:${normalizeKey(cat.name)}`, cat);
        } else {
          rootByName.set(normalizeKey(cat.name), cat);
          rootCategoriesTotal++;
        }
      }
      existingNames.add(nameKey);
      importedNames.add(nameKey);
      productsTotal++;
      results.push({ row: row.row, name: row.name, status: 'created', productId: outcome.productId });
    } catch (error) {
      const message = !isInternalError(error) && error instanceof Error && error.message
        ? error.message
        : 'No se pudo guardar la fila';
      if (isInternalError(error)) console.error('[importProducts] fila', row.row, error);
      results.push({ row: row.row, name: row.name, status: 'failed', message });
    }
  }

  return {
    total: results.length,
    created: results.filter((r) => r.status === 'created').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    maxProducts,
    createdCategories,
    results,
  };
}
