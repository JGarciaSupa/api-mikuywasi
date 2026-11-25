# Cortesías — `/api/waiter/orders/:id/courtesy`

Regalar un pedido completo o productos sueltos sin cobro. Motivo del catálogo de motivos
(`reasons.type = 'courtesy'`, respeta su `maxAmount`) y **siempre** la contraseña de un supervisor
con `seguridad.autorizar_cortesia`, salvo quien tiene `seguridad.cortesia_sin_contrasena`.
Permiso para usar los endpoints: `pedidos.cortesia` (Administrador, Administrador del local y Cajero).
Migración `0102_add_courtesies`.

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/waiter/orders/:id/courtesy` | `{ reasonId, password?, authCode? }` — cortesía del pedido completo: las líneas quedan en 0 (`courtesy_amount` = su valor), el pedido se cierra (`paid`/`completed`, `payment_method = 'Cortesía'`, `collected_session_id` = turno de quien la da) **sin ingreso de caja**, la mesa pasa a `dirty` y se emite el documento interno de cortesía. No aplica con delivery, descuento o cuentas divididas |
| POST | `/waiter/orders/:id/items/:itemId/courtesy` | `{ reasonId, password?, authCode? }` — cortesía de un producto del pedido abierto: la línea queda en 0 |
| DELETE | `/waiter/orders/:id/items/:itemId/courtesy` | Quita la cortesía del producto (vuelve a su precio, impuestos recalculados) |

**Autorización remota por WhatsApp** (igual que las anulaciones, ver `void-authorizations.md`): en lugar de
escribir la contraseña en el equipo, se pide `POST /void-authorizations` con `{ type: 'courtesy', orderId }` (pedido
completo) o `{ type: 'courtesy', orderId, orderItemId }` (un producto); el supervisor con `seguridad.autorizar_cortesia`
aprueba en su celular y le pasa un código de 6 dígitos al cajero, que lo envía en `authCode` (o escrito en `password`).
El código es de esa cortesía y de quien la pidió, vence a los 30 min y se consume al registrarla.

Errores: 403 contraseña o código inválido; 422 motivo inválido, tope superado, pedido cerrado, con descuento o dividido.

## Documento interno de cortesía (`billing_documents.document_type = 'cortesia'`)
- Serie **CT01** por caja (código de comprobante `CORTESIA`), creada al primer uso. **No** se ofrece en el cobro
  (`available-types` la excluye) ni va a SUNAT.
- Total 0; `courtesy_amount` = valor de referencia y `courtesy_motivo`. Las líneas llevan su valor de referencia.
- **Producto suelto:** las líneas en cortesía **no** van al comprobante (boleta/factura/nota de venta); al emitirlo
  se emite también el documento de cortesía del pedido. Si todos los productos son cortesía, el cobro normal se
  rechaza: se usa la cortesía del pedido completo.
- **Anulación:** el documento de cortesía que acompaña a un comprobante no se anula solo (se anula con el
  comprobante). Anular la cortesía de un pedido regalado completo la deshace (líneas a su precio) y el pedido vuelve
  a pendiente de pago o se anula, como cualquier comprobante.

## Caja y reportes
- `GET /cash/sessions/:id` → `courtesies: { count, amount }`. Liquidación (`/cash/sessions/:id/liquidation`) →
  `courtesies[]` y `summary.courtesies`; liquidación por cajero → `courtesiesCount/courtesiesAmount`.
- No suman a ventas, al efectivo ni a los reportes de facturación (`emittedConditions` excluye `cortesia`).
  El registro de ventas solo lista 01/03/07 y notas de venta. El paloteo cuenta las cantidades (importe 0).
- Recibo: `meta.printValuedCourtesies` = activación de caja `print_valued_courtesies` (imprimir el valor de referencia).
