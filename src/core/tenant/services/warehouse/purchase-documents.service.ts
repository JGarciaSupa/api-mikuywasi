import { eq, desc, and } from 'drizzle-orm';
import {
  purchaseDocuments,
  purchaseDocumentLines,
  suppliers,
  storageAreas,
} from '../../../../db/tenant/schema';
import { getTenantDb } from '../../../../utils/tenant-context';
import { toNum, roundMoney } from './shared/numbers';
import { writeAuditLog } from './shared/audit.service';
import {
  applyStockEntry,
  createBatchFromPurchase,
  recordPurchasePriceHistory,
} from './shared/stock-movement.service';

import type { AuditActor } from './types';
export type { AuditActor };

async function getDocumentWithLines(id: number) {
  const db = getTenantDb();
  const [doc] = await db.select().from(purchaseDocuments).where(eq(purchaseDocuments.id, id));
  if (!doc) return null;
  const lines = await db
    .select()
    .from(purchaseDocumentLines)
    .where(eq(purchaseDocumentLines.documentId, id));
  return { ...doc, lines };
}

export async function listPurchaseDocuments(filters?: { status?: string; supplierId?: number }) {
  const db = getTenantDb();
  const conditions = [];
  if (filters?.status) conditions.push(eq(purchaseDocuments.status, filters.status as 'draft' | 'processed' | 'voided'));
  if (filters?.supplierId) conditions.push(eq(purchaseDocuments.supplierId, filters.supplierId));

  const q = db
    .select({
      document: purchaseDocuments,
      supplierName: suppliers.legalName,
      areaName: storageAreas.name,
    })
    .from(purchaseDocuments)
    .leftJoin(suppliers, eq(purchaseDocuments.supplierId, suppliers.id))
    .leftJoin(storageAreas, eq(purchaseDocuments.areaId, storageAreas.id))
    .orderBy(desc(purchaseDocuments.createdAt));

  if (conditions.length) {
    return q.where(and(...conditions));
  }
  return q;
}

export async function getPurchaseDocumentById(id: number) {
  return getDocumentWithLines(id);
}

export async function createPurchaseDocument(
  header: Omit<typeof purchaseDocuments.$inferInsert, 'id' | 'status' | 'createdAt' | 'processedAt'>,
  lines: Omit<typeof purchaseDocumentLines.$inferInsert, 'id' | 'documentId'>[],
  actor?: AuditActor
) {
  const db = getTenantDb();

  return db.transaction(async (tx) => {
    const subtotal = lines.reduce((s, l) => s + toNum(l.lineTotal), 0);
    const tax = lines.reduce((s, l) => s + toNum(l.taxAmount), 0);
    const total = roundMoney(subtotal + tax);

    const [doc] = await tx
      .insert(purchaseDocuments)
      .values({
        ...header,
        subtotal: String(roundMoney(subtotal)),
        tax: String(roundMoney(tax)),
        total: String(total),
        status: 'draft',
      })
      .returning();

    if (lines.length) {
      await tx.insert(purchaseDocumentLines).values(
        lines.map((l) => ({
          ...l,
          documentId: doc.id,
          qty: String(l.qty),
          unitPrice: String(l.unitPrice),
          lineTotal: String(l.lineTotal),
          taxPct: l.taxPct != null ? String(l.taxPct) : '18',
          taxAmount: l.taxAmount != null ? String(l.taxAmount) : '0',
          discount: l.discount != null ? String(l.discount) : '0',
          otherCharges: l.otherCharges != null ? String(l.otherCharges) : '0',
        }))
      );
    }

    await writeAuditLog(
      {
        tableName: 'purchase_documents',
        operation: 'INSERT',
        recordId: doc.id,
        afterData: doc,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'documentos',
        description: `Creó documento ${header.documentType} ${header.series}-${header.sequential}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getDocumentWithLines(doc.id);
  });
}

export async function updatePurchaseDocument(
  id: number,
  header: Partial<typeof purchaseDocuments.$inferInsert>,
  lines?: Omit<typeof purchaseDocumentLines.$inferInsert, 'id' | 'documentId'>[],
  actor?: AuditActor
) {
  const db = getTenantDb();
  const existing = await getDocumentWithLines(id);
  if (!existing) throw new Error('Documento no encontrado');
  if (existing.status !== 'draft') {
    throw new Error('Solo se pueden modificar documentos en estado GENERADO (draft)');
  }

  return db.transaction(async (tx) => {
    let totals = { subtotal: existing.subtotal, tax: existing.tax, total: existing.total };
    if (lines) {
      const subtotal = lines.reduce((s, l) => s + toNum(l.lineTotal), 0);
      const tax = lines.reduce((s, l) => s + toNum(l.taxAmount), 0);
      totals = {
        subtotal: String(roundMoney(subtotal)),
        tax: String(roundMoney(tax)),
        total: String(roundMoney(subtotal + tax)),
      };
      await tx.delete(purchaseDocumentLines).where(eq(purchaseDocumentLines.documentId, id));
      await tx.insert(purchaseDocumentLines).values(lines.map((l) => ({ ...l, documentId: id })));
    }

    const [doc] = await tx
      .update(purchaseDocuments)
      .set({ ...header, ...totals })
      .where(eq(purchaseDocuments.id, id))
      .returning();

    await writeAuditLog(
      {
        tableName: 'purchase_documents',
        operation: 'UPDATE',
        recordId: id,
        beforeData: existing,
        afterData: doc,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'documentos',
        description: `Actualizó documento ${doc.series}-${doc.sequential}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getDocumentWithLines(id);
  });
}

export async function processPurchaseDocument(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const doc = await getDocumentWithLines(id);
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status !== 'draft') throw new Error('El documento ya fue procesado o anulado');
  if (!doc.lines?.length) throw new Error('El documento no tiene líneas');

  const docNumber = `${doc.series}-${doc.sequential}`;

  return db.transaction(async (tx) => {
    for (const line of doc.lines) {
      const qty = toNum(line.qty);
      const unitPrice = roundMoney(toNum(line.lineTotal) / (qty || 1));

      await applyStockEntry(
        {
          itemId: line.itemId,
          areaId: doc.areaId,
          qty,
          unitPrice,
          documentType: doc.documentType,
          documentNumber: docNumber,
          originDest: `Proveedor #${doc.supplierId}`,
        },
        tx
      );

      await createBatchFromPurchase(tx, {
        itemId: line.itemId,
        areaId: doc.areaId,
        documentId: id,
        qty,
        entryDate: doc.entryDate,
      });

      await recordPurchasePriceHistory(tx, {
        itemId: line.itemId,
        supplierId: doc.supplierId,
        documentId: id,
        purchasePrice: unitPrice,
        qty,
        purchaseDate: doc.entryDate,
        currency: doc.currency,
      });
    }

    const [processed] = await tx
      .update(purchaseDocuments)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(purchaseDocuments.id, id))
      .returning();

    const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, doc.supplierId));

    await writeAuditLog(
      {
        tableName: 'purchase_documents',
        operation: 'PROCESS',
        recordId: id,
        beforeData: doc,
        afterData: processed,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'documentos',
        description: `Procesó ${doc.documentType} ${docNumber} — ${supplier?.legalName ?? 'proveedor'}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getDocumentWithLines(id);
  });
}

export async function voidPurchaseDocument(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const doc = await getDocumentWithLines(id);
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.status === 'processed') {
    throw new Error('Los documentos procesados no se anulan desde este endpoint; use desprocesar en una versión futura');
  }
  if (doc.status === 'voided') throw new Error('El documento ya está anulado');

  const [voided] = await db
    .update(purchaseDocuments)
    .set({ status: 'voided' })
    .where(eq(purchaseDocuments.id, id))
    .returning();

  await writeAuditLog({
    tableName: 'purchase_documents',
    operation: 'VOID',
    recordId: id,
    beforeData: doc,
    afterData: voided,
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'documentos',
    description: `Anuló documento ${doc.series}-${doc.sequential}`,
    ipAddress: actor?.ip,
  });

  return voided;
}
