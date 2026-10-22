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
