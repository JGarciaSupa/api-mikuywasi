import { eq, sql, getTableColumns } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { items, measurementUnits } from '@/db/tenant/schema';
import type { TenantDb } from '@/utils/tenant-context';

export function itemSelectShape() {
  const lu = alias(measurementUnits, 'lu');
  const cu = alias(measurementUnits, 'cu');
  return {
    cols: {
      ...getTableColumns(items),
      ledgerUnit: sql<string>`COALESCE(${lu.code}, '')`.as('ledger_unit'),
      costUnit: sql<string>`COALESCE(${cu.code}, '')`.as('cost_unit'),
      currentStock: sql<string>`COALESCE((
        SELECT SUM(ss.current_stock)::text
        FROM stock_snapshot ss
        WHERE ss.item_id = ${items.id}
      ), '0')`.as('current_stock'),
    },
    lu,
    cu,
  };
}

export async function fetchItemWithUnits(db: TenantDb, itemId: number) {
  const { cols, lu, cu } = itemSelectShape();
  const [item] = await db
    .select(cols)
    .from(items)
    .leftJoin(lu, eq(items.ledgerUnitId, lu.id))
    .leftJoin(cu, eq(items.costUnitId, cu.id))
    .where(eq(items.id, itemId));
  return item ?? null;
}
