# RBAC del tenant y permisos reservados al implementador

**Base URL:** `/api/rbac` (roles, permisos de usuario) · todas las rutas requieren `authMiddleware`.

## Roles base

| Código | Uso |
|---|---|
| `rol_admin` | **Implementador.** Tiene todos los permisos y la API lo deja pasar siempre (`requirePermission`). |
| `rol_admin_local` | **Administrador del local** (cliente). Todos los permisos salvo los reservados. |
| `rol_cajero`, `rol_mozo`, `rol_cocinero`, `rol_almacenero` | Roles operativos (ver `src/scripts/seed-master-rbac.ts`). |

Los roles base se definen en el master y llegan a cada tenant al sincronizar (`POST /api/master/rbac/tenants/:tenantId/sync`). Su lista de permisos se reconstruye en cada sincronización.

## Permisos reservados al implementador

Definidos en `src/utils/reserved-permissions.ts`:

`menu.importar_productos`, `menu.gestionar_estaciones`, `administracion.impresoras`, `administracion.auditoria`, `administracion.parametros`, `administracion.ver_sucursales`, `administracion.gestionar_sucursales`, `administracion.canales_venta`, `administracion.ajustes_sistema`, `facturacion.gestionar_series`, `facturacion.gestionar_certificado`.

Reglas (las aplica `services/admin/users/rbac.service.ts`; si quien llama no es `rol_admin`):

- No puede **otorgar** permisos reservados nuevos en roles propios ni como permiso suelto (`grant`). Puede conservar los que ya tenían o quitarlos.
- No puede **asignar** `rol_admin` a un usuario (ni por `/rbac/user-roles` ni por alta/edición de personal).
- No puede modificar, quitar el rol, cambiar permisos sueltos ni eliminar a un usuario `rol_admin`.
- No puede editar ni eliminar **roles base** (`isCustom = false`); sí los roles propios del tenant.

Error: `400 { success: false, message: "Solo el implementador puede …" }`.

## Endpoints de RBAC

| Método y ruta | Permiso |
|---|---|
| `GET /catalog`, `GET /roles`, `GET /roles/:id`, `GET /users/:userId/role`, `GET /users/:userId/overrides` | solo sesión |
| `POST /roles`, `PUT /roles/:id`, `DELETE /roles/:id` | `administracion.rbac` |
| `POST /user-roles`, `DELETE /user-roles/:userId` | `administracion.rbac` |
| `PUT /users/:userId/overrides`, `DELETE /users/:userId/overrides/:permCatalogId` | `administracion.rbac` |

## Otros endpoints con permiso nuevo

| Endpoint | Permiso |
|---|---|
| `GET /api/dashboard/tenant-stats` (Inicio) | `administracion.ver_inicio` |
| `POST/PATCH/DELETE /api/printers` | `administracion.impresoras` (la lectura `GET` sigue abierta: la usan POS, caja y facturación para imprimir) |
| `GET /api/audit`, `GET /api/audit/facets` | `administracion.auditoria` |
| `GET /api/products/import/capacity`, `POST /api/products/import`, `POST /api/products/import/:id/image` | `menu.importar_productos` |
| `POST /api/staff`, `PATCH /api/staff/:id`, `DELETE /api/staff/:id` | `administracion.gestionar_personal` (el listado `GET /api/staff` sigue abierto: lo usan POS, almacén y RBAC) |
| `GET /api/staff/reports/ranking` y `GET /api/staff/reports/summary?userId=` de **otro** usuario | `administracion.ver_personal` (sin `userId` cada uno ve su propio reporte) |
| `POST /api/branches`, `DELETE /api/branches/:id` | `administracion.gestionar_sucursales` |
| `PATCH /api/branches/:id`, `POST/DELETE /api/branches/:id/facturacion`, `POST /api/branches/:id/facturacion/reuse` | `administracion.parametros` **o** `administracion.gestionar_sucursales` (las lecturas siguen abiertas) |
| `POST /api/waiter/orders/:id/cancel` (anular pedido completo) | `mozo.cancelar_pedido` **o** `pedidos.anular` |

## Pedidos: anular y operar pedidos de otros

- `POST /api/waiter/orders/:id/cancel` — body opcional `{ reasonId?, motivo?, password? }` (motivo de catálogo y contraseña según las activaciones `ORDER_DELETE_REASON_CATALOG` / `PASSWORD_DELETE_ORDER` de la caja abierta de **quien anula**; sin caja abierta, motivo libre y sin contraseña).
  - Rechaza (400) pedidos cancelados, completados, transferidos a caja o con un comprobante **emitido** (factura, boleta o nota de venta que no sea nota de crédito): "El pedido tiene el comprobante X emitido: anúlalo primero desde Documentos y luego podrás anular el pedido". Al anular el comprobante (`POST /api/billing/documents/:id/void`) con `cancelOrder: false` el pedido vuelve a `confirmed`/`unpaid`: se puede refacturar o, ya sin comprobante vigente, anular con este endpoint.
  - Revierte la descarga de almacén, el stock de productos y el ingreso de caja, y marca `status = 'cancelled'` con motivo, usuario y autorización.
- `pedidos.operar_otros` (sin endpoint propio): el panel deja retomar en el POS, cobrar y refacturar pedidos de otro usuario o de otra caja/turno. La API ya lo permitía: el cobro entra en la sesión de quien cobra (`collectedSessionId`) y el pedido conserva su turno de origen (`cashSessionId`) para los reportes de ventas.
- Anular comprobante **y** pedido en un paso: `POST /api/billing/documents/:id/void` con `cancelOrder: true` (casilla "Anular también el pedido" en Documentos, desmarcada por defecto).
  - Exige `pedidos.anular` **o** `mozo.cancelar_pedido` (403 si no). `rol_admin` pasa siempre.
  - Rechaza (400) si el pedido tiene **otro** comprobante emitido que no sea nota de crédito (cuentas divididas). La validación ocurre antes de emitir la NC o tocar la caja.
  - El pedido queda `cancelled` (revierte descarga y stock) con `motivo` (máx. 200), `deletedDate`, `deletedById` y `authorizedById`, igual que la anulación desde el POS.
- Modo auditoría de `pedidos.operar_otros` (no bloquea): si un usuario **sin** ese permiso cobra (`POST /api/waiter/orders/:id/payments`), cobra una cuenta dividida (`PATCH .../:orderId/splits/:splitId/payment`) o emite comprobante (`POST /api/billing/documents`) sobre un pedido que no es suyo (no es el mozo, ni el dueño de la caja de origen, ni su caja abierta es la de origen o la de transferencia), y la operación responde OK, se registra en `audit_log` (módulo `pedidos`, `orderId` en `afterData`). Sirve para medir el uso real antes de decidir si se bloquea.

## Exportar catálogos (acta de validación)

- `menu.exportar_productos` y `almacen.exportar_insumos`: muestran el botón "Exportar" (Excel / PDF) en Productos e Insumos. No tienen endpoint propio: el panel genera el archivo con los listados existentes (`GET /api/products`, `GET` de insumos), que siguen protegidos por sus permisos de lectura. Por defecto solo los tienen `rol_admin` y `rol_admin_local` (no son reservados); se pueden dar a otros roles desde RBAC.

## Catálogo: `isReserved` y `grantable`

`GET /api/rbac/catalog` añade a cada sub-acción `isReserved` (permiso del implementador) y `grantable` (quien consulta puede otorgarlo: siempre `true` para `rol_admin`). El panel los usa para marcar "Reservado" y deshabilitar el permiso.

## Ampliar permisos del cliente (implementador)

- **Rol propio** del tenant con los permisos que se quieran (recomendado): no lo toca la sincronización.
- **Permiso suelto** al usuario (`grant`): se conserva al sincronizar.
- **Editar el rol base** `rol_admin_local` dentro del tenant **no es permanente**: cada sincronización reconstruye los permisos de los roles base desde el master.

## Seed RBAC (`src/scripts/seed-master-rbac.ts`)

Por defecto solo otorga a los tenants (y añade a los roles base) las sub-acciones y roles **creados en esa ejecución**, para no re-otorgar lo que el super admin quitó. `bun run src/scripts/seed-master-rbac.ts --grant-all` recupera el comportamiento anterior (otorgar todo a todos).

`requirePermission` lee los permisos del token: tras sincronizar los permisos nuevos, los usuarios deben volver a iniciar sesión (o refrescar el token) para recibirlos.
