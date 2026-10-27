# Facturación — Comprobante para PDF/ticket

> Documento parcial: por ahora solo describe el endpoint `/receipt`. El resto de
> rutas de facturación está en `src/core/tenant/routes/admin/documents/billing/index.ts`.

## GET `/api/billing/documents/:id/receipt`

Datos enriquecidos para generar en el frontend el PDF A4 (`ComprobantePDF`) y el ticket térmico.

- **Auth:** `authMiddleware` (sin permiso específico).
- **Tenant:** cabecera `X-Tenant-Slug`.

### Respuesta `200`

```jsonc
{
  "success": true,
  "data": {
    "document": { /* fila de billing_documents (incluye emisorRuc, emisorName, emisorAddress) */ },
    "lines": [ /* billing_document_lines + taxes (desglose por impuesto) */ ],
    "taxBreakdown": [ /* totales por impuesto */ ],
    "emisor": { "ruc": "20123456789", "name": "RAZÓN SOCIAL", "address": "…", "logoUrl": "https://…" | null },
    "branch": { "name": "…", "phone": null, "email": null, "address": "…" },
    "paymentSummary": { "paymentMethod": "…", "retentionPercentage": "0.00", "retentionAmount": "0.00", "chargedTotal": "100.00" } | null,
    "meta": { /* fechas, moneda, servicio, etiqueta del doc. del comprador */ }
  }
}
```

### Emisor (snapshot)

Desde la migración tenant `0085_add_emisor_snapshot_to_billing_documents`:

1. Si el documento tiene `emisor_ruc`, el `emisor` sale de las columnas `emisor_*` del documento
   (sin llamar al facturador). El logo sigue saliendo de `brands.logo`.
2. Si no lo tiene, se resuelve en vivo desde el facturador (empresa SUNAT de la sucursal) y,
   **si devuelve RUC**, se guarda en `emisor_ruc`, `emisor_name` y `emisor_address`. Desde entonces el PDF de ese
   comprobante no depende del facturador ni cambia si la empresa se edita.
3. Si el facturador no responde y no hay snapshot, `emisor` llega con campos vacíos (comportamiento anterior)
   y no se guarda nada.

# Facturación — Empresa del facturador por sucursal

## GET / POST `/api/branches/:id/facturacion`

`POST` crea o actualiza la empresa emisora de la sucursal en el facturador (Facturador-Greenter) y guarda
`facturadorEmpresaId`/`fiscalId` en la sucursal. El body se reenvía tal cual al facturador.

| Campo | Requerido | Nota |
|---|---|---|
| `ruc`, `razon_social`, `direccion`, `usuario_sol`, `clave_sol`, `ambiente` | sí | `ambiente`: `beta` \| `produccion` |
| `certificado`, `certificado_password`, `logo`, `plan`, `client_id`, `client_secret` | no | |
| `ubigeo` | no | 6 dígitos INEI del domicilio fiscal. Si no es de 6 dígitos el facturador responde 400 |
| `departamento`, `provincia`, `distrito`, `urbanizacion` | no | Domicilio fiscal para el XML (`cac:RegistrationAddress`). Si faltan, el facturador usa Lima por defecto |

`GET` devuelve la empresa con `ubigeo`, `department`, `province`, `district`, `urbanization` (o `null`).

## ICBPER en la emisión
Si alguna línea lleva ICBPER, el payload al facturador incluye `totales.icbper` (suma de las líneas) además del
ICBPER por línea, en facturas, boletas y notas de crédito.

## IGV de la sucursal y recargo al consumo
- **IGV**: `impuesto_1` de `branches.taxes` (18 % general o 10.5 % MYPE restaurante en 2026). SUNAT rechaza (3462)
  un comprobante con tasas de IGV distintas entre líneas, por eso la tasa es de la sucursal. Un producto con
  `impuesto_1` apagado (override por canal) se declara **exonerado** (afectación `20`).
- **Recargo al consumo**: clave `recargo_consumo` en `branches.taxes` (porcentaje editable, inactivo por defecto).
  Está incluido en el precio y se desglosa "hacia abajo" junto al IGV sobre el valor neto
  (ej. 25.00 con IGV 10.5 % y recargo 3 % → valor 22.03, IGV 2.31, recargo 0.66). Cada producto puede apagarlo.
  Al activarlo en la sucursal se aplica a todos los productos que no lo tengan apagado.
- **Envío a SUNAT** (`services/admin/documents/sunat-payload.ts`): el recargo no es tributo. Se resta de
  `total_impuestos`/`subtotal`, va en `totales.otros_cargos` y, en factura/boleta, como `cargos[]` con
  `motivo: '46'` (catálogo 53). En notas de crédito solo `otros_cargos` (Greenter no admite cargos en notas).

## Pago pendiente ("cliente no pagó")

Marca **interna** para ventas que el cliente pagará otro día por acuerdo con el dueño. No cambia SUNAT (el comprobante va al contado) ni la caja (el cobro se registró al vender). Requiere:

- Sucursal con `allowPendingPayment = true` (`PATCH /branches/:id`, Parámetros). Apagado por defecto.
- Permiso `facturacion.pago_pendiente` (`rol_admin` siempre pasa).
- Opcional por sucursal: `pendingPaymentRequiresCustomer = true` (migración `0092`) exige asociar un cliente frecuente.

**Emitir con la marca** — `POST /billing/documents` acepta además:

```json
{ "paymentPending": true, "paymentPendingNote": "Paga el viernes", "paymentPendingCustomerId": 15 }
```

Solo para el pedido completo (no con `splitId`). Sin permiso → 403; sucursal sin la opción → 422. `paymentPendingCustomerId` (opcional) debe ser un cliente activo; se guarda en `orders.customer_id` dentro de la misma transacción del documento, junto con `customer_name` (nombre del cliente) y `customer_phone` (su teléfono principal, solo si el pedido no tenía uno). Si la sucursal exige cliente y no llega ni el pedido ya tiene uno → 422. El panel valida lo mismo **antes de cobrar**, porque el comprobante se emite después del cobro.

**Listado** — `GET /billing/documents?paymentPending=true` devuelve solo los pendientes sin cobrar y no anulados. Toda respuesta del listado incluye `pendingPayments: { count, total }` de la sucursal filtrada. Cada documento trae `paymentPending`, `paymentPendingNote`, `paymentCollectedAt`, `paymentCollectedBy`, `paymentCollectedMethod` y `paymentCollectedReference`.

**Marcar como cobrado** — `PATCH /billing/documents/:id/collected` (permiso `facturacion.pago_pendiente`). Body opcional (retrocompatible): `{ "paymentMethodId": 3, "reference": "004512" }`. Guarda `paymentCollectedAt`, `paymentCollectedBy` y, si se envía, la forma de pago real (`paymentCollectedMethodId`, snapshot `paymentCollectedMethod`) y su REF (máx. 50). El método debe estar activo y ser de la sucursal del comprobante. Es **informativo**: no toca SUNAT ni la caja. 422 si el documento no tiene pago pendiente, ya fue cobrado o está anulado.

**Consumo por cliente** — `GET /customers/:id/history?page=&limit=&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`. Requiere `facturacion.ver_documentos` **o** `administracion.configuracion` (403 si no). Devuelve `summary { orders, consumed, lastVisit, pendingCount, pendingTotal }`, `data` (pedidos no anulados del cliente en todas las sucursales, con sus comprobantes vigentes) y `pagination`.
