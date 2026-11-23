import { eq } from 'drizzle-orm';
import { Server } from 'socket.io';
import { Server as Engine } from '@socket.io/bun-engine';
import { masterDb } from '@/db';
import { tenants } from '@/db/master/schema';
import { verifyAccessToken } from '@/utils/jwt';

export type QrUpdateKind = 'state' | 'pending' | 'closed' | 'moved';

export interface QrUpdate {
  tenantId: number;
  branchId: number;
  sessionId?: number | null;
  tableId?: number | null;
  kind: QrUpdateKind;
}

const engine = new Engine({
  path: '/socket.io/',
  cors: { origin: true, credentials: true },
});

const io = new Server();
io.bind(engine);

function sessionRoom(tenantId: number, sessionId: number) {
  return `tenant:${tenantId}:session:${sessionId}`;
}

function branchRoom(tenantId: number, branchId: number) {
  return `tenant:${tenantId}:branch:${branchId}`;
}

io.use(async (socket, next) => {
  try {
    const auth = socket.handshake.auth as { sessionToken?: string; accessToken?: string; tenantSlug?: string; branchId?: number | string };
    if (auth.sessionToken) {
      const { decodeSessionToken } = await import('@/core/tenant/services/client/table-session.service');
      const payload = decodeSessionToken(auth.sessionToken);
      socket.data.rooms = [sessionRoom(payload.tenantId, payload.sessionId)];
      return next();
    }
    const branchId = Number(auth.branchId);
    if (auth.accessToken && auth.tenantSlug && Number.isInteger(branchId) && branchId > 0) {
      await verifyAccessToken(auth.accessToken);
      const [tenant] = await masterDb.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, auth.tenantSlug)).limit(1);
      if (!tenant) return next(new Error('unauthorized'));
      socket.data.rooms = [branchRoom(tenant.id, branchId)];
      return next();
    }
    return next(new Error('unauthorized'));
  } catch {
    return next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const rooms = socket.data.rooms as string[] | undefined;
  if (rooms?.length) socket.join(rooms);
});

export function publishQrUpdate(event: QrUpdate) {
  const payload = { ...event, at: Date.now() };
  io.to(branchRoom(event.tenantId, event.branchId)).emit('qr:update', payload);
  if (event.sessionId) io.to(sessionRoom(event.tenantId, event.sessionId)).emit('qr:update', payload);
}

export function qrEngineHandler() {
  return engine.handler();
}

export function handleQrEngineRequest(request: Request, server: unknown) {
  return engine.handleRequest(request, server as Bun.Server<any>);
}
