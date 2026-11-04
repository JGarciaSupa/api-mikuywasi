import { AsyncLocalStorage } from 'async_hooks';

// Contexto de caja de la petición: en qué turno dice estar operando el equipo.
// - cashSessionId: turno elegido en el POS (cabecera X-Cash-Session), p. ej. "Vendiendo en: Caja 2 · Turno 27".
// - terminalToken: equipo vinculado a una caja (cabecera X-Cash-Terminal).
// Los servicios lo leen para saber a qué turno va cada venta, cobro o comprobante; la API
// siempre valida que el turno esté abierto, sea de la sucursal y que el usuario participe.

export interface CashOperationContext {
  cashSessionId: number | null;
  terminalToken: string | null;
}

const storage = new AsyncLocalStorage<CashOperationContext>();

export function getCashOperationContext(): CashOperationContext {
  return storage.getStore() ?? { cashSessionId: null, terminalToken: null };
}

export function runWithCashOperationContext<T>(context: CashOperationContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}
