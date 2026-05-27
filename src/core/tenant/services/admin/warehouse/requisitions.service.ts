import { eq, desc, and } from 'drizzle-orm';
import {
  requisitions,
  requisitionLines,
  storageAreas,
  warehouses,
  items,
  itemAreaAssignments,
} from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { toNum } from './shared/numbers';
import { writeAuditLog } from './shared/audit.service';
import type { AuditActor } from './types';
import { applyStockEntry, applyStockExit } from './shared/stock-movement.service';

async function getRequisitionWithLines(id: number) {
  const db = getTenantDb();
  const [req] = await db.select().from(requisitions).where(eq(requisitions.id, id));
  if (!req) return null;
  const lines = await db
    .select()
    .from(requisitionLines)
    .where(eq(requisitionLines.requisitionId, id));
  return { ...req, lines };
}

export async function listRequisitions(filters?: { status?: string; areaId?: number; branchId?: number }) {
  const db = getTenantDb();
  const conditions = [];
  if (filters?.status) conditions.push(eq(requisitions.status, filters.status as 'draft' | 'processed' | 'voided'));
  if (filters?.areaId) conditions.push(eq(requisitions.areaId, filters.areaId));
  if (filters?.branchId) conditions.push(eq(requisitions.branchId, filters.branchId));

  const q = db
    .select({ requisition: requisitions, areaName: storageAreas.name })
    .from(requisitions)
    .leftJoin(storageAreas, eq(requisitions.areaId, storageAreas.id))
    .orderBy(desc(requisitions.createdAt));

  if (conditions.length) return q.where(and(...conditions));
  return q;
}

export async function getRequisitionById(id: number) {
  return getRequisitionWithLines(id);
}

export async function createRequisition(
  header: { branchId: number; areaId: number; areaManager?: string; reference?: string; createdBy?: string },
  lines: { itemId: number; requestedQty: number; servedQty?: number }[],
  actor?: AuditActor
) {
  const db = getTenantDb();

  // El almacén central es aquel cuyo warehouse tiene isCentral=true
  const centralArea = await db
    .select({ id: storageAreas.id })
    .from(storageAreas)
    .innerJoin(warehouses, eq(storageAreas.warehouseId, warehouses.id))
    .where(eq(warehouses.isCentral, true))
    .limit(1);
  const central = centralArea[0];
  if (!central) throw new Error('No hay almacén central configurado');

  return db.transaction(async (tx) => {
    const [req] = await tx
      .insert(requisitions)
      .values({ ...header, status: 'draft' })
      .returning();

    if (lines.length) {
      await tx.insert(requisitionLines).values(
        lines.map((l) => ({
          requisitionId: req.id,
          itemId: l.itemId,
          requestedQty: String(l.requestedQty),
          servedQty: String(l.servedQty ?? 0),
          pendingQty: String(Math.max(0, l.requestedQty - (l.servedQty ?? 0))),
          referenceStock: '0',
        }))
      );
    }

    await writeAuditLog(
      {
        tableName: 'requisitions',
        operation: 'INSERT',
        recordId: req.id,
        afterData: req,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'requerimientos',
        description: `Creó requerimiento RQ-${req.id}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getRequisitionWithLines(req.id);
  });
}

export async function voidRequisition(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const req = await getRequisitionWithLines(id);
  if (!req) throw new Error('Requerimiento no encontrado');
  if (req.status === 'voided') throw new Error('El requerimiento ya está anulado');
  if (req.status === 'processed') throw new Error('No se puede anular un requerimiento ya procesado');

  const [voided] = await db
    .update(requisitions)
    .set({ status: 'voided' })
    .where(eq(requisitions.id, id))
    .returning();

  await writeAuditLog({
    tableName: 'requisitions',
    operation: 'VOID',
    recordId: id,
    beforeData: req,
    afterData: voided,
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'requerimientos',
    description: `Anuló requerimiento RQ-${id}`,
    ipAddress: actor?.ip,
  });

  return voided;
}

export async function processRequisition(id: number, actor?: AuditActor) {
  const db = getTenantDb();
  const req = await getRequisitionWithLines(id);
  if (!req) throw new Error('Requerimiento no encontrado');
  if (req.status !== 'draft') throw new Error('El requerimiento ya fue procesado');

  // El almacén central es aquel cuyo warehouse tiene isCentral=true
  const centralArea = await db
    .select({ id: storageAreas.id })
    .from(storageAreas)
    .innerJoin(warehouses, eq(storageAreas.warehouseId, warehouses.id))
    .where(eq(warehouses.isCentral, true))
    .limit(1);
  const central = centralArea[0];
  if (!central) throw new Error('No hay almacén central configurado');

  const docNumber = `RQ-${id}`;

  return db.transaction(async (tx) => {
    for (const line of req.lines) {
      const served = toNum(line.servedQty);
      if (served <= 0) continue;

      const [assignment] = await tx
        .select()
        .from(itemAreaAssignments)
        .where(
          and(
            eq(itemAreaAssignments.itemId, line.itemId),
            eq(itemAreaAssignments.areaId, req.areaId)
          )
        )
        .limit(1);

      if (!assignment) {
        throw new Error(`El artículo ${line.itemId} no está asignado al área solicitante`);
      }

      const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));

      await applyStockExit(
        {
          branchId: req.branchId,
          itemId: line.itemId,
          areaId: central.id,
          qty: served,
          unitPrice: toNum(item?.avgPrice),
          documentType: 'requerimiento',
          documentNumber: docNumber,
          originDest: `Área ${req.areaId}`,
        },
        tx
      );

      await applyStockEntry(
        {
          branchId: req.branchId,
          itemId: line.itemId,
          areaId: req.areaId,
          qty: served,
          unitPrice: toNum(item?.avgPrice),
          documentType: 'requerimiento',
          documentNumber: docNumber,
          originDest: `Almacén central`,
        },
        tx
      );

      await tx
        .update(requisitionLines)
        .set({
          pendingQty: String(Math.max(0, toNum(line.requestedQty) - served)),
        })
        .where(eq(requisitionLines.id, line.id));
    }

    const [processed] = await tx
      .update(requisitions)
      .set({ status: 'processed', processedAt: new Date(), attendedAt: new Date() })
      .where(eq(requisitions.id, id))
      .returning();

    await writeAuditLog(
      {
        tableName: 'requisitions',
        operation: 'PROCESS',
        recordId: id,
        beforeData: req,
        afterData: processed,
        userId: actor?.userId,
        userName: actor?.userName,
        module: 'requerimientos',
        description: `Procesó RQ-${id} — Área: ${req.areaId}`,
        ipAddress: actor?.ip,
      },
      tx
    );

    return getRequisitionWithLines(id);
  });
}
