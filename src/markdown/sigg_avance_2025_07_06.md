# SIGG — Avance de sesión (2026-07-06)

> Resumen de lo implementado, decidido y encontrado durante esta sesión de trabajo sobre
> el backlog SIGG (Fase 2, puntos 2.5/2.6/2.7) y el arreglo de bugs preexistentes que
> aparecieron al probarlo en vivo.

## Estado por punto del backlog

| Punto | Estado | Detalle |
|---|---|---|
| 2.5 Catálogo Maestro y Modificadores (Operadores/Propiedades) | **Solo análisis, sin código** | Se determinó que `productExtraGroups`/`productExtras` ya cubren el caso de negocio; falta agregar `sourceType: 'none'` al enum. Ver `us_1_5_operadores_propiedades_guia.md`. Lo implementa otro desarrollador. |
| 2.6 Catálogo Maestro de Canales de Venta | ✅ **Implementado y verificado** | Catálogo `sales_channels` (tenant) + activación por sucursal `branch_channels`. |
| 2.7 Áreas de Producción Lógicas y Ruteo | ✅ **Implementado y verificado** (Etapa 1 + 2) | Catálogo `kitchen_stations` + asignación producto↔estación + filtrado real en la pantalla de Cocina + confirmación por estación. |

---

## 2.6 — Canales de Venta

**Backend** (`api-mikuywasi`):
- Tabla `sales_channels` (tenant): `name`, `code` único, `type` (`dine_in`/`delivery`/`pickup`), `isActive`.
- Tabla pivote `branch_channels`: qué canales están activos en cada sucursal (presencia de fila = activo, sin booleano redundante).
- CRUD completo en `/sales-channels`, más `branchId`/`channelId` sync integrado en el update de `branches` (`channelIds: number[]` en el payload).
- **Regla de seguridad clave**: el catálogo filtra por `isActive: true` antes de exponer canales a una sucursal — un canal desactivado a nivel corporación desaparece de todas las sedes y no puede reactivarse desde ahí (bug encontrado y corregido en vivo).

**Frontend** (`admin-mikuywasi`):
- Página standalone `/dashboard/sales-channels` (catálogo, CRUD).
- Tab "Canales de Venta" de la sucursal (`BranchDetailPage.tsx`) ya no usa los 4 booleanos fijos (`hasDineIn/hasDelivery/hasPickup/hasLiveTracking`) — lista el catálogo real con toggles dinámicos. "Rastreo GPS" se movió fuera de la lista de canales (no es un canal, es una capacidad de Delivery).
- Migración con backfill automático desde los booleanos viejos (`0035`, `0036`).

---

## 2.7 — Estaciones de Cocina y Ruteo

**Backend**:
- Tabla `kitchen_stations` (tenant): catálogo simple (`name`, `code`, `isActive`). Nombrada así — no "áreas de producción" — para no chocar con `storage_areas`/`branch_recipe_areas` que ya usaban ese término para almacén/inventario.
- Pivote `product_kitchen_stations`: a qué estación(es) se enruta cada producto. Se asigna desde el propio modal de Producto (mismo patrón que "Grupos de Extras": badges + dropdown, asignación en vivo).
- `kitchen.service.ts` enriquece cada `order_item` con `stationIds: number[]` (vacío = sin asignar, fail-open).
- Tabla `order_station_confirmations`: cada estación confirma su parte del pedido por separado; el pedido completo pasa a `ready_for_pickup` recién cuando **todas** las estaciones que tocó confirmaron.

**Frontend**:
- Página standalone `/dashboard/store/kitchen-stations` (catálogo, CRUD).
- Selector de "Estación activa" persistente en la pantalla de Cocina (`useKitchenStationStore`, mismo patrón que el selector de Sede) — se elige una vez, no por pedido.
- La tarjeta de pedido muestra solo los ítems de la estación activa + los sin asignar (con badge de advertencia), nunca los oculta del todo.
- Botón "Marcar Listo" adaptado: pedido de 1 estación (o ninguna) = botón simple de siempre; pedido multi-estación = cada estación confirma su parte, con mensaje de "esperando a: [estaciones pendientes]".

### Bug encontrado en vivo y corregido
Primera versión: se **bloqueaba por completo** el botón "Marcar Listo" en cualquier pedido multi-estación (sin forma de confirmarlo nunca). Como casi todo pedido real tiene bebida + comida, esto dejaba la cocina completamente trabada. Se corrigió con el mecanismo de confirmación por estación descrito arriba — verificado por API: Cocina Caliente confirma primero (pedido sigue "preparing"), Bar confirma después (última estación pendiente → pedido pasa a "listo" y desaparece de la cola).

---

## Bugs preexistentes encontrados (no relacionados a este trabajo, corregidos de paso)

- **`MenuPage.tsx`**: chequeaba el permiso `pedidos.crear`, que **nunca existió** en el catálogo RBAC — nadie, ni un admin, podía crear pedidos desde ahí. Corregido a `mozo.crear_pedido` (el permiso real, ya otorgado).
- **Migración `0034_brands_table.sql`** (de un compañero): nunca se registró en `drizzle/tenant/meta/_journal.json`, lo que hacía que `drizzle-kit generate` intentara recrear `brands` desde cero de forma destructiva (`DROP TABLE tenant_configs CASCADE`). Se descartó esa regeneración y se siguió escribiendo las migraciones a mano, numeradas después de la 0034 — **pendiente que el equipo reconcilie el journal** para que `drizzle-kit generate` vuelva a funcionar sin este problema.
- **`TenantGuard.tsx`** solo leía `?tenant=` en la URL, no `?slug=` (que sí reconocía `axios.ts`) — causaba "Tenant no encontrado" con URLs válidas. Se unificó, y se agregó fallback de modo DEV (`VITE_DEV_TENANT_SLUG`) para entrar a `localhost` pelado sin query params.
- Cada vez que se corre `master:seed-rbac` (necesario al agregar un permiso nuevo al catálogo), **se limpia `user_roles`** — hay que reasignar el rol manualmente después. Pasó dos veces en esta sesión.

---

## Migraciones pendientes de aplicar (fuera de la BD local de pruebas)

Generadas y verificadas localmente, **no aplicadas** a ningún entorno compartido:

```
0035_sales_channels_table.sql
0036_branch_channels_table.sql
0037_kitchen_stations_tables.sql
0038_order_station_confirmations.sql
```

Todas son aditivas (crean tablas nuevas o agregan columnas con default), sin riesgo de pérdida de datos.

---

## Entorno de pruebas local

- Backend: `http://localhost:4001` (DATABASE_URL apunta a Postgres local, no a producción).
- Panel Cliente (`admin-mikuywasi`): `http://localhost/login` → `admin` / `admin123` (Corporación Demo SIGG).
- Super Admin (`restaurante-super-admin`): `http://localhost:5173/login` → `devrenatonavarro` / `12345678`.

---

## Pendiente / fuera de alcance de esta sesión

- 2.5 (Operadores y Propiedades) — análisis entregado, implementación de otro desarrollador.
- Sobrecargo de precio por canal (`Local_Producto_Canal`) — mencionado en el documento original, no se tocó.
- `orders.deliveryType` sigue siendo el enum fijo (`delivery`/`pickup`/`dine_in`) — no se migró a FK hacia `sales_channels` (se evaluó y se decidió no tocar una tabla transaccional con datos reales sin necesidad inmediata).
- Reconciliar el `_journal.json` de drizzle-kit con la migración `0034` del equipo.
- Corporación/Marca a nivel jerárquico completo (lo lleva otro desarrollador, se mantuvo scope a nivel Tenant en todo lo construido acá).
