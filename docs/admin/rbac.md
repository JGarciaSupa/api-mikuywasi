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

`requirePermission` lee los permisos del token: tras sincronizar los permisos nuevos, los usuarios deben volver a iniciar sesión (o refrescar el token) para recibirlos.
