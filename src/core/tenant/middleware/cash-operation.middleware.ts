import type { Context, Next } from 'hono';
import { runWithCashOperationContext } from '@/utils/cash-operation-context';

/**
 * Guarda en el contexto de la petición el turno elegido en el equipo (X-Cash-Session) y el
 * equipo vinculado (X-Cash-Terminal). Sin cabeceras, el contexto queda vacío y todo funciona
 * como antes (turno del usuario).
 */
export async function cashOperationMiddleware(c: Context, next: Next) {
  const rawSession = c.req.header('X-Cash-Session');
  const sessionId = rawSession ? Number.parseInt(rawSession, 10) : NaN;
  await runWithCashOperationContext(
    {
      cashSessionId: Number.isInteger(sessionId) && sessionId > 0 ? sessionId : null,
      terminalToken: c.req.header('X-Cash-Terminal')?.trim() || null,
    },
    () => next(),
  );
}
