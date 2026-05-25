/** Utilidades para cálculos con decimales del módulo de almacén */
export function toNum(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

export function roundQty(value: number, scale = 3): number {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

export function roundMoney(value: number, scale = 4): number {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

/** Precio promedio ponderado: PP_nuevo = (stock×PP + qty×precio) / (stock + qty) */
export function weightedAveragePrice(
  currentStock: number,
  currentAvg: number,
  incomingQty: number,
  incomingPrice: number
): number {
  const totalQty = currentStock + incomingQty;
  if (totalQty <= 0) return incomingPrice;
  return roundMoney(
    (currentStock * currentAvg + incomingQty * incomingPrice) / totalQty
  );
}
