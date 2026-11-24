# Autorización remota de anulaciones (WhatsApp)

Permite anular un **pedido completo**, un **producto ya enviado** o un **comprobante** con un código de 6 dígitos que genera un supervisor desde su celular, como alternativa a escribir su contraseña en el equipo. Mismo modelo que la autorización remota del cierre de turno (`/cash-terminals/close-requests`).

Tabla: `void_authorizations` (migración tenant `0103_create_void_authorizations`). El token del enlace y el código solo se guardan como hash SHA-256; vencen a los 30 minutos y la solicitud se bloquea a los 5 intentos fallidos.

## Cuándo se exige autorización

| Anulación | Sin permiso | Con permiso |
|---|---|---|
| Pedido (`POST /waiter/orders/:id/cancel`) | Sin `mozo.cancelar_pedido` ni `pedidos.anular`: **siempre** (antes respondía 403) | Si la caja tiene `PASSWORD_DELETE_ORDER` y el usuario no tiene `seguridad.anular_sin_contrasena` |
| Producto enviado (`POST /waiter/orders/:id/items/:itemId/annul`) | No hay permiso específico | Si la caja tiene `PASSWORD_DELETE_PRODUCT` y el usuario no tiene `seguridad.anular_sin_contrasena` |
| Comprobante (`POST /billing/documents/:id/void`) | Sin `facturacion.anular`: **siempre** | Si la caja tiene `PASSWORD_VOID_DOCUMENT` y el usuario no tiene `seguridad.anular_sin_contrasena` |

En los tres endpoints, el body acepta además `authCode` (string de 6 dígitos). Se prueba primero el código (debe ser de esa misma anulación y de quien la pidió; se consume al usarlo) y luego `password`.

Quién aprueba (contraseña en el enlace): usuarios con `seguridad.autorizar_eliminar_pedido` (pedido), `seguridad.autorizar_eliminar_producto` (producto) o `seguridad.autorizar_anular_documento` (comprobante), y siempre `rol_admin`.

## POST `/api/admin/void-authorizations` (con sesión)

Crea la solicitud. Cualquier usuario autenticado.

```json
{ "type": "order" | "item" | "document", "orderId": "abc123", "orderItemId": 15, "documentId": 42, "motivo": "Cliente se retiró", "quantity": 1 }
```
- `order`: `orderId`. `item`: `orderId` + `orderItemId` (+ `quantity` opcional). `document`: `documentId`.

`201 { success: true, data: { id, requestToken, expiresAt } }` — el admin arma el enlace `/autorizar-anulacion?r=<requestToken>`.

## GET `/api/admin/void-authorizations/:token` (público)

`{ success: true, data: { type, status: 'pending'|'approved'|'used'|'locked'|'expired', expiresAt, branchName, requestedByName, summary: { orderNumber?, tableName?, productName?, quantity?, documentNumber?, amount?, motivo? } } }`

## POST `/api/admin/void-authorizations/:token/approve` (público, 15 intentos / 15 min por IP)

Body `{ "password": "..." }` → `{ success: true, data: { code, expiresAt, approvedByName } }`. El código solo se muestra esta vez.

Errores: 403 contraseña incorrecta (quedan N intentos), 409 ya aprobada/usada, 410 vencida, 423 bloqueada.
