# ROADMAP DE MEJORAS — api-mikuywasi
> Análisis del estado actual vs. la arquitectura objetivo definida en `mejoras.md`

---

## RESUMEN EJECUTIVO

El proyecto actualmente tiene una base sólida: multi-tenancy con BD por cliente, autenticación JWT con refresh tokens, módulo de warehouse complejo, RBAC y subida de archivos a R2. Sin embargo, la visión objetivo requiere una expansión significativa en varias áreas clave que hoy son simples o directamente inexistentes.

**Estado general:** ~35% de la arquitectura objetivo está implementada.

---

## PARTE 1 — GAPS EN SUPER_ADMIN_DB (Master)

### Lo que existe hoy
| Tabla actual | Equivalente en mejoras.md | Estado |
|---|---|---|
| `users` | `super_users` | Parcial — falta `last_login_at`, no usa `super_roles` separada |
| (enum en users) | `super_roles` | ❌ No existe como tabla independiente |
| `tenants` | `saas_customers` | Parcial — falta `legal_name`, `tax_id`, `timezone` |
| `db_servers` | `customer_databases` | Parcial — `db_servers` modela la infraestructura, no la BD del cliente específicamente |
| `plans` | `plans` | Parcial — usa JSONB para features; el objetivo los expande como columnas booleanas explícitas |
| `subscriptions` | `customer_subscriptions` | Parcial — falta `billing_cycle`, `auto_renew`, `next_billing_date` |
| `tickets` | `support_tickets` | Parcial — falta `priority`, `assigned_to`, `user_id` como FK a `customer_users` |
| `auditlogs` | `admin_audit_logs` | Parcial — falta `module`, `table_name`, `record_id`, `old_values`/`new_values` JSONB |

### Tablas completamente faltantes en Master

#### 1. `customer_usage` — Uso mensual por cliente
```sql
CREATE TABLE customer_usage (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES tenants(id),
    month DATE NOT NULL,          -- YYYY-MM-01
    branches_count INT DEFAULT 0,
    users_count INT DEFAULT 0,
    orders_count INT DEFAULT 0,
    invoices_count INT DEFAULT 0,
    storage_used_gb DECIMAL(10,2) DEFAULT 0,
    api_calls_count INT DEFAULT 0,
    calculated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_customer_usage_tenant_month ON customer_usage(customer_id, month);
```
**Para qué sirve:** Reportes de facturación por uso real. Requerido para planes con límites mensuales (500 facturas/mes, X órdenes/mes).

#### 2. `customer_limits_cache` — Caché de contadores actuales
```sql
CREATE TABLE customer_limits_cache (
    customer_id INT PRIMARY KEY REFERENCES tenants(id),
    branches_used INT DEFAULT 0,
    users_used INT DEFAULT 0,
    cash_registers_used INT DEFAULT 0,
    tables_used INT DEFAULT 0,
    invoices_month_used INT DEFAULT 0,
    current_month DATE,
    last_updated_at TIMESTAMP DEFAULT NOW()
);
```
**Para qué sirve:** Validación rápida de límites del plan SIN hacer JOINs complejos. Cada vez que se crea una sucursal/caja/usuario en el tenant, se actualiza este contador.

#### 3. `customer_users` — Caché de usuarios del tenant (para soporte)
```sql
CREATE TABLE customer_users (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES tenants(id),
    external_user_id INT,         -- ID en TENANT_DB
    email VARCHAR(100),
    role_name VARCHAR(50),
    branch_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_customer_users_customer_email ON customer_users(customer_id, email);
```
**Para qué sirve:** El equipo de soporte puede ver los usuarios del restaurante sin conectarse a su BD individual.

#### 4. `ticket_messages` — Mensajes en tickets de soporte
```sql
CREATE TABLE ticket_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL,  -- customer, support
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id, created_at);
```

#### 5. `password_resets` — Recuperación de contraseñas de tenants
```sql
CREATE TABLE password_resets (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES tenants(id),
    user_id INT NOT NULL,
    reset_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_password_resets_token ON password_resets(reset_token);
```

### Cambios requeridos en tablas existentes de Master

```sql
-- plans: agregar columnas de límites y features explícitas
ALTER TABLE plans ADD COLUMN max_branches INT;
ALTER TABLE plans ADD COLUMN max_users INT;
ALTER TABLE plans ADD COLUMN max_cash_registers INT;
ALTER TABLE plans ADD COLUMN max_tables INT;
ALTER TABLE plans ADD COLUMN max_invoices_month INT;
ALTER TABLE plans ADD COLUMN max_orders_month INT;
ALTER TABLE plans ADD COLUMN max_storage_gb INT;
ALTER TABLE plans ADD COLUMN has_unlimited_users BOOLEAN DEFAULT false;
ALTER TABLE plans ADD COLUMN has_multi_branch BOOLEAN DEFAULT false;
ALTER TABLE plans ADD COLUMN has_inventory BOOLEAN DEFAULT false;
ALTER TABLE plans ADD COLUMN has_delivery BOOLEAN DEFAULT false;
ALTER TABLE plans ADD COLUMN has_api_access BOOLEAN DEFAULT false;
ALTER TABLE plans ADD COLUMN has_custom_reports BOOLEAN DEFAULT false;
ALTER TABLE plans ADD COLUMN has_advanced_logistics BOOLEAN DEFAULT false;
ALTER TABLE plans ADD COLUMN billing_cycle VARCHAR(20);  -- monthly, yearly
ALTER TABLE plans ADD COLUMN price_yearly DECIMAL(10,2);

-- tenants: agregar campos SaaS
ALTER TABLE tenants ADD COLUMN legal_name VARCHAR(200);
ALTER TABLE tenants ADD COLUMN tax_id VARCHAR(50);
ALTER TABLE tenants ADD COLUMN timezone VARCHAR(50);

-- subscriptions: agregar campos de facturación
ALTER TABLE subscriptions ADD COLUMN billing_cycle VARCHAR(20);
ALTER TABLE subscriptions ADD COLUMN auto_renew BOOLEAN DEFAULT true;
ALTER TABLE subscriptions ADD COLUMN next_billing_date DATE;

-- tickets: mejorar para soporte profesional
ALTER TABLE tickets ADD COLUMN priority VARCHAR(20) DEFAULT 'medium';
ALTER TABLE tickets ADD COLUMN assigned_to INT REFERENCES users(id);
ALTER TABLE tickets ADD COLUMN user_id INT REFERENCES customer_users(id);

-- users (master): agregar last_login_at
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;

-- auditlogs: expandir campos
ALTER TABLE auditlogs ADD COLUMN module VARCHAR(50);
ALTER TABLE auditlogs ADD COLUMN table_name VARCHAR(50);
ALTER TABLE auditlogs ADD COLUMN record_id INT;
ALTER TABLE auditlogs ADD COLUMN old_values JSONB;
ALTER TABLE auditlogs ADD COLUMN new_values JSONB;
ALTER TABLE auditlogs ADD COLUMN ip_address VARCHAR(45);
ALTER TABLE auditlogs ADD COLUMN user_agent TEXT;
```

---

## PARTE 2 — GAPS EN TENANT_DB

### Lo que existe hoy

| Tabla actual | Equivalente en mejoras.md | Estado |
|---|---|---|
| `tenant_configs` | `restaurant_config` | Parcial — estructura diferente |
| `users` | `users` | Parcial — falta `phone`, `image_path`, `default_branch_id` |
| `refresh_tokens` | (implícito) | OK |
| `categories` | `categories` | Parcial — falta `parent_id`, `branch_id`, `display_order` |
| `products` | `products` | Parcial — falta `sku`, estructura de variantes no existe |
| `orders` | `orders` | Parcial — falta mucho (ver abajo) |
| `order_items` | `order_items` | Parcial |
| `payment_methods` | `payment_methods` | Parcial — falta `code`, `requires_reference`, `is_cash`, `display_order` |
| `restaurant_tables` | `tables` | Parcial — sin zonas, pisos, estados separados |
| Warehouse module | Inventario | Diferente — el warehouse actual es más complejo pero diferente estructura |

### Módulos completamente faltantes en Tenant

---

#### MÓDULO: CONFIGURACIÓN AVANZADA

```sql
-- Tabla de settings clave-valor (permite configurar el restaurante sin migraciones)
CREATE TABLE restaurant_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    data_type VARCHAR(20) DEFAULT 'string',  -- string, number, boolean, json
    updated_at TIMESTAMP DEFAULT NOW()
);
-- Ejemplos de uso: tax_rate=18, allow_tips=true, print_auto=false, stock_alert_threshold=5
```

---

#### MÓDULO: SUCURSALES (Crítico para multi-branch)

**Completamente ausente.** El tenant actual asume una sola sucursal implícita.

```sql
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country CHAR(2),
    phone VARCHAR(20),
    email VARCHAR(100),
    is_main BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active',
    opening_time TIME,
    closing_time TIME,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE floors (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    level INT NOT NULL,
    display_order INT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Impacto en tablas existentes al agregar branches:**
- `users` → agregar `default_branch_id`
- `categories` → agregar `branch_id` (NULL = global)
- `orders` → ya tiene branch context implícito, pero debe FK a `branches`
- `restaurant_tables` → renombrar a `tables` y ligar a `branch_id` + `zone_id`

```sql
-- Tabla de asignación usuario-sucursales (many-to-many)
CREATE TABLE user_branches (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_user_branches_unique ON user_branches(user_id, branch_id);
```

---

#### MÓDULO: ROLES Y PERMISOS GRANULARES

El RBAC actual existe en master, pero el tenant necesita su propio sistema de permisos:

```sql
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    level INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    module VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    key VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_role_permissions_unique ON role_permissions(role_id, permission_id);
```

---

#### MÓDULO: CAJAS REGISTRADORAS Y SESIONES (Ausente)

```sql
CREATE TABLE cash_registers (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    floor_id INT REFERENCES floors(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_cash_registers_branch_code ON cash_registers(branch_id, code);

CREATE TABLE cash_sessions (
    id SERIAL PRIMARY KEY,
    cash_register_id INT NOT NULL REFERENCES cash_registers(id),
    opened_by INT NOT NULL REFERENCES users(id),
    closed_by INT REFERENCES users(id),
    opening_amount DECIMAL(10,2) NOT NULL,
    closing_amount DECIMAL(10,2),
    expected_amount DECIMAL(10,2),
    difference DECIMAL(10,2),
    opened_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'open',  -- open, closed, audited
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cash_transaction_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    affects_cash VARCHAR(20) NOT NULL,  -- increase, decrease, neutral
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cash_transactions (
    id SERIAL PRIMARY KEY,
    cash_session_id INT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
    transaction_type_id INT NOT NULL REFERENCES cash_transaction_types(id),
    payment_id INT,
    amount DECIMAL(10,2) NOT NULL,
    reference VARCHAR(100),
    notes TEXT,
    created_by INT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Lógica de negocio necesaria:**
- Validar que no exista sesión abierta antes de abrir una nueva
- Cálculo automático de `expected_amount` al cerrar
- Cierre "ciego" (no mostrar expected_amount al cajero, solo al admin)
- Alertas de descuadre de caja al gerente/admin

---

#### MÓDULO: MESAS MEJORADO (Refactor de `restaurant_tables`)

```sql
CREATE TABLE table_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    color_hex CHAR(7),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE table_zones (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    floor_id INT REFERENCES floors(id),
    name VARCHAR(100) NOT NULL,
    display_order INT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Migrar restaurant_tables → tables con más campos
CREATE TABLE tables (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    zone_id INT REFERENCES table_zones(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    capacity INT,
    qr_code_path VARCHAR(255),
    status_id INT NOT NULL REFERENCES table_statuses(id),
    position_x INT,
    position_y INT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

#### MÓDULO: VARIANTES DE PRODUCTOS Y MODIFICADORES (Ausente)

**El catálogo actual no soporta variantes (Personal/Mediano/Grande) ni modificadores (sin cebolla, extra queso).**

```sql
CREATE TABLE product_variants (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(50),   -- NULL si el producto es único
    sku VARCHAR(50),
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2),
    stock_quantity INT,
    is_default BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE price_history (
    id SERIAL PRIMARY KEY,
    product_variant_id INT NOT NULL REFERENCES product_variants(id),
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    reason VARCHAR(255),
    changed_by INT REFERENCES users(id),
    valid_from TIMESTAMP DEFAULT NOW(),
    valid_to TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE modifier_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    selection_type VARCHAR(20) NOT NULL,  -- single, multiple
    is_required BOOLEAN DEFAULT false,
    min_selections INT,
    max_selections INT,
    display_order INT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE modifier_options (
    id SERIAL PRIMARY KEY,
    modifier_group_id INT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    extra_price DECIMAL(10,2) DEFAULT 0,
    is_default BOOLEAN DEFAULT false,
    display_order INT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE product_modifier_groups (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    modifier_group_id INT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT false,
    display_order INT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

#### MÓDULO: PRECIOS POR SUCURSAL (Ausente)

```sql
CREATE TABLE branch_product_prices (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_variant_id INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    is_available BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_branch_prices ON branch_product_prices(branch_id, product_variant_id);
```

**Lógica necesaria:** Al cargar el menú por sucursal, hacer LEFT JOIN priorizando precio específico de la sucursal sobre el precio base de la variante.

---

#### MÓDULO: PEDIDOS MEJORADO (Refactor de `orders`)

**Cambios requeridos en `orders` existente:**
```sql
ALTER TABLE orders ADD COLUMN uuid UUID UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE orders ADD COLUMN branch_id INT REFERENCES branches(id);
ALTER TABLE orders ADD COLUMN order_type_id INT REFERENCES order_types(id);
ALTER TABLE orders ADD COLUMN status_id INT REFERENCES order_statuses(id);
ALTER TABLE orders ADD COLUMN waiter_id INT REFERENCES users(id);
ALTER TABLE orders ADD COLUMN payment_condition_id INT REFERENCES payment_conditions(id);
ALTER TABLE orders ADD COLUMN diner_id INT REFERENCES diners(id);
ALTER TABLE orders ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN tip_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN confirmed_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN completed_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN cancelled_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN created_from_device VARCHAR(100);
ALTER TABLE orders ADD COLUMN created_from_ip VARCHAR(45);
```

**Nuevas tablas de soporte:**
```sql
CREATE TABLE order_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    color_hex CHAR(7),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_item_modifiers (
    id SERIAL PRIMARY KEY,
    order_item_id INT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_option_id INT NOT NULL,
    quantity INT DEFAULT 1,
    extra_price DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_status_history (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status_id INT NOT NULL REFERENCES order_statuses(id),
    changed_by INT NOT NULL REFERENCES users(id),
    notes TEXT,
    changed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE payment_conditions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,  -- Contado, Crédito 15 días
    days_to_pay INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

#### MÓDULO: COCINA / KDS (Kitchen Display System) — Ausente

```sql
CREATE TABLE kitchen_stations (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    floor_id INT REFERENCES floors(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    station_type VARCHAR(20) NOT NULL,  -- kitchen, bar, grill, desserts
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE kitchen_station_categories (
    id SERIAL PRIMARY KEY,
    kitchen_station_id INT NOT NULL REFERENCES kitchen_stations(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE kitchen_ticket_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    color_hex CHAR(7),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE kitchen_tickets (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id),
    order_item_id INT REFERENCES order_items(id),
    kitchen_station_id INT NOT NULL REFERENCES kitchen_stations(id),
    status_id INT NOT NULL REFERENCES kitchen_ticket_statuses(id),
    assigned_to INT REFERENCES users(id),
    priority VARCHAR(20) DEFAULT 'normal',
    estimated_time INT,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Lógica necesaria:**
- Al confirmar una orden → auto-generar kitchen_tickets por categoría/estación
- KDS en tiempo real (WebSocket o polling de bajo intervalo)
- Encolar por prioridad (órdenes para llevar vs. para acá)

---

#### MÓDULO: IMPRESORAS — Ausente

```sql
CREATE TABLE printers (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    floor_id INT REFERENCES floors(id),
    kitchen_station_id INT REFERENCES kitchen_stations(id),
    name VARCHAR(100) NOT NULL,
    printer_type VARCHAR(20) NOT NULL,  -- fiscal, kitchen, receipt, label
    connection_type VARCHAR(20) NOT NULL, -- network, usb, bluetooth
    ip_address VARCHAR(15),
    port INT,
    model VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE printer_rules (
    id SERIAL PRIMARY KEY,
    printer_id INT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(id),
    order_type_id INT REFERENCES order_types(id),
    copies INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE printed_tickets (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id),
    cash_register_id INT REFERENCES cash_registers(id),
    printer_id INT NOT NULL REFERENCES printers(id),
    ticket_type VARCHAR(20) NOT NULL,  -- order, receipt, kitchen, invoice
    content_json TEXT,
    print_status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    printed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

#### MÓDULO: INVENTARIO — Refactor del Warehouse

El warehouse actual es un sistema más complejo orientado a almacén (con familias, subfamilias, requisiciones, transferencias entre áreas, etc.). El objetivo del `mejoras.md` plantea un inventario más ligado a recetas de cocina y descuento automático por venta.

**Opción recomendada:** Mantener el warehouse actual como módulo avanzado y agregar las siguientes tablas para el flujo operativo básico:

```sql
CREATE TABLE measurement_units (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    abbreviation VARCHAR(10) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ingredient_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ingredients (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES ingredient_categories(id),
    name VARCHAR(100) NOT NULL,
    measurement_unit_id INT NOT NULL REFERENCES measurement_units(id),
    cost_per_unit DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ingredient_stock (
    id SERIAL PRIMARY KEY,
    ingredient_id INT NOT NULL REFERENCES ingredients(id),
    branch_id INT NOT NULL REFERENCES branches(id),
    current_stock DECIMAL(10,2) DEFAULT 0,
    minimum_stock DECIMAL(10,2) DEFAULT 0,
    maximum_stock DECIMAL(10,2),
    last_restock_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_ingredient_stock_unique ON ingredient_stock(ingredient_id, branch_id);

CREATE TABLE inventory_movement_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    affects_stock VARCHAR(20) NOT NULL,  -- increase, decrease, neutral
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE inventory_movements (
    id SERIAL PRIMARY KEY,
    ingredient_id INT NOT NULL REFERENCES ingredients(id),
    branch_id INT NOT NULL REFERENCES branches(id),
    movement_type_id INT NOT NULL REFERENCES inventory_movement_types(id),
    quantity DECIMAL(10,2) NOT NULL,
    cost_per_unit DECIMAL(10,2),
    total_cost DECIMAL(10,2),
    reference VARCHAR(100),
    notes TEXT,
    moved_by INT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Recetas: qué ingredientes necesita cada variante de producto
CREATE TABLE recipes (
    id SERIAL PRIMARY KEY,
    product_variant_id INT NOT NULL,
    ingredient_id INT NOT NULL REFERENCES ingredients(id),
    quantity_needed DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_recipes_unique ON recipes(product_variant_id, ingredient_id);
```

**Lógica necesaria:**
- Al confirmar pago de una orden → leer `recipes` por cada `order_item` → descontar `ingredient_stock` por `branch_id`
- Alertas automáticas cuando `current_stock <= minimum_stock`
- Bloquear/alertar venta si stock en cero (configurable)

---

#### MÓDULO: DELIVERY — Ausente

```sql
CREATE TABLE delivery_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    commission_rate DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE delivery_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE deliveries (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id),
    delivery_type_id INT NOT NULL REFERENCES delivery_types(id),
    status_id INT NOT NULL REFERENCES delivery_statuses(id),
    driver_id INT REFERENCES users(id),
    driver_name VARCHAR(100),
    driver_phone VARCHAR(20),
    pickup_time TIMESTAMP,
    delivery_time TIMESTAMP,
    delivery_address TEXT,
    delivery_latitude DECIMAL(10,8),
    delivery_longitude DECIMAL(11,8),
    delivery_fee DECIMAL(10,2),
    estimated_time INT,
    tracking_url VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

#### MÓDULO: FACTURACIÓN ELECTRÓNICA — Refactor/Expansión

**El sistema de pagos actual en `payment_methods` y `orders` no tiene facturación electrónica.**

```sql
CREATE TABLE document_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL,
    sunat_code VARCHAR(10),  -- Código SUNAT/SAT según país
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE invoice_series (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id),
    document_type_id INT NOT NULL REFERENCES document_types(id),
    series CHAR(4) NOT NULL,
    next_number INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_invoice_series_unique ON invoice_series(branch_id, document_type_id, series);

CREATE TABLE invoice_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id),
    series_id INT NOT NULL REFERENCES invoice_series(id),
    invoice_number INT NOT NULL,
    full_number VARCHAR(20),       -- B001-00001
    status_id INT NOT NULL REFERENCES invoice_statuses(id),
    is_internal BOOLEAN DEFAULT false,
    exchanged_from_id INT REFERENCES invoices(id),
    is_exchange BOOLEAN DEFAULT false,
    customer_name VARCHAR(200),
    customer_tax_id VARCHAR(20),
    customer_address TEXT,
    customer_email VARCHAR(100),
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    xml_path VARCHAR(255),
    pdf_path VARCHAR(255),
    sunat_cdr_path VARCHAR(255),
    sunat_hash VARCHAR(100),
    issued_at TIMESTAMP DEFAULT NOW(),
    voided_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Canje: Nota de Venta → Factura
CREATE TABLE document_exchanges (
    id SERIAL PRIMARY KEY,
    original_invoice_id INT NOT NULL REFERENCES invoices(id),
    new_invoice_id INT NOT NULL REFERENCES invoices(id),
    exchange_reason TEXT,
    exchanged_by INT NOT NULL REFERENCES users(id),
    exchanged_at TIMESTAMP DEFAULT NOW()
);
```

**Lógica necesaria:**
- Número correlativo por sucursal (NO global) — cada sucursal tiene su serie
- Bloquear brechas en numeración (correlativo estricto)
- Proceso de canje con anulación de documento original
- Integración con SUNAT (Perú) o SAT (México) según `country` del tenant

---

#### MÓDULO: CRM DE COMENSALES — Ausente

```sql
CREATE TABLE diners (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(20),     -- DNI, RUC, PASAPORTE
    document_number VARCHAR(20),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    total_spent DECIMAL(10,2) DEFAULT 0,
    visits_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_diners_doc ON diners(document_type, document_number);

-- En orders agregar:
ALTER TABLE orders ADD COLUMN diner_id INT REFERENCES diners(id);
```

**Lógica necesaria:**
- Buscar comensal por DNI/email al crear una orden
- Actualizar `total_spent` y `visits_count` al cerrar una orden
- Panel de "clientes frecuentes" para marketing

---

#### MÓDULO: AUDITORÍA Y FEEDBACK — Ausente en Tenant

```sql
CREATE TABLE admin_audit_log (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    module VARCHAR(50),
    table_name VARCHAR(50),
    record_id INT,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE customer_feedback (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id),
    branch_id INT NOT NULL REFERENCES branches(id),
    customer_name VARCHAR(100),
    customer_email VARCHAR(100),
    customer_phone VARCHAR(20),
    rating INT CHECK (rating BETWEEN 1 AND 5),
    food_rating INT CHECK (food_rating BETWEEN 1 AND 5),
    service_rating INT CHECK (service_rating BETWEEN 1 AND 5),
    ambiance_rating INT CHECK (ambiance_rating BETWEEN 1 AND 5),
    comment TEXT,
    would_recommend BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

#### MÓDULO: DISPOSITIVOS REGISTRADOS — Ausente

```sql
CREATE TABLE registered_devices (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id),
    user_id INT NOT NULL REFERENCES users(id),
    device_name VARCHAR(100) NOT NULL,
    device_type VARCHAR(20) NOT NULL,  -- tablet, phone, laptop, desktop, pos
    device_id VARCHAR(255) UNIQUE NOT NULL,
    last_sync_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## PARTE 3 — LÓGICAS Y SERVICIOS A CONSTRUIR

### A. Servicio de Validación de Límites del Plan
**Archivo sugerido:** `src/core/master/services/plan-limits.service.ts`

```typescript
// Flujo esperado:
// 1. Antes de crear branch/user/caja → consultar customer_limits_cache
// 2. Comparar con plans.max_*
// 3. Si límite alcanzado → lanzar error 403 con mensaje descriptivo
// 4. Si OK → proceder y actualizar customer_limits_cache
```

### B. Middleware de Validación de Límites
**Archivo sugerido:** `src/core/tenant/middleware/plan-limits.middleware.ts`

Debe interceptar creación de: sucursales, usuarios, cajas, mesas.

### C. Servicio de Cajas (Cash Management)
**Archivo sugerido:** `src/core/tenant/services/admin/cash.service.ts`

- `openSession(registerId, userId, amount)` — Validar sesión previa, crear cash_session
- `closeSession(sessionId, closingAmount, userId)` — Calcular expected, guardar diferencia
- `addTransaction(sessionId, type, amount, reference)` — Registrar movimiento
- `getSessionSummary(sessionId)` — Resumen por método de pago

### D. Servicio de Cocina / KDS
**Archivo sugerido:** `src/core/tenant/services/admin/kitchen.service.ts`

- `generateKitchenTickets(orderId)` — Por cada item, buscar la estación correcta por categoría
- `updateTicketStatus(ticketId, status, userId)`
- `getStationQueue(stationId, branchId)` — Items pendientes por estación

### E. Servicio de Facturación
**Archivo sugerido:** `src/core/tenant/services/admin/invoice.service.ts`

- `generateInvoice(orderId, documentTypeId, customerData)` — Asignar correlativo, crear invoice
- `exchangeDocument(originalInvoiceId, newCustomerData, userId)` — Canje de NV → Factura
- `voidInvoice(invoiceId, reason, userId)` — Anulación con registro
- `getNextNumber(seriesId)` — TX con FOR UPDATE para evitar correlativo duplicado

### F. Servicio de Inventario por Venta
**Archivo sugerido:** `src/core/tenant/services/admin/stock-deduction.service.ts`

- `deductStockByOrder(orderId, branchId)` — Al pagar, leer recipes por cada order_item y descontar stock
- `checkStockAvailability(productVariantId, branchId, quantity)` — Antes de agregar a orden
- `sendLowStockAlerts(branchId)` — Job periódico o trigger post-venta

### G. Servicio de Precios por Sucursal
**Archivo sugerido:** `src/core/tenant/services/admin/menu.service.ts`

- `getMenuForBranch(branchId)` — LEFT JOIN branch_product_prices priorizando precio específico
- `setbranchPrice(branchId, variantId, price)` — Precio diferenciado

### H. Sincronización Customer Users (Master ↔ Tenant)
**Archivo sugerido:** `src/core/master/services/sync.service.ts`

- Al crear/modificar/eliminar un usuario en tenant → sincronizar `customer_users` en master
- Permite al soporte ver usuarios sin acceder a la BD del cliente

### I. Servicio de Delivery
**Archivo sugerido:** `src/core/tenant/services/admin/delivery.service.ts`

- `assignDriver(orderId, driverId)` — Crear delivery record
- `updateDeliveryStatus(deliveryId, status)` — Seguimiento
- `getActiveDeliveries(branchId)` — Vista de logística

---

## PARTE 4 — PRIORIDADES SUGERIDAS

### Fase 1 — Fundamento (bloqueante para todo lo demás)
1. **Tabla `branches`** + migrar todo a usar `branch_id`
2. **Tabla `product_variants`** + refactor de `order_items`
3. **`customer_limits_cache`** + servicio de validación de límites
4. **`order_types`/`order_statuses`** como tablas (sacar de enums)
5. Expandir `plans` con columnas de límites explícitas

### Fase 2 — Operación básica del restaurante
6. **`cash_registers`** + `cash_sessions` + `cash_transactions`
7. **Mejorar `tables`** con zonas, estados y pisos
8. **`modifier_groups`** / `modifier_options` / `order_item_modifiers`
9. **`order_status_history`** para trazabilidad
10. **`payment_conditions`**

### Fase 3 — Cocina e impresión
11. **`kitchen_stations`** + `kitchen_tickets` + KDS service
12. **`printers`** + `printer_rules` + `printed_tickets`
13. Lógica de auto-routing de tickets por categoría → estación

### Fase 4 — Facturación y compliance
14. **`document_types`** + `invoice_series` + `invoices`
15. **`document_exchanges`** (canje)
16. Correlativo por sucursal con transacciones `FOR UPDATE`
17. Integración SUNAT/SAT (puede ser un servicio externo)

### Fase 5 — CRM, inventario y reporting
18. **`diners`** + vincular a órdenes
19. **`ingredients`** + `ingredient_stock` + `recipes` (o integrar con warehouse existente)
20. Descuento automático de stock post-venta
21. **`customer_feedback`**
22. **`registered_devices`**

### Fase 6 — Soporte y monitoreo SaaS
23. **`customer_usage`** (snapshots mensuales)
24. **`customer_users`** + sincronización
25. **`ticket_messages`** (chat en tickets)
26. **`password_resets`** para usuarios de tenant
27. Dashboard de métricas SaaS

---

## PARTE 5 — OBSERVACIONES TÉCNICAS

### 1. Multi-branch en el contexto del tenant
Hoy el tenant context solo identifica QUÉ base de datos usar. Falta identificar la sucursal activa dentro de esa BD. Propuesta: agregar `X-Branch-ID` al tenant context middleware para pasarlo automáticamente a los servicios via AsyncLocalStorage.

### 2. El correlativo de facturas necesita transacciones con lock
El uso de `invoice_series.next_number` con un simple UPDATE puede generar números duplicados bajo concurrencia. Usar:
```sql
SELECT next_number FROM invoice_series WHERE id = $1 FOR UPDATE;
-- luego UPDATE + INSERT en la misma transacción
```

### 3. El warehouse existente vs. el inventario de recetas
El módulo de warehouse actual (con áreas, requisiciones, transferencias) es una capa más completa que el inventario objetivo. Recomendación: usarlo como sistema de **reposición** y agregar las tablas de `ingredient_stock` / `recipes` como la capa de **descuento por venta**. Ambas coexisten.

### 4. Sincronización Master ↔ Tenant
Actualmente no existe mecanismo de sync. Cada vez que un admin del tenant crea/elimina usuarios o sucursales, el master no se entera. Implementar un sistema de webhooks internos o un job de sincronización periódica para actualizar `customer_limits_cache` y `customer_users`.

### 5. WebSockets para KDS en tiempo real
El KDS (pantalla de cocina) requiere actualizaciones en tiempo real. Hono soporta WebSockets nativamente con `upgradeWebSocket`. Implementar un canal por `kitchen_station_id` para que la pantalla de cocina reciba tickets nuevos sin polling.

### 6. Manejo de zonas horarias
El restaurante puede estar en `America/Lima` o `Europe/Madrid`. Todos los timestamps se almacenan en UTC en la BD (buena práctica). La conversión al timezone local debe hacerse en la capa de presentación, leyendo el `timezone` de `restaurant_config`.
