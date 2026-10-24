import { and, count, eq, inArray, isNull, or } from 'drizzle-orm';
import { branches, categories, kitchenStations, productKitchenStations, products, productSalesChannelPrices, salesChannels } from '@/db/tenant/schema';
import { normalizeTaxConfigList } from '@/core/tenant/services/shared/taxes.service';
import { getTenantDb, getTenantId } from '@/utils/tenant-context';
import { isInternalError } from '@/utils/errors';
import { deleteFromR2, getImageUrl, uploadToR2 } from '@/utils/r2';
import { masterDb } from '@/db';
import { tenants } from '@/db/master/schema';
import {
  productImportRowSchema,
  type ProductImportInput,
} from '@/core/tenant/validations/admin/warehouse/product-import.validation';
import { getMaxProductsForTenant } from './product-limit.service';
import { applyCategoryExtraGroups } from './extras.service';

// Mismo tope que createCategory (categories.service.ts) para categorías principales.
const MAX_ROOT_CATEGORIES = 50;

export type ProductImportRowStatus = 'created' | 'skipped' | 'failed';

export interface ProductImportRowResult {
  row: number;
  name: string;
  status: ProductImportRowStatus;
  productId?: number;
  message?: string;
  /** Áreas que no existían y se crearon al importar esta fila (sin impresora asignada). */
  createdAreas?: string[];
}

export interface ProductImportResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  /** null = sin límite */
  maxProducts: number | null;
  createdCategories: string[];
  createdAreas: string[];
  results: ProductImportRowResult[];
}

type CategoryRow = typeof categories.$inferSelect;
type StationRow = typeof kitchenStations.$inferSelect;

const normalizeKey = (value: string) => value.trim().toLowerCase();

// Columna Área: una o varias estaciones separadas por coma o "|".
const splitAreaNames = (value?: string) =>
  [...new Map((value ?? '').split(/[,|]/).map((v) => v.trim()).filter(Boolean).map((v) => [normalizeKey(v), v])).values()];

// Código de estación a partir del nombre, con el formato de createKitchenStationSchema
// (A-Z, 0-9, "-" y "_", máx. 30) y único en la sucursal.
function buildStationCode(name: string, usedCodes: Set<string>) {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'AREA';
  let code = base;
  for (let n = 2; usedCodes.has(code); n++) {
    const suffix = `-${n}`;
    code = `${base.slice(0, 30 - suffix.length)}${suffix}`;
  }
  return code;
}

/**
 * Importa productos en lote para una sucursal.
 *
 * - Cada fila se guarda en su propia transacción: una fila con error no deshace las demás.
 * - Los productos se crean igual que desde el modal del admin: precio base + un precio por
 *   cada canal activo de la sucursal (o global) con los impuestos de la sucursal según su
 *   `defaultActive`. Así el POS, la cocina y la facturación los tratan como uno creado a mano.
 * - Los productos con un nombre que ya existe en la sucursal (o repetido en el archivo) se omiten.
 * - Respeta el límite de productos del plan y el de 50 categorías principales.
 * - La columna Área enlaza el producto a estaciones de cocina de la sucursal (por nombre o
 *   código). Con `createMissingAreas` las que no existen se crean sin impresora y se
 *   devuelven en `createdAreas` (lote y fila) para revisarlas a mano.
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

  // Igual que el alta manual (ProductModal): un producto se asigna siempre a una subcategoría.
  if (input.defaultCategoryId) {
    const defaultCategory = branchCategories.find((cat) => cat.id === input.defaultCategoryId);
    if (!defaultCategory) throw new Error('La subcategoría por defecto no pertenece a la sucursal seleccionada');
    if (!defaultCategory.parentId) throw new Error('La categoría por defecto debe ser una subcategoría');
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

  // Áreas (estaciones de cocina) de la sucursal, por nombre y por código
  const branchStations = await db.select().from(kitchenStations).where(eq(kitchenStations.branchId, branch.id));
  const stationByKey = new Map<string, StationRow>();
  const stationCodes = new Set<string>();
  const indexStation = (station: StationRow) => {
    stationCodes.add(station.code);
    if (!stationByKey.has(normalizeKey(station.name))) stationByKey.set(normalizeKey(station.name), station);
    if (!stationByKey.has(normalizeKey(station.code))) stationByKey.set(normalizeKey(station.code), station);
  };
  branchStations.forEach(indexStation);

  const [rootCount] = await db.select({ count: count() }).from(categories).where(isNull(categories.parentId));
  let rootCategoriesTotal = Number(rootCount?.count ?? 0);

  const maxProducts = await getMaxProductsForTenant();
  const [productCount] = await db.select({ count: count() }).from(products);
  let productsTotal = Number(productCount?.count ?? 0);

  // ── Procesamiento fila a fila ───────────────────────────────────────────────
  const results: ProductImportRowResult[] = [];
  const createdCategories: string[] = [];
  const createdAreas: string[] = [];

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

    if (maxProducts !== null && productsTotal >= maxProducts) {
      results.push({ row: row.row, name: row.name, status: 'failed', message: `Se alcanzó el límite de ${maxProducts} productos de tu plan` });
      continue;
    }

    if (row.categoryName && !row.subcategoryName) {
      results.push({ row: row.row, name: row.name, status: 'failed', message: `Indique la subcategoría de "${row.categoryName}" (los productos se asignan a una subcategoría)` });
      continue;
    }

    try {
      const outcome = await db.transaction(async (tx) => {
        const newCategories: CategoryRow[] = [];
        const newStations: StationRow[] = [];

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
          categoryId: subcategory?.id ?? input.defaultCategoryId ?? null,
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
        }).returning({ id: products.id, categoryId: products.categoryId });

        await applyCategoryExtraGroups(tx, product.id, product.categoryId);

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

        // 4. Áreas de producción: se enlazan por código, igual que la asignación manual.
        // Un área que no existe se crea activa y sin impresora, para no perder la fila.
        const rowCodes = new Set(newStations.map((s) => s.code));
        const stationsToLink: StationRow[] = [];
        for (const areaName of splitAreaNames(row.areaName)) {
          let station = stationByKey.get(normalizeKey(areaName));
          if (!station) {
            if (!input.createMissingAreas) {
              throw new Error(`El área "${areaName}" no existe en la sucursal`);
            }
            if (areaName.length > 100) throw new Error(`El área "${areaName}" supera 100 caracteres`);
            const [created] = await tx.insert(kitchenStations).values({
              branchId: branch.id,
              name: areaName,
              code: buildStationCode(areaName, new Set([...stationCodes, ...rowCodes])),
              isActive: true,
            }).returning();
            station = created;
            newStations.push(created);
            rowCodes.add(created.code);
          }
          stationsToLink.push(station);
        }
        if (stationsToLink.length > 0) {
          await tx.insert(productKitchenStations)
            .values(stationsToLink.map((station) => ({ productId: product.id, stationCode: station.code })))
            .onConflictDoNothing();
        }

        return { productId: product.id, newCategories, newStations };
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
      for (const station of outcome.newStations) {
        indexStation(station);
        createdAreas.push(station.name);
      }
      existingNames.add(nameKey);
      importedNames.add(nameKey);
      productsTotal++;
      results.push({
        row: row.row,
        name: row.name,
        status: 'created',
        productId: outcome.productId,
        ...(outcome.newStations.length > 0 ? { createdAreas: outcome.newStations.map((s) => s.name) } : {}),
      });
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
    createdAreas,
    results,
  };
}

// ── Imagen de un producto importado ─────────────────────────────────────────

// Mismo tamaño máximo y carpeta que createProduct/updateProduct (products.service.ts).
const PRODUCT_IMAGE_MAX_SIZE = 500;
export const IMPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Asigna la imagen a un producto (pensado para el paso final de la importación).
 * Solo modifica la columna `image`: no aplica defaults ni toca precios, canales ni stock.
 * Reutiliza uploadToR2 (redimensiona a 500px y convierte a WebP) igual que el alta manual.
 */
export async function setProductImage(productId: number, file: File) {
  const db = getTenantDb();

  const [product] = await db
    .select({ id: products.id, image: products.image })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw new Error('Producto no encontrado');

  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, getTenantId()),
    columns: { slug: true },
  });
  const imageKey = await uploadToR2(file, `${tenant?.slug || 'general'}/productos`, PRODUCT_IMAGE_MAX_SIZE);

  try {
    await db.update(products).set({ image: imageKey, updatedAt: new Date() }).where(eq(products.id, productId));
  } catch (error) {
    // Si no se pudo guardar en BD, no dejar el archivo huérfano en R2
    await deleteFromR2(imageKey);
    throw error;
  }

  // La imagen anterior (si la había) se elimina solo después de guardar la nueva
  if (product.image) await deleteFromR2(product.image);

  return { productId, image: getImageUrl(imageKey) };
}
