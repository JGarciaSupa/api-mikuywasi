# 📊 Tablas del Tenant — Análisis Completo

El schema está dividido en **4 archivos** y contiene **~40 tablas** en total.

Archivos fuente:
- `backend/src/db/tenant/schema/core.ts`
- `backend/src/db/tenant/schema/rbac.ts`
- `backend/src/db/tenant/schema/billing.ts`
- `backend/src/db/tenant/schema/warehouse.ts`

---

## 🏢 `core.ts` — Núcleo del Restaurante

| Tabla | Función |
|---|---|
| `lobito_prueba` | Tabla de prueba/test (puede eliminarse) |
| `tenant_configs` | Configuración única del restaurante: logo, colores, horarios, zona de delivery (GeoJSON), canales de atención (delivery/pickup/dine-in), tarifas y datos fiscales |
| `users` | Usuarios operativos del sistema con roles: `admin`, `kitchen`, `waiter`, `delivery` |
| `refresh_tokens` | Tokens JWT de refresco por usuario/dispositivo. Almacena hash, IP, user-agent y estado de revocación |
| `payment_methods` | Catálogo de métodos de pago (Yape, Efectivo, Visa, etc.) |
| `restaurant_tables` | Mesas físicas del local, cada una con un `slug` único para generar el QR |
| `categories` | Categorías del menú con disponibilidad por horario y días de la semana |
| `products` | Productos del menú con precio, descuento, cargos de empaque y variantes (`alternatives`) |
| `orders` | Pedidos completos: cliente, tipo (delivery/pickup/dine-in), estado del pedido y pago, repartidor asignado |
| `order_items` | Líneas de cada pedido con producto, cantidad, variantes seleccionadas y precio total |
| `banners` | Imágenes de banner para la webapp del cliente |
| `social_links` | Links de redes sociales del restaurante (Facebook, Instagram, etc.) |

---

## 🛡️ `rbac.ts` — Control de Acceso por Roles

| Tabla | Función |
|---|---|
| `permissions_catalog` | Copia local del catálogo de permisos sincronizado desde la BD Master (por `masterSubActionId`) |
| `roles` | Roles del tenant, pueden ser clon de un rol base master o personalizados (`isCustom`) |
| `role_permissions` | Tabla pivote que asigna permisos del catálogo a roles |
| `user_roles` | Asigna **un único rol** a cada usuario |
| `user_permission_overrides` | Sobrescritos por usuario: `grant` amplía permisos del rol, `deny` los restringe (fórmula: `(role ∪ grants) − denies`) |

---

## 🧾 `billing.ts` — Facturación

| Tabla | Función |
|---|---|
| `billing_series` | Series de documentos de venta (Factura/Boleta/Nota de Venta), controla el correlativo, IGV y si el precio ya lo incluye |
| `billing_documents` | Documentos de venta emitidos: datos del comprador (RUC/DNI), montos, estado (`draft/issued/voided`) |
| `billing_document_lines` | Líneas de cada documento: producto, cantidad, precio, IGV y cargo de empaque |

---

## 🏬 `warehouse.ts` — Almacén (el módulo más grande)

### Catálogo base

| Tabla | Función |
|---|---|
| `item_families` | Familias/grupos de insumos (Ej: Carnes, Verduras) |
| `storage_areas` | Áreas de almacenamiento: ambiente, frío, congelado, sub-almacén |
| `suppliers` | Proveedores con RUC, datos de contacto |
| `measurement_units` | Unidades de medida con factor de conversión a unidad base |
| `items` | **Maestro de insumos**: código, stock actual, stock mínimo, precio promedio, unidades de conteo/costo, control de vencimiento |
| `item_area_assignments` | Qué insumos están disponibles en qué áreas |

### Movimientos de entrada

| Tabla | Función |
|---|---|
| `purchase_documents` | Documentos de compra (facturas/guías) de proveedores con impuesto, moneda y tipo de operación |
| `purchase_document_lines` | Líneas de cada compra: insumo, cantidad, precio unitario, IGV y descuento |

### Movimientos internos

| Tabla | Función |
|---|---|
| `requisitions` / `requisition_lines` | Pedidos internos de un área al almacén central |
| `stock_transfers` / `stock_transfer_lines` | Traslados de stock entre áreas (puede estar asociado a una requisición) |
| `stock_exits` / `stock_exit_lines` | Salidas de stock: consumo, merma, control de calidad, devolución al cliente, etc. |
| `portionings` / `portioning_lines` | Procesamiento de un insumo origen → múltiples porciones destino, registrando merma |
| `inventory_adjustments` / `adjustment_lines` | Ajustes de inventario físico vs. sistema (cierre de kardex) |

### Kardex y snapshots

| Tabla | Función |
|---|---|
| `main_ledger` | Kardex **global** del restaurante: registro de todos los movimientos de entrada/salida con stock acumulado |
| `area_ledger` | Kardex **por área**: mismo concepto pero segmentado por zona de almacenamiento |
| `purchase_price_history` | Histórico de precios de compra por insumo y proveedor |
| `stock_snapshot` | Snapshot del stock actual por ítem+área: stock, precio promedio y valor total |
| `waste_log` | Log derivado de portionings para análisis de merma por ítem, área y familia |

### Recetas y descarga por ventas

| Tabla | Función |
|---|---|
| `recipes` / `recipe_lines` | Recetas de productos del menú: qué insumos y en qué cantidad se necesitan por porción |
| `batches` | Lotes de insumos con fecha de vencimiento y estado (`active/expiring_soon/expired/depleted`) |
| `sales_discharge` / `sales_discharge_lines` | Descarga automática de insumos al procesar un pedido, usando las recetas de los productos vendidos |

### Caja

| Tabla | Función |
|---|---|
| `cash_sessions` | Sesiones de caja con saldo apertura/cierre, totales y diferencia |
| `cash_movements` | Movimientos de caja: ingreso, gasto, retiro o depósito, opcionalmente vinculados a un pedido |

### Soporte

| Tabla | Función |
|---|---|
| `system_settings` | Configuraciones clave-valor del sistema (key-value store) |
| `audit_log` | Log de auditoría de todas las operaciones (INSERT/UPDATE/DELETE/VOID etc.) con datos antes/después |

---

## 🔗 Relaciones clave

```
orders ──→ order_items ──→ products ──→ categories
orders ──→ sales_discharge ──→ sales_discharge_lines ──→ items (via recipes)
purchase_documents ──→ purchase_document_lines ──→ items ──→ main_ledger / area_ledger
users ──→ user_roles ──→ roles ──→ role_permissions ──→ permissions_catalog
```

---

## 📝 Resumen

Es un sistema **multi-módulo robusto** con:
- **Contabilidad de inventario en tiempo real** (Kardex global y por área)
- **Recetas** que descargan insumos automáticamente al vender
- **RBAC granular** con sobrescritos por usuario
- **Facturación integrada** (Boleta/Factura/Nota de Venta)
- **Trazabilidad completa** vía `audit_log`
