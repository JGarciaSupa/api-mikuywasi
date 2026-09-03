// Motor de impuestos compartido.
//
// La configuración vive en tres niveles y este módulo es el único lugar que sabe
// resolverlos, para que POS, canal web y facturación no se contradigan:
//
//   1. Sucursal            → branches.taxes            (catálogo base: tasa + activación)
//   2. Producto × canal     → product_sales_channel_prices.taxes  (solo activa/desactiva)
//   3. Línea del pedido     → order_items.tax_snapshot  (congelado al vender)
//
// El override del nivel 2 aporta ÚNICAMENTE `isActive`: la tasa y el tipo de cálculo
// se leen siempre de la sucursal vigente. Así, si la sucursal cambia el IGV de 18% a
// 10%, los productos con override toman la tasa nueva en vez de quedarse con la que
// se copió el día que se editó el producto.

export type TaxConfig = {
  key: string;
  label: string;
  rate: number;
  isActive: boolean;
  defaultActive?: boolean;
  calculationType?: 'percentage' | 'fixed';
};

export type TaxSnapshotEntry = TaxConfig & { amount: number };

export const DEFAULT_BRANCH_TAXES: TaxConfig[] = [
  { key: 'impuesto_1', label: 'Aplica Impuesto 1', rate: 18, defaultActive: true, isActive: true, calculationType: 'percentage' },
  { key: 'impuesto_2', label: 'Aplica Impuesto 2', rate: 0, defaultActive: false, isActive: false, calculationType: 'percentage' },
  { key: 'impuesto_3', label: 'Aplica Impuesto 3', rate: 0, defaultActive: false, isActive: false, calculationType: 'percentage' },
  { key: 'icbper', label: 'Aplica ICBPER', rate: 0.5, defaultActive: false, isActive: false, calculationType: 'fixed' },
];

function toNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const roundMoney = (val: number) => Number(val.toFixed(2));

export function normalizeTaxConfigList(taxes?: TaxConfig[] | null): TaxConfig[] {
  const source = Array.isArray(taxes) && taxes.length > 0 ? taxes : DEFAULT_BRANCH_TAXES;
  const byKey = new Map(source.map((tax) => [tax.key, tax]));

  return DEFAULT_BRANCH_TAXES.map((base) => {
    const tax = byKey.get(base.key);
    if (!tax) return base;
    return {
      key: tax.key || base.key,
      label: tax.label || base.label,
      rate: Number.isFinite(Number(tax.rate)) ? Number(tax.rate) : base.rate,
      defaultActive: tax.defaultActive ?? base.defaultActive,
      isActive: tax.isActive ?? tax.defaultActive ?? base.isActive,
      calculationType: tax.calculationType ?? base.calculationType,
    };
  });
}

export function isFixedTax(tax: { key: string; calculationType?: 'percentage' | 'fixed' }) {
  return tax.calculationType === 'fixed' || tax.key === 'icbper';
}

// Combina sucursal + override de producto/canal.
//
// La sucursal define el universo: qué impuestos existen, con qué tasa y cuáles están
// en uso. El override del producto solo puede APAGAR uno que la sucursal tenga
// encendido — nunca encender uno que la sucursal no usa. Es la misma regla que aplica
// la pantalla del producto, que solo lista los impuestos activos de la sucursal; sin
// esto, un override viejo podría seguir cobrando un impuesto que ya no se ve por
// ningún lado.
export function resolveEffectiveTaxes(
  branchTaxes?: TaxConfig[] | null,
  channelTaxes?: TaxConfig[] | null,
): TaxConfig[] {
  const base = normalizeTaxConfigList(branchTaxes ?? undefined);
  if (!Array.isArray(channelTaxes) || channelTaxes.length === 0) return base;

  const overrideByKey = new Map(channelTaxes.map((tax) => [tax.key, tax]));
  return base.map((tax) => {
    const override = overrideByKey.get(tax.key);
    if (!override) return tax;
    return { ...tax, isActive: tax.isActive && (override.isActive ?? true) };
  });
}

// Tasa "principal" del documento (la que va en billing_documents.tax_rate y en la
// leyenda "I.G.V. (x%)"): impuesto_1 si está activo, si no el primer porcentual activo.
export function resolveBranchMainTaxRate(branchTaxes?: TaxConfig[] | null): number {
  const active = normalizeTaxConfigList(branchTaxes ?? undefined).filter((tax) => tax.isActive);
  const main = active.find((tax) => tax.key === 'impuesto_1')
    ?? active.find((tax) => !isFixedTax(tax))
    ?? null;
  return main ? toNum(main.rate) : 0;
}

// Afectación SUNAT (catálogo 07) de una línea según sus impuestos activos.
// '10' = gravada, '20' = exonerada. Sin impuesto porcentual activo la operación
// no es gravada, así que declararla como '10' es lo que SUNAT observa.
export function resolveTipoAfectacion(taxes?: { key: string; rate?: number; isActive?: boolean; calculationType?: 'percentage' | 'fixed' }[] | null): '10' | '20' {
  const hasPercentage = (taxes ?? []).some(
    (tax) => tax.isActive !== false && !isFixedTax(tax) && toNum(tax.rate) > 0,
  );
  return hasPercentage ? '10' : '20';
}

// Desglosa un importe BRUTO (con impuestos incluidos) en base + impuestos.
// Los fijos (ICBPER) se restan primero porque no forman parte de la base porcentual.
export function resolveLineTaxes(grossAmount: number, quantity: number, taxes: TaxConfig[]) {
  const activeTaxes = normalizeTaxConfigList(taxes).filter((tax) => tax.isActive);
  const percentageTaxes = activeTaxes.filter((tax) => !isFixedTax(tax));
  const fixedTaxes = activeTaxes.filter((tax) => isFixedTax(tax));

  const fixedTotal = fixedTaxes.reduce((sum, tax) => sum + (toNum(tax.rate) * quantity), 0);
  const percentageRateTotal = percentageTaxes.reduce((sum, tax) => sum + toNum(tax.rate), 0);
  const baseAmount = percentageRateTotal > 0
    ? roundMoney((grossAmount - fixedTotal) / (1 + (percentageRateTotal / 100)))
    : roundMoney(grossAmount - fixedTotal);

  const taxesWithAmount: TaxSnapshotEntry[] = activeTaxes.map((tax) => {
    const amount = isFixedTax(tax)
      ? roundMoney(toNum(tax.rate) * quantity)
      : roundMoney(baseAmount * (toNum(tax.rate) / 100));

    return {
      key: tax.key,
      label: tax.label,
      rate: toNum(tax.rate),
      isActive: true,
      defaultActive: tax.defaultActive,
      calculationType: tax.calculationType,
      amount,
    };
  });

  const totalTaxAmount = roundMoney(taxesWithAmount.reduce((sum, tax) => sum + toNum(tax.amount), 0));
  const subtotal = roundMoney(grossAmount - totalTaxAmount);

  return {
    subtotal,
    totalTaxAmount,
    lineTotal: roundMoney(grossAmount),
    taxSnapshot: taxesWithAmount,
  };
}

// Prorratea los importes de un taxSnapshot por una razón (ej. dividir una línea
// por cantidad). Las tasas no cambian: solo se reparte el importe ya calculado.
export function prorateTaxSnapshot(
  snapshot: TaxSnapshotEntry[] | null | undefined,
  ratio: number,
): TaxSnapshotEntry[] | null {
  if (!snapshot?.length) return null;
  return snapshot.map((tax) => ({ ...tax, amount: roundMoney(toNum(tax.amount) * ratio) }));
}

// Suma los taxSnapshot de varias líneas en un solo desglose (orders.tax_breakdown).
export function aggregateTaxBreakdown(
  snapshots: (TaxSnapshotEntry[] | null | undefined)[],
): TaxSnapshotEntry[] | null {
  const byKey = new Map<string, TaxSnapshotEntry>();
  for (const snapshot of snapshots) {
    for (const tax of snapshot ?? []) {
      const prev = byKey.get(tax.key);
      if (prev) prev.amount = roundMoney(toNum(prev.amount) + toNum(tax.amount));
      else byKey.set(tax.key, { ...tax, amount: roundMoney(toNum(tax.amount)) });
    }
  }
  if (byKey.size === 0) return null;
  return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
}
