import { eq } from 'drizzle-orm';
import { categories, productKitchenStations } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';

type Db = ReturnType<typeof getTenantDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// Un producto sin subcategoría (o con una subcategoría sin área) no tiene estación de cocina:
// la comanda cae en "Cocina General" y sale por la primera impresora de la sucursal (a veces la
// de comprobantes), así que en cocina no llega. Por eso todo producto debe quedar en una
// subcategoría con área de impresión, propia o heredada de su categoría, o con un área propia.

export const MISSING_SUBCATEGORY_MESSAGE =
  'Selecciona la subcategoría del producto: define en qué área (cocina, barra…) se imprime su comanda';

/**
 * Lanza un error si con `categoryId` el producto no tendría área de impresión.
 * `hasOwnArea`: el producto ya tiene (o tendrá) áreas propias (product_kitchen_stations).
 */
export async function assertProductPrintArea(
  db: Db | Tx,
  categoryId: number | null | undefined,
  hasOwnArea = false,
): Promise<void> {
  if (!categoryId) throw new Error(MISSING_SUBCATEGORY_MESSAGE);

  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!category) throw new Error('La subcategoría seleccionada no existe');
  if (!category.parentId) {
    throw new Error(`"${category.name}" es una categoría principal: elige una de sus subcategorías`);
  }
  if (hasOwnArea || category.kitchenStationCode) return;

  const [parent] = await db
    .select({ name: categories.name, kitchenStationCode: categories.kitchenStationCode })
    .from(categories)
    .where(eq(categories.id, category.parentId))
    .limit(1);
  if (parent?.kitchenStationCode) return;

  throw new Error(
    `La subcategoría "${category.name}" no tiene área de impresión (ni su categoría "${parent?.name ?? ''}"). ` +
    'Asígnale un área en Categorías (o, al importar, indica la columna Área) para que sus comandas se impriman en cocina o barra',
  );
}

/** El producto tiene áreas propias asignadas (product_kitchen_stations). */
export async function productHasOwnArea(db: Db | Tx, productId: number): Promise<boolean> {
  const [row] = await db
    .select({ productId: productKitchenStations.productId })
    .from(productKitchenStations)
    .where(eq(productKitchenStations.productId, productId))
    .limit(1);
  return !!row;
}
