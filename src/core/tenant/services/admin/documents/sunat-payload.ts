// Líneas y totales SUNAT a partir de las líneas ya desglosadas de un comprobante.
//
// El precio de venta incluye IGV, ICBPER y (si aplica) recargo al consumo, desglosados
// "hacia abajo" por el motor de impuestos. Para SUNAT hay que separarlos: IGV e ICBPER
// son tributos (TaxTotal); el recargo al consumo no lo es y va como cargo global
// (catálogo 53, código 46) que no afecta la base imponible y suma al importe total.
//
// Sin recargo, el resultado es idéntico al que se armaba antes dentro de billing.service.
import { splitSunatLineTaxes, type SnapshotLike } from '../../shared/taxes.service';

const toNum = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const roundMoney = (val: number) => Number(val.toFixed(2));

export interface SunatLineSource {
  productId: number | null;
  productName: string;
  alternativesDesc: string | null;
  quantity: number;
  subtotal: number;      // valor de venta (sin tributos ni recargo)
  taxAmount: number;     // todo lo desglosado: tributos + recargo
  lineTotal: number;     // precio final de la línea
  igvAmount?: number;
  tipoAfectacion: '10' | '20';
  taxSnapshot?: SnapshotLike[];
}

export interface SunatDocumentAmounts {
  subtotal: number | string | null;
  taxAmount: number | string | null;
  total: number | string | null;
}

function lineAmounts(l: SunatLineSource) {
  if (!l.taxSnapshot?.length) {
    // Líneas sin desglose (documentos antiguos): todo lo cobrado es IGV, como antes.
    return { igv: roundMoney(l.igvAmount ?? l.taxAmount), icbper: 0, factorIcbper: 0, serviceCharge: 0, serviceChargeRate: 0, mainRate: null as number | null };
  }
  const split = splitSunatLineTaxes(l.taxSnapshot);
  const active = l.taxSnapshot.filter((tax) => tax.isActive !== false);
  const icbperTax = active.find((tax) => tax.key === 'icbper') ?? null;
  const mainTax = active.find((tax) => tax.key === 'impuesto_1')
    ?? active.find((tax) => tax.calculationType !== 'fixed' && tax.key !== 'icbper' && tax.key !== 'recargo_consumo')
    ?? null;
  return {
    igv: split.igv,
    icbper: split.icbper,
    factorIcbper: icbperTax ? toNum(icbperTax.rate) : 0,
    serviceCharge: split.serviceCharge,
    serviceChargeRate: split.serviceChargeRate,
    mainRate: mainTax ? toNum(mainTax.rate) : null,
  };
}

/** Detalle SUNAT de una línea. `fallbackRate`: tasa del documento si la línea no trae desglose. */
export function buildSunatDetalle(l: SunatLineSource, codigo: string, fallbackRate: number) {
  const a = lineAmounts(l);
  const tributos = roundMoney(a.igv + a.icbper);
  return {
    codigo,
    unidad_medida: 'NIU',
    descripcion: l.alternativesDesc ? `${l.productName} (${l.alternativesDesc})` : l.productName,
    cantidad: l.quantity,
    valor_unitario: roundMoney(l.subtotal / l.quantity),
    valor_venta: l.subtotal,
    base_igv: l.subtotal,
    porcentaje_igv: l.tipoAfectacion === '20' ? 0 : (a.mainRate ?? fallbackRate),
    igv: a.igv,
    tipo_afectacion: l.tipoAfectacion,
    total_impuestos: l.taxSnapshot?.length ? tributos : l.taxAmount,
    // Precio unitario = valor + tributos por unidad; el recargo no forma parte de él.
    precio_unitario: roundMoney((l.lineTotal - a.serviceCharge) / l.quantity),
    ...(a.icbper > 0 ? { icbper: a.icbper, factor_icbper: a.factorIcbper } : {}),
  };
}

function sumLines(lines: SunatLineSource[], fn: (l: SunatLineSource, a: ReturnType<typeof lineAmounts>) => number) {
  return roundMoney(lines.reduce((acc, l) => acc + fn(l, lineAmounts(l)), 0));
}

/** Totales SUNAT del documento. `otros_cargos` = recargo al consumo (ChargeTotalAmount). */
export function buildSunatTotales(lines: SunatLineSource[], doc: SunatDocumentAmounts) {
  const icbper = sumLines(lines, (_l, a) => a.icbper);
  const serviceCharge = sumLines(lines, (_l, a) => a.serviceCharge);

  return {
    gravadas: sumLines(lines, (l) => (l.tipoAfectacion === '10' ? l.subtotal : 0)),
    exoneradas: sumLines(lines, (l) => (l.tipoAfectacion === '20' ? l.subtotal : 0)),
    igv: sumLines(lines, (_l, a) => a.igv),
    total_impuestos: roundMoney(toNum(doc.taxAmount) - serviceCharge),
    valor_venta: toNum(doc.subtotal),
    subtotal: roundMoney(toNum(doc.total) - serviceCharge),
    total: toNum(doc.total),
    ...(icbper > 0 ? { icbper } : {}),
    ...(serviceCharge > 0 ? { otros_cargos: serviceCharge } : {}),
  };
}

/** Recargo al consumo como cargo global 46 (no afecta la base del IGV). Vacío si no hay. */
export function buildSunatCargos(lines: SunatLineSource[]) {
  const monto = sumLines(lines, (_l, a) => a.serviceCharge);
  if (monto <= 0) return [];
  const base = sumLines(lines, (l, a) => (a.serviceCharge > 0 ? l.subtotal : 0));
  const rate = lines.map(lineAmounts).find((a) => a.serviceCharge > 0)?.serviceChargeRate ?? 0;
  return [{ motivo: '46', factor: rate / 100, monto, monto_base: base }];
}
