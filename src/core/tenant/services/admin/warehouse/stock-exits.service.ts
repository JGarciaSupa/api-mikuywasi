import { eq, desc, and } from 'drizzle-orm';
import { stockExits, stockExitLines, items } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum } from './shared/numbers';
import { writeAuditLog } from './shared/audit.service';
import { applyStockExit } from './shared/stock-movement.service';
import type { AuditActor } from './types';

async function getExitWithLines(id: number) {
  const db = getTenantDb();
  const [doc] = await db.select().from(stockExits).where(eq(stockExits.id, id));
  if (!doc) return null;
  const lines = await db.select().from(stockExitLines).where(eq(stockExitLines.exitId, id));
  return { ...doc, lines };
}

export async function listStockExits(filters?: { status?: string; areaId?: number }) {
  const db = getTenantDb();
  const conditions = [];
  if (filters?.status) conditions.push(eq(stockExits.status, filters.status as 'draft' | 'processed' | 'voided'));
  if (filters?.areaId) conditions.push(eq(stockExits.areaId, filters.areaId));

  const q = db.select().from(stockExits).orderBy(desc(stockExits.createdAt));
  if (conditions.length) return q.where(and(...conditions));
  return q;
}

export async function getStockExitById(id: number) {
  return getExitWithLines(id);
}

export async function createStockExit(
  header: Omit<typeof stockExits.$inferInsert, 'id' | 'status' | 'createdAt' | 'processedAt'>,
  lines: { itemId: number; exitQty: number; costQty?: number; costValue?: number }[],
  actor?: AuditActor
) {
  const db = getTenantDb();

  return db.transaction(async (tx) => {
    const [doc] = await tx.insert(stockExits).values({ ...header, status: 'draft' }).returning();

    if (lines.length) {
      await tx.insert(stockExitLines).values(
        lines.map((l) => ({
          exitId: doc.id,
          itemId: l.itemId,
          exitQty: String(l.exitQty),
          costQty: l.costQty != null ? String(l.costQty) : null,
          costValue: l.costValue != null ? String(l.costValue) : null,
        }))
      );
    }

    await writeAuditLog(
      {
        tableName: 'stock_exits',
        operation: 'INSERT',
        recordId: doc.id,
        afterData: doc,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'salidas',
        description: `Creó salida ${header.exitType} — Área ${header.areaId}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getExitWithLines(doc.id);
  });
}

export async function voidStockExit(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const doc = await getExitWithLines(id);
  if (!doc) throw new Error('Salida no encontrada');
  if (doc.status === 'voided') throw new Error('La salida ya está anulada');
  if (doc.status === 'processed') throw new Error('No se puede anular una salida ya procesada');

  const [voided] = await db
    .update(stockExits)
    .set({ status: 'voided' })
    .where(eq(stockExits.id, id))
    .returning();

  await writeAuditLog({
    tableName: 'stock_exits',
    operation: 'VOID',
    recordId: id,
    beforeData: doc,
    afterData: voided,
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'salidas',
    description: `Anuló salida SX-${id}`,
    ipAddress: actor?.ip,
  });

  return voided;
}

export async function processStockExit(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const doc = await getExitWithLines(id);
  if (!doc) throw new Error('Salida no encontrada');
  if (doc.status !== 'draft') throw new Error('La salida ya fue procesada');

  const docNumber = `SX-${id}`;

  return db.transaction(async (tx) => {
    for (const line of doc.lines) {
      const qty = toNum(line.exitQty);
      if (qty <= 0) continue;

      const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));

      await applyStockExit(
        {
          itemId: line.itemId,
          areaId: doc.areaId,
          qty,
          unitPrice: toNum(line.costValue) / (qty || 1) || toNum(item?.avgPrice),
          documentType: 'salida',
          documentNumber: docNumber,
          originDest: doc.concept ?? doc.exitType,
        },
        tx
      );
    }

    const [processed] = await tx
      .update(stockExits)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(stockExits.id, id))
      .returning();

    await writeAuditLog(
      {
        tableName: 'stock_exits',
        operation: 'PROCESS',
        recordId: id,
        beforeData: doc,
        afterData: processed,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'salidas',
        description: `Procesó salida ${doc.exitType} — Área ${doc.areaId}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getExitWithLines(id);
  });
}
