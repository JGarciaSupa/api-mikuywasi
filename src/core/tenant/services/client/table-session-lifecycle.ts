import { and, eq, or } from 'drizzle-orm';
import { tableSessions } from '@/db/tenant/schema';
import { getTenantDb, getTenantId } from '@/utils/tenant-context';
import { publishQrUpdate } from '@/realtime/qr-socket';

export type SessionCloseReason = 'paid' | 'cancelled' | 'dirty' | 'expired';

// Cierra la sesión abierta de esa mesa o de ese pedido. Un fallo aquí no debe frenar el cobro ni la anulación.
export async function closeOpenTableSession(input: {
  tableId?: number | null;
  orderId?: string | null;
  reason: SessionCloseReason;
  userId?: number | null;
}) {
  if (!input.tableId && !input.orderId) return;
  try {
    const db = getTenantDb();
    const now = new Date();
    const match = input.orderId && input.tableId
      ? or(eq(tableSessions.orderId, input.orderId), eq(tableSessions.tableId, input.tableId))
      : input.orderId
        ? eq(tableSessions.orderId, input.orderId)
        : eq(tableSessions.tableId, input.tableId!);

    const closed = await db.update(tableSessions).set({
      status: input.reason === 'expired' ? 'expired' : 'closed',
      closeReason: input.reason,
      closedAt: now,
      closedById: input.userId ?? null,
      updatedAt: now,
    }).where(and(eq(tableSessions.status, 'open'), match)).returning({
      id: tableSessions.id,
      branchId: tableSessions.branchId,
      tableId: tableSessions.tableId,
    });
    const tenantId = getTenantId();
    for (const row of closed) {
      publishQrUpdate({ tenantId, branchId: row.branchId, sessionId: row.id, tableId: row.tableId, kind: 'closed' });
    }
  } catch (error) {
    console.error('[qr] No se pudo cerrar la sesión de mesa', error);
  }
}

// La sesión sigue al pedido cuando el mozo cambia la mesa completa. Si la destino ya tiene sesión, no se pisa.
export async function moveOpenTableSession(fromTableId: number, toTableId: number, orderId: string) {
  try {
    const db = getTenantDb();
    const [destination] = await db.select({ id: tableSessions.id }).from(tableSessions).where(and(
      eq(tableSessions.tableId, toTableId),
      eq(tableSessions.status, 'open'),
    )).limit(1);
    if (destination) {
      console.error('[qr] La mesa destino ya tiene una sesión abierta; no se movió la sesión', toTableId);
      return;
    }

    const [moved] = await db.update(tableSessions).set({
      tableId: toTableId,
      orderId,
      updatedAt: new Date(),
    }).where(and(
      eq(tableSessions.tableId, fromTableId),
      eq(tableSessions.status, 'open'),
    )).returning({
      id: tableSessions.id,
      branchId: tableSessions.branchId,
    });
    if (moved) {
      publishQrUpdate({
        tenantId: getTenantId(),
        branchId: moved.branchId,
        sessionId: moved.id,
        tableId: toTableId,
        kind: 'moved',
      });
    }
  } catch (error) {
    console.error('[qr] No se pudo mover la sesión de mesa', error);
  }
}
