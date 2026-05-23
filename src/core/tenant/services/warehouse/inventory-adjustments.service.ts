import { eq, desc, and } from 'drizzle-orm';
import {
  inventoryAdjustments,
  adjustmentLines,
  stockSnapshot,
  items,
} from '../../../../db/tenant/schema';
import { getTenantDb } from '../../../../utils/tenant-context';
import { toNum, roundQty, roundMoney } from './shared/numbers';
import { writeAuditLog } from './shared/audit.service';
import {
  applyStockEntry,
  applyStockExit,
  assertNoDraftMovements,
} from './shared/stock-movement.service';
import type { AuditActor } from './types';

async function getAdjustmentWithLines(id: number) {
  const db = getTenantDb();
  const [adj] = await db.select().from(inventoryAdjustments).where(eq(inventoryAdjustments.id, id));
  if (!adj) return null;
  const lines = await db.select().from(adjustmentLines).where(eq(adjustmentLines.adjustmentId, id));
  return { ...adj, lines };
}

export async function listInventoryAdjustments(filters?: { status?: string; areaId?: number }) {
  const db = getTenantDb();
  let q = db.select().from(inventoryAdjustments).orderBy(desc(inventoryAdjustments.createdAt));
  if (filters?.status) {
    q = q.where(eq(inventoryAdjustments.status, filters.status as 'open' | 'closed')) as typeof q;
  }
  if (filters?.areaId) {
    q = q.where(eq(inventoryAdjustments.areaId, filters.areaId)) as typeof q;
  }
  return q;
}

export async function getInventoryAdjustmentById(id: number) {
  return getAdjustmentWithLines(id);
}

export async function openInventoryAdjustment(
  params: { areaId: number; code: string; createdBy?: string },
  actor?: AuditActor
) {
  const db = getTenantDb();
  await assertNoDraftMovements(db, params.areaId);

  const snapshots = await db
    .select()
    .from(stockSnapshot)
    .where(eq(stockSnapshot.areaId, params.areaId));

  return db.transaction(async (tx) => {
    const [adj] = await tx
      .insert(inventoryAdjustments)
      .values({
        code: params.code,
        areaId: params.areaId,
        status: 'open',
        createdBy: params.createdBy,
      })
      .returning();

    if (snapshots.length) {
      await tx.insert(adjustmentLines).values(
        snapshots.map((s) => ({
          adjustmentId: adj.id,
          itemId: s.itemId,
          closingStock: s.currentStock,
          finalStock: s.currentStock,
          adjustment: '0',
          avgPrice: s.avgPrice,
          adjustmentValue: '0',
        }))
      );
    }

    await writeAuditLog(
      {
        tableName: 'inventory_adjustments',
        operation: 'INSERT',
        recordId: adj.id,
        afterData: adj,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'ajuste_inventarios',
        description: `Abrió ajuste ${params.code} — Área ${params.areaId}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getAdjustmentWithLines(adj.id);
  });
}

export async function updateAdjustmentLines(
  id: number,
  lines: { id: number; finalStock: number }[]
) {
  const db = getTenantDb();
  const adj = await getAdjustmentWithLines(id);
  if (!adj) throw new Error('Ajuste no encontrado');
  if (adj.status !== 'open') throw new Error('El ajuste ya está cerrado');

  for (const line of lines) {
    const existing = adj.lines.find((l) => l.id === line.id);
    if (!existing) continue;
    const closing = toNum(existing.closingStock);
    const adjustment = roundQty(line.finalStock - closing);
    const avg = toNum(existing.avgPrice);
    await db
      .update(adjustmentLines)
      .set({
        finalStock: String(line.finalStock),
        adjustment: String(adjustment),
        adjustmentValue: String(roundMoney(adjustment * avg)),
      })
      .where(eq(adjustmentLines.id, line.id));
  }

  return getAdjustmentWithLines(id);
}

export async function closeInventoryAdjustment(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const adj = await getAdjustmentWithLines(id);
  if (!adj) throw new Error('Ajuste no encontrado');
  if (adj.status !== 'open') throw new Error('El ajuste ya está cerrado');

  const docNumber = adj.code;

  return db.transaction(async (tx) => {
    for (const line of adj.lines) {
      const diff = toNum(line.adjustment);
      if (diff === 0) continue;

      const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
      const price = toNum(line.avgPrice) || toNum(item?.avgPrice);

      if (diff > 0) {
        await applyStockEntry(
          {
            itemId: line.itemId,
            areaId: adj.areaId,
            qty: diff,
            unitPrice: price,
            documentType: 'ajuste_inventario',
            documentNumber: docNumber,
            originDest: 'Cierre de inventario',
          },
          tx
        );
      } else {
        await applyStockExit(
          {
            itemId: line.itemId,
            areaId: adj.areaId,
            qty: Math.abs(diff),
            unitPrice: price,
            documentType: 'ajuste_inventario',
            documentNumber: docNumber,
            originDest: 'Cierre de inventario',
          },
          tx
        );
      }
    }

    const [closed] = await tx
      .update(inventoryAdjustments)
      .set({ status: 'closed', processedAt: new Date() })
      .where(eq(inventoryAdjustments.id, id))
      .returning();

    await writeAuditLog(
      {
        tableName: 'inventory_adjustments',
        operation: 'ADJUST',
        recordId: id,
        beforeData: adj,
        afterData: closed,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'ajuste_inventarios',
        description: `Cerró ajuste ${adj.code} — Área ${adj.areaId}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getAdjustmentWithLines(id);
  });
}
