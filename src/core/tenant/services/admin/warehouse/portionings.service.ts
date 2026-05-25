import { eq, desc, and } from 'drizzle-orm';
import {
  portionings,
  portioningLines,
  items,
  wasteLog,
} from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';
import { toNum, roundQty, roundMoney, weightedAveragePrice } from './shared/numbers';
import { writeAuditLog } from './shared/audit.service';
import { applyStockEntry, applyStockExit } from './shared/stock-movement.service';
import type { AuditActor } from './types';

async function getPortioningWithLines(id: number) {
  const db = getTenantDb();
  const [doc] = await db.select().from(portionings).where(eq(portionings.id, id));
  if (!doc) return null;
  const lines = await db.select().from(portioningLines).where(eq(portioningLines.portioningId, id));
  return { ...doc, lines };
}

export async function listPortionings(filters?: { status?: string; areaId?: number }) {
  const db = getTenantDb();
  const conditions = [];
  if (filters?.status) conditions.push(eq(portionings.status, filters.status as 'draft' | 'processed' | 'voided'));
  if (filters?.areaId) conditions.push(eq(portionings.areaId, filters.areaId));
  const q = db.select().from(portionings).orderBy(desc(portionings.createdAt));
  if (conditions.length) return q.where(and(...conditions));
  return q;
}

export async function getPortioningById(id: number) {
  return getPortioningWithLines(id);
}

export async function createPortioning(
  header: {
    areaId: number;
    sourceItemId: number;
    inputQty: number;
    createdBy?: string;
  },
  lines: { targetItemId: number; equivalent: number; portionCount: number; unitPrice?: number }[],
  actor?: AuditActor
) {
  const db = getTenantDb();

  const [source] = await db.select().from(items).where(eq(items.id, header.sourceItemId));
  if (!source?.portionable) {
    throw new Error('El artículo origen no está marcado como porcionable');
  }

  return db.transaction(async (tx) => {
    const outputQty = lines.reduce((s, l) => s + l.portionCount, 0);
    const waste = roundQty(header.inputQty - outputQty);
    const wastePct = header.inputQty > 0 ? roundMoney((waste / header.inputQty) * 100, 2) : 0;

    const [doc] = await tx
      .insert(portionings)
      .values({
        areaId: header.areaId,
        sourceItemId: header.sourceItemId,
        inputQty: String(header.inputQty),
        outputQty: String(outputQty),
        waste: String(waste),
        wastePct: String(wastePct),
        status: 'draft',
        createdBy: header.createdBy,
      })
      .returning();

    if (lines.length) {
      await tx.insert(portioningLines).values(
        lines.map((l) => ({
          portioningId: doc.id,
          targetItemId: l.targetItemId,
          equivalent: String(l.equivalent),
          portionCount: String(l.portionCount),
          unitPrice: l.unitPrice != null ? String(l.unitPrice) : null,
        }))
      );
    }

    return getPortioningWithLines(doc.id);
  });
}

export async function voidPortioning(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const doc = await getPortioningWithLines(id);
  if (!doc) throw new Error('Porcionamiento no encontrado');
  if (doc.status === 'voided') throw new Error('El porcionamiento ya está anulado');
  if (doc.status === 'processed') throw new Error('No se puede anular un porcionamiento ya procesado');

  const [voided] = await db
    .update(portionings)
    .set({ status: 'voided' })
    .where(eq(portionings.id, id))
    .returning();

  await writeAuditLog({
    tableName: 'portionings',
    operation: 'VOID',
    recordId: id,
    beforeData: doc,
    afterData: voided,
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'porcionamientos',
    description: `Anuló porcionamiento PC-${id}`,
    ipAddress: actor?.ip,
  });

  return voided;
}

export async function processPortioning(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const doc = await getPortioningWithLines(id);
  if (!doc) throw new Error('Porcionamiento no encontrado');
  if (doc.status !== 'draft') throw new Error('El porcionamiento ya fue procesado');

  const docNumber = `PC-${id}`;

  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(items).where(eq(items.id, doc.sourceItemId));
    const inputQty = toNum(doc.inputQty);
    const sourcePrice = toNum(source?.avgPrice);

    await applyStockExit(
      {
        itemId: doc.sourceItemId,
        areaId: doc.areaId,
        qty: inputQty,
        unitPrice: sourcePrice,
        documentType: 'porcionamiento',
        documentNumber: docNumber,
        originDest: 'Porcionamiento origen',
      },
      tx
    );

    for (const line of doc.lines) {
      const qty = toNum(line.portionCount);
      const linePrice = toNum(line.unitPrice) || sourcePrice;

      await applyStockEntry(
        {
          itemId: line.targetItemId,
          areaId: doc.areaId,
          qty,
          unitPrice: linePrice,
          documentType: 'porcionamiento',
          documentNumber: docNumber,
          originDest: `Derivado de artículo ${doc.sourceItemId}`,
        },
        tx
      );

      const [target] = await tx.select().from(items).where(eq(items.id, line.targetItemId));
      const newAvg = weightedAveragePrice(
        toNum(target?.currentStock),
        toNum(target?.avgPrice),
        qty,
        linePrice
      );
      await tx.update(items).set({ avgPrice: String(newAvg), updatedAt: new Date() }).where(eq(items.id, line.targetItemId));
    }

    const waste = toNum(doc.waste);
    if (waste > 0 && source) {
      await tx.insert(wasteLog).values({
        portioningId: id,
        itemId: doc.sourceItemId,
        areaId: doc.areaId,
        familyId: source.familyId,
        date: new Date().toISOString().slice(0, 10),
        usedQty: String(inputQty),
        waste: String(waste),
        wasteValue: String(roundMoney(waste * sourcePrice)),
        wastePct: doc.wastePct,
        unit: source.ledgerUnit,
      });
    }

    const [processed] = await tx
      .update(portionings)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(portionings.id, id))
      .returning();

    await writeAuditLog(
      {
        tableName: 'portionings',
        operation: 'PROCESS',
        recordId: id,
        beforeData: doc,
        afterData: processed,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'porcionamientos',
        description: `Porcionó artículo ${doc.sourceItemId} — Merma: ${doc.wastePct}%`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getPortioningWithLines(id);
  });
}
