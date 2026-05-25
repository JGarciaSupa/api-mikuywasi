import { eq, desc, and } from 'drizzle-orm';
import {
  stockTransfers,
  stockTransferLines,
  storageAreas,
  itemAreaAssignments,
  items,
} from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum } from './shared/numbers';
import { writeAuditLog } from './shared/audit.service';
import { applyStockEntry, applyStockExit } from './shared/stock-movement.service';
import type { AuditActor } from './types';

async function getTransferWithLines(id: number) {
  const db = getTenantDb();
  const [tr] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
  if (!tr) return null;
  const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
  return { ...tr, lines };
}

export async function listStockTransfers(filters?: { status?: string }) {
  const db = getTenantDb();
  const q = db.select().from(stockTransfers).orderBy(desc(stockTransfers.createdAt));
  if (filters?.status) {
    return q.where(eq(stockTransfers.status, filters.status as 'draft' | 'processed' | 'voided'));
  }
  return q;
}

export async function getStockTransferById(id: number) {
  return getTransferWithLines(id);
}

export async function createStockTransfer(
  header: {
    sourceAreaId: number;
    targetAreaId: number;
    requisitionId?: number;
    reference?: string;
    createdBy?: string;
  },
  lines: { itemId: number; ledgerQty: number; costQty?: number }[],
  actor?: AuditActor
) {
  const db = getTenantDb();
  if (header.sourceAreaId === header.targetAreaId) {
    throw new Error('El área origen y destino deben ser diferentes');
  }

  return db.transaction(async (tx) => {
    const [tr] = await tx.insert(stockTransfers).values({ ...header, status: 'draft' }).returning();

    if (lines.length) {
      await tx.insert(stockTransferLines).values(
        lines.map((l) => ({
          transferId: tr.id,
          itemId: l.itemId,
          ledgerQty: String(l.ledgerQty),
          costQty: l.costQty != null ? String(l.costQty) : null,
        }))
      );
    }

    await writeAuditLog(
      {
        tableName: 'stock_transfers',
        operation: 'INSERT',
        recordId: tr.id,
        afterData: tr,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'transferencias',
        description: `Creó transferencia TR-${tr.id}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getTransferWithLines(tr.id);
  });
}

async function assertItemInBothAreas(tx: ReturnType<typeof getTenantDb>, itemId: number, sourceId: number, targetId: number) {
  const [src] = await tx
    .select()
    .from(itemAreaAssignments)
    .where(and(eq(itemAreaAssignments.itemId, itemId), eq(itemAreaAssignments.areaId, sourceId)));
  const [tgt] = await tx
    .select()
    .from(itemAreaAssignments)
    .where(and(eq(itemAreaAssignments.itemId, itemId), eq(itemAreaAssignments.areaId, targetId)));
  if (!src || !tgt) {
    throw new Error(`El artículo ${itemId} debe estar asignado al área origen y destino`);
  }
}

export async function voidStockTransfer(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const tr = await getTransferWithLines(id);
  if (!tr) throw new Error('Transferencia no encontrada');
  if (tr.status === 'voided') throw new Error('La transferencia ya está anulada');
  if (tr.status === 'processed') throw new Error('No se puede anular una transferencia ya procesada');

  const [voided] = await db
    .update(stockTransfers)
    .set({ status: 'voided' })
    .where(eq(stockTransfers.id, id))
    .returning();

  await writeAuditLog({
    tableName: 'stock_transfers',
    operation: 'VOID',
    recordId: id,
    beforeData: tr,
    afterData: voided,
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'transferencias',
    description: `Anuló transferencia TR-${id}`,
    ipAddress: actor?.ip,
  });

  return voided;
}

export async function processStockTransfer(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const tr = await getTransferWithLines(id);
  if (!tr) throw new Error('Transferencia no encontrada');
  if (tr.status !== 'draft') throw new Error('La transferencia ya fue procesada');

  const docNumber = `TR-${id}`;

  return db.transaction(async (tx) => {
    for (const line of tr.lines) {
      const qty = toNum(line.ledgerQty);
      if (qty <= 0) continue;

      await assertItemInBothAreas(tx, line.itemId, tr.sourceAreaId, tr.targetAreaId);

      const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
      const price = toNum(item?.avgPrice);

      await applyStockExit(
        {
          itemId: line.itemId,
          areaId: tr.sourceAreaId,
          qty,
          unitPrice: price,
          documentType: 'transferencia',
          documentNumber: docNumber,
          originDest: `→ Área ${tr.targetAreaId}`,
        },
        tx
      );

      await applyStockEntry(
        {
          itemId: line.itemId,
          areaId: tr.targetAreaId,
          qty,
          unitPrice: price,
          documentType: 'transferencia',
          documentNumber: docNumber,
          originDest: `← Área ${tr.sourceAreaId}`,
        },
        tx
      );
    }

    const [processed] = await tx
      .update(stockTransfers)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(stockTransfers.id, id))
      .returning();

    const [source] = await tx.select().from(storageAreas).where(eq(storageAreas.id, tr.sourceAreaId));
    const [target] = await tx.select().from(storageAreas).where(eq(storageAreas.id, tr.targetAreaId));

    await writeAuditLog(
      {
        tableName: 'stock_transfers',
        operation: 'PROCESS',
        recordId: id,
        beforeData: tr,
        afterData: processed,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'transferencias',
        description: `Procesó TR-${id} — ${source?.name} → ${target?.name}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getTransferWithLines(id);
  });
}
