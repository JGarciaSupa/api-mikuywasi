🔵 PARTE 1: SUPER_ADMIN_DB (ESTRUCTURA FINAL)
-- ============================================
-- AUTENTICACIÓN SUPER ADMIN
-- ============================================

CREATE TABLE super_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,  -- super_admin, support, sales
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE super_users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL REFERENCES super_roles(id),
    status VARCHAR(20) DEFAULT 'active',  -- active, inactive, suspended
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_super_users_email ON super_users(email);
CREATE INDEX idx_super_users_role_status ON super_users(role_id, status);

-- ============================================
-- CLIENTES SAAS (RENOMBRADO DE 'tenants')
-- ============================================

CREATE TABLE saas_customers (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(200),
    tax_id VARCHAR(50),
    country CHAR(2),  -- ISO 3166-1: PE, MX, ES
    timezone VARCHAR(50),  -- America/Lima, Europe/Madrid
    status VARCHAR(20) DEFAULT 'active',  -- active, suspended, trial, cancelled
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_saas_customers_status ON saas_customers(status);
CREATE INDEX idx_saas_customers_country ON saas_customers(country);

-- ============================================
-- CONEXIÓN A BD DEL CLIENTE
-- ============================================

CREATE TABLE customer_databases (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES saas_customers(id),
    db_host VARCHAR(255) NOT NULL,
    db_port INT DEFAULT 5432,
    db_name VARCHAR(100) NOT NULL,
    db_user VARCHAR(100) NOT NULL,
    db_password TEXT NOT NULL,  -- encrypted
    db_schema VARCHAR(50) DEFAULT 'public',
    db_engine VARCHAR(20) DEFAULT 'postgresql',  -- postgresql, mysql
    db_ssl BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'active',  -- active, migrating, readonly, archived
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_customer_databases_db_name ON customer_databases(db_name);
CREATE INDEX idx_customer_databases_customer ON customer_databases(customer_id);

-- ============================================
-- PLANES COMERCIALES
-- ============================================

CREATE TABLE plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,  -- basic, pro, enterprise
    description TEXT,
    price_monthly DECIMAL(10,2),
    price_yearly DECIMAL(10,2),
    currency CHAR(3) DEFAULT 'USD',  -- USD, EUR, PEN
    -- Límites
    max_branches INT,
    max_users INT,
    max_cash_registers INT,
    max_tables INT,
    max_invoices_month INT,  -- 500 para básico
    max_orders_month INT,
    max_storage_gb INT,
    -- Features booleanos
    has_unlimited_users BOOLEAN DEFAULT false,
    has_unlimited_internal_notes BOOLEAN DEFAULT true,
    has_multi_branch BOOLEAN DEFAULT false,
    has_inventory BOOLEAN DEFAULT false,
    has_delivery BOOLEAN DEFAULT false,
    has_api_access BOOLEAN DEFAULT false,
    has_custom_reports BOOLEAN DEFAULT false,
    has_advanced_logistics BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active',  -- active, archived
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_plans_slug ON plans(slug);

-- ============================================
-- SUSCRIPCIONES (RELACIÓN CLIENTE-PLAN)
-- ============================================

CREATE TABLE customer_subscriptions (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES saas_customers(id),
    plan_id INT NOT NULL REFERENCES plans(id),
    start_date DATE NOT NULL,
    end_date DATE,  -- NULL si es recurrente
    status VARCHAR(20) DEFAULT 'active',  -- active, trial, past_due, cancelled, expired
    billing_cycle VARCHAR(20),  -- monthly, yearly
    auto_renew BOOLEAN DEFAULT true,
    next_billing_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_customer_subscriptions_customer_status ON customer_subscriptions(customer_id, status);
CREATE UNIQUE INDEX idx_customer_subscriptions_active ON customer_subscriptions(customer_id) WHERE status = 'active';

-- ============================================
-- USO Y LÍMITES DEL CLIENTE
-- ============================================

CREATE TABLE customer_usage (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES saas_customers(id),
    month DATE NOT NULL,  -- YYYY-MM-01
    branches_count INT DEFAULT 0,
    users_count INT DEFAULT 0,
    orders_count INT DEFAULT 0,
    invoices_count INT DEFAULT 0,
    storage_used_gb DECIMAL(10,2) DEFAULT 0,
    api_calls_count INT DEFAULT 0,
    calculated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_customer_usage_customer_month ON customer_usage(customer_id, month);

-- ============================================
-- CACHE DE LÍMITES (PARA VALIDACIÓN RÁPIDA)
-- ============================================

CREATE TABLE customer_limits_cache (
    customer_id INT PRIMARY KEY REFERENCES saas_customers(id),
    branches_used INT DEFAULT 0,
    users_used INT DEFAULT 0,
    cash_registers_used INT DEFAULT 0,
    tables_used INT DEFAULT 0,
    invoices_month_used INT DEFAULT 0,
    current_month DATE,
    last_updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- USUARIOS DEL TENANT (CACHE PARA SOPORTE)
-- ============================================

CREATE TABLE customer_users (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES saas_customers(id),
    external_user_id INT,  -- ID en TENANT_DB
    email VARCHAR(100),
    role_name VARCHAR(50),
    branch_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_customer_users_customer_email ON customer_users(customer_id, email);

-- ============================================
-- SOPORTE
-- ============================================

CREATE TABLE support_tickets (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES saas_customers(id),
    user_id INT REFERENCES customer_users(id),
    assigned_to INT REFERENCES super_users(id),
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium',  -- low, medium, high, critical
    status VARCHAR(20) DEFAULT 'open',  -- open, in_progress, waiting, resolved, closed
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_support_tickets_customer_status ON support_tickets(customer_id, status);

CREATE TABLE ticket_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL,  -- customer, support
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id, created_at);

-- ============================================
-- RESET DE CONTRASEÑAS
-- ============================================

CREATE TABLE password_resets (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES saas_customers(id),
    user_id INT NOT NULL,  -- ID en TENANT_DB
    reset_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_password_resets_token ON password_resets(reset_token);

-- ============================================
-- AUDITORÍA SUPER ADMIN
-- ============================================

CREATE TABLE admin_audit_logs (
    id SERIAL PRIMARY KEY,
    super_user_id INT REFERENCES super_users(id),
    customer_id INT REFERENCES saas_customers(id),
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

CREATE INDEX idx_admin_audit_logs_user_action ON admin_audit_logs(super_user_id, action, created_at DESC);
CREATE INDEX idx_admin_audit_logs_customer ON admin_audit_logs(customer_id, created_at DESC);







🟢 PARTE 2: TENANT_DB (ESTRUCTURA FINAL MEJORADA)
-- ============================================
-- CONFIGURACIÓN DEL RESTAURANTE
-- ============================================

CREATE TABLE restaurant_config (
    id SERIAL PRIMARY KEY CHECK (id = 1),  -- SOLO 1 registro
    business_name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(200),
    tax_id VARCHAR(50),
    currency_default CHAR(3) DEFAULT 'PEN',  -- PEN, USD, EUR
    timezone VARCHAR(50) DEFAULT 'America/Lima',
    language CHAR(2) DEFAULT 'es',  -- es, en, pt
    logo_path VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE restaurant_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    data_type VARCHAR(20) DEFAULT 'string',  -- string, number, boolean, json
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SUCURSALES
-- ============================================

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

CREATE INDEX idx_branches_code ON branches(code);
CREATE INDEX idx_branches_status ON branches(status);

CREATE TABLE floors (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    level INT NOT NULL,  -- 1, 2, -1 (sótano)
    display_order INT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_floors_branch ON floors(branch_id, level);

-- ============================================
-- ROLES Y PERMISOS
-- ============================================

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    level INT NOT NULL,  -- 1=super, 5=básico
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

CREATE INDEX idx_permissions_module_action ON permissions(module, action);

CREATE TABLE role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_role_permissions_unique ON role_permissions(role_id, permission_id);

-- ============================================
-- USUARIOS
-- ============================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role_id INT NOT NULL REFERENCES roles(id),
    default_branch_id INT REFERENCES branches(id),
    image_path VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',  -- active, inactive, suspended
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_status ON users(role_id, status);

CREATE TABLE user_branches (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_branches_unique ON user_branches(user_id, branch_id);

-- ============================================
-- CAJAS Y SESIONES
-- ============================================

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

CREATE INDEX idx_cash_sessions_register_status ON cash_sessions(cash_register_id, status);

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
    payment_id INT,  -- FK manual a payments
    amount DECIMAL(10,2) NOT NULL,
    reference VARCHAR(100),
    notes TEXT,
    created_by INT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cash_transactions_session ON cash_transactions(cash_session_id);

-- ============================================
-- MÉTODOS DE PAGO
-- ============================================

CREATE TABLE payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    requires_reference BOOLEAN DEFAULT false,
    is_cash BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active',
    display_order INT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE payment_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL,  -- FK manual a orders
    payment_method_id INT NOT NULL REFERENCES payment_methods(id),
    amount DECIMAL(10,2) NOT NULL,
    reference VARCHAR(100),
    status_id INT NOT NULL REFERENCES payment_statuses(id),
    processed_by INT NOT NULL REFERENCES users(id),
    processed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);

-- ============================================
-- CONDICIONES DE PAGO (NUEVO)
-- ============================================

CREATE TABLE payment_conditions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,  -- Contado, Crédito 15 días
    days_to_pay INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- MESAS Y ZONAS
-- ============================================

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

CREATE INDEX idx_table_zones_branch ON table_zones(branch_id);

CREATE TABLE tables (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    zone_id INT REFERENCES table_zones(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    capacity INT,
    qr_code_path VARCHAR(255),
    status_id INT NOT NULL REFERENCES table_statuses(id),
    position_x INT,  -- Para mapa visual
    position_y INT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_tables_branch_code ON tables(branch_id, code);
CREATE INDEX idx_tables_zone_status ON tables(zone_id, status_id);

-- ============================================
-- PEDIDOS
-- ============================================

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

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    branch_id INT NOT NULL REFERENCES branches(id),
    table_id INT REFERENCES tables(id),
    order_type_id INT NOT NULL REFERENCES order_types(id),
    status_id INT NOT NULL REFERENCES order_statuses(id),
    waiter_id INT REFERENCES users(id),
    payment_condition_id INT REFERENCES payment_conditions(id),
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    customer_email VARCHAR(100),
    subtotal DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tip_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    started_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    created_from_device VARCHAR(100),  -- NUEVO
    created_from_ip VARCHAR(45),  -- NUEVO
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_uuid ON orders(uuid);
CREATE INDEX idx_orders_branch_status ON orders(branch_id, status_id, started_at DESC);
CREATE INDEX idx_orders_table ON orders(table_id) WHERE table_id IS NOT NULL;

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_variant_id INT NOT NULL,  -- FK manual
    quantity DECIMAL(8,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_item_modifiers (
    id SERIAL PRIMARY KEY,
    order_item_id INT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_option_id INT NOT NULL,  -- FK manual
    quantity INT DEFAULT 1,
    extra_price DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_order_item_modifiers_item ON order_item_modifiers(order_item_id);

CREATE TABLE order_status_history (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status_id INT NOT NULL REFERENCES order_statuses(id),
    changed_by INT NOT NULL REFERENCES users(id),
    notes TEXT,
    changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_order_status_history_order ON order_status_history(order_id, changed_at DESC);

-- ============================================
-- PRODUCTOS Y CATEGORÍAS
-- ============================================

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    parent_id INT REFERENCES categories(id),
    branch_id INT REFERENCES branches(id),  -- NULL = todas las sucursales
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_path VARCHAR(255),
    display_order INT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_branch ON categories(branch_id);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id),
    sku VARCHAR(50) UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_path VARCHAR(255),
    is_available BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products(category_id, status);
CREATE INDEX idx_products_sku ON products(sku) WHERE sku IS NOT NULL;

CREATE TABLE product_variants (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(50),  -- Personal, Mediano, Grande (NULL si es único)
    sku VARCHAR(50),
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2),
    stock_quantity INT,
    is_default BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_product_variants_product ON product_variants(product_id);
CREATE UNIQUE INDEX idx_product_variants_unique ON product_variants(product_id, variant_name);

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

CREATE INDEX idx_price_history_variant ON price_history(product_variant_id, valid_from DESC);

-- ============================================
-- MODIFICADORES
-- ============================================

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

CREATE INDEX idx_modifier_options_group ON modifier_options(modifier_group_id);

CREATE TABLE product_modifier_groups (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    modifier_group_id INT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT false,
    display_order INT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_product_modifier_groups_unique ON product_modifier_groups(product_id, modifier_group_id);

-- ============================================
-- COCINA / BAR
-- ============================================

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

CREATE UNIQUE INDEX idx_kitchen_stations_branch_code ON kitchen_stations(branch_id, code);

CREATE TABLE kitchen_station_categories (
    id SERIAL PRIMARY KEY,
    kitchen_station_id INT NOT NULL REFERENCES kitchen_stations(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_kitchen_station_categories_unique ON kitchen_station_categories(kitchen_station_id, category_id);

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
    priority VARCHAR(20) DEFAULT 'normal',  -- low, normal, high, urgent
    estimated_time INT,  -- minutos
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_kitchen_tickets_station_status ON kitchen_tickets(kitchen_station_id, status_id, created_at DESC);
CREATE INDEX idx_kitchen_tickets_order ON kitchen_tickets(order_id);

-- ============================================
-- IMPRESORAS
-- ============================================

CREATE TABLE printers (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    floor_id INT REFERENCES floors(id),
    kitchen_station_id INT REFERENCES kitchen_stations(id),
    name VARCHAR(100) NOT NULL,
    printer_type VARCHAR(20) NOT NULL,  -- fiscal, kitchen, receipt, label
    connection_type VARCHAR(20) NOT NULL,  -- network, usb, bluetooth
    ip_address VARCHAR(15),
    port INT,
    model VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_printers_branch_type ON printers(branch_id, printer_type);

CREATE TABLE printer_rules (
    id SERIAL PRIMARY KEY,
    printer_id INT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(id),
    order_type_id INT REFERENCES order_types(id),
    copies INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_printer_rules_printer ON printer_rules(printer_id);

CREATE TABLE printed_tickets (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id),
    cash_register_id INT REFERENCES cash_registers(id),
    printer_id INT NOT NULL REFERENCES printers(id),
    ticket_type VARCHAR(20) NOT NULL,  -- order, receipt, kitchen, invoice
    content_json TEXT,  -- JSON
    print_status VARCHAR(20) DEFAULT 'pending',  -- pending, sent, printed, error
    error_message TEXT,
    printed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_printed_tickets_order ON printed_tickets(order_id, ticket_type);
CREATE INDEX idx_printed_tickets_printer ON printed_tickets(printer_id, print_status);

-- ============================================
-- INVENTARIO
-- ============================================

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

CREATE INDEX idx_ingredients_category ON ingredients(category_id);

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

CREATE INDEX idx_inventory_movements_ingredient_branch ON inventory_movements(ingredient_id, branch_id, created_at DESC);

CREATE TABLE recipes (
    id SERIAL PRIMARY KEY,
    product_variant_id INT NOT NULL,  -- FK manual
    ingredient_id INT NOT NULL REFERENCES ingredients(id),
    quantity_needed DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_recipes_unique ON recipes(product_variant_id, ingredient_id);

-- ============================================
-- DELIVERY
-- ============================================

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
    estimated_time INT,  -- minutos
    tracking_url VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deliveries_order ON deliveries(order_id);
CREATE INDEX idx_deliveries_driver_status ON deliveries(driver_id, status_id);

-- ============================================
-- FACTURACIÓN
-- ============================================

CREATE TABLE document_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL,
    sunat_code VARCHAR(10),  -- Código SUNAT/SAT
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
    full_number VARCHAR(20),  -- B001-00001
    status_id INT NOT NULL REFERENCES invoice_statuses(id),
    is_internal BOOLEAN DEFAULT false,  -- NUEVO: Nota de venta interna
    exchanged_from_id INT REFERENCES invoices(id),  -- NUEVO: Canje
    is_exchange BOOLEAN DEFAULT false,  -- NUEVO
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

CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_invoices_full_number ON invoices(full_number);
CREATE INDEX idx_invoices_customer_tax ON invoices(customer_tax_id, issued_at DESC);

-- NUEVA TABLA: Canje de documentos
CREATE TABLE document_exchanges (
    id SERIAL PRIMARY KEY,
    original_invoice_id INT NOT NULL REFERENCES invoices(id),
    new_invoice_id INT NOT NULL REFERENCES invoices(id),
    exchange_reason TEXT,
    exchanged_by INT NOT NULL REFERENCES users(id),
    exchanged_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_document_exchanges_original ON document_exchanges(original_invoice_id);

-- ============================================
-- AUDITORÍA Y FEEDBACK
-- ============================================

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

CREATE INDEX idx_admin_audit_log_user ON admin_audit_log(user_id, action, created_at DESC);
CREATE INDEX idx_admin_audit_log_table ON admin_audit_log(table_name, record_id);

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

CREATE INDEX idx_customer_feedback_branch ON customer_feedback(branch_id, rating, created_at DESC);

-- ============================================
-- NUEVAS TABLAS: DISPOSITIVOS REGISTRADOS
-- ============================================

CREATE TABLE registered_devices (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id),
    user_id INT NOT NULL REFERENCES users(id),
    device_name VARCHAR(100) NOT NULL,
    device_type VARCHAR(20) NOT NULL,  -- tablet, phone, laptop, desktop, pos
    device_id VARCHAR(255) UNIQUE NOT NULL,  -- UUID del dispositivo
    last_sync_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_registered_devices_branch_user ON registered_devices(branch_id, user_id);
```
🛠️ ESTRUCTURA MEJORADA (TENANT_DB)
Añade o modifica estas tablas en tu diseño. Mantén lo que ya tienes, esto es un "capa extra" de robustez.
A. Módulo de Clientes (CRM) - Nuevo
Permite que el Cliente C reconozca a sus comensales en sus 3 sucursales.
SQL
CREATE TABLE diners (
    id SERIAL PRIMARY KEY, -- PK
    document_type VARCHAR(20), -- DNI, RUC, PASAPORTE
    document_number VARCHAR(20),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    total_spent DECIMAL(10,2) DEFAULT 0, -- Para ver si es cliente VIP
    visits_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
-- FK Index
CREATE UNIQUE INDEX idx_diners_doc ON diners(document_type, document_number);
B. Relación Orden-Cliente y Orden-Sucursal - Ajuste
En tu tabla orders, cambia los campos de texto por una FK al comensal.
SQL
ALTER TABLE orders 
ADD COLUMN diner_id INT REFERENCES diners(id); -- FK hacia la tabla nueva
-- El campo branch_id que ya tienes es CORRECTO. Es el discriminador principal.
C. Facturación Electrónica (El "Cierre Legal") - Nuevo
SQL
CREATE TABLE electronic_invoices (
    id SERIAL PRIMARY KEY, -- PK
    branch_id INT NOT NULL REFERENCES branches(id), -- FK: ¿Quién emite?
    order_id INT REFERENCES orders(id), -- FK: ¿De qué orden viene? (Puede ser NULL si es venta directa sin comanda)
    diner_id INT REFERENCES diners(id), -- FK: ¿A quién se factura?
    
    invoice_type CHAR(2) NOT NULL, -- '01': Factura, '03': Boleta (Códigos SUNAT/SAT)
    series VARCHAR(4) NOT NULL, -- Ej: F001, B001 (Independiente por sucursal)
    number INT NOT NULL, -- Correlativo: 1, 2, 3...
    
    currency CHAR(3) DEFAULT 'PEN',
    total_taxed DECIMAL(10,2), -- Base imponible
    total_igv DECIMAL(10,2), -- Impuestos
    total_amount DECIMAL(10,2), -- Total final
    
    sunat_status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected
    xml_url TEXT, -- Link al XML firmado
    pdf_url TEXT, -- Link al PDF
    cdr_url TEXT, -- Constancia de recepción
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_invoices_series_number ON electronic_invoices(branch_id, series, number);
D. Precios Diferenciados (Opcional pero recomendado) - Nuevo
SQL
CREATE TABLE branch_product_prices (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_variant_id INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL, -- Precio específico para esta sucursal
    is_available BOOLEAN DEFAULT true, -- Puede que esta sucursal no venda este plato
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_branch_prices ON branch_product_prices(branch_id, product_variant_id);
________________________________________
🔄 EXPLICACIÓN DE FLUJOS (WORKFLOWS)
Para que entiendas cómo se mueve la data en tu sistema con el Cliente C (3 Sucursales).
Flujo 1: Configuración Inicial (El Super Admin)
1.	Super Admin crea el Tenant "Restaurante Don Pepe" (saas_customers).
2.	El sistema aprovisiona la DB_DON_PEPE.
3.	Dentro de DB_DON_PEPE, se crean 3 registros en la tabla branches:
o	ID 1: Norte (is_main = true)
o	ID 2: Sur
o	ID 3: Este
4.	El dueño crea el menú (Productos). Por defecto, están disponibles en todas las sucursales.
Flujo 2: La Operación Diaria (Toma de Pedido)
Escenario: Un mesero en la Sucursal Sur (ID 2) toma un pedido.
1.	Login: El mesero ingresa. El backend verifica en user_branches que tenga acceso a branch_id = 2.
2.	Apertura: El mesero abre una mesa. Se crea un registro en orders con branch_id = 2 y status = 'open'.
3.	Comanda: Agrega "Lomo Saltado". El sistema busca el precio.
o	Lógica: ¿Existe precio en branch_product_prices para la sucursal 2? Si sí, usa ese. Si no, usa el de product_variants.
4.	Cocina: Al confirmar, se genera un kitchen_ticket. El sistema busca impresoras (printers) donde branch_id = 2 y type = 'kitchen'. Solo se imprime en la cocina de la Sucursal Sur.
Flujo 3: Pago y Facturación (Caja)
1.	El cliente pide la cuenta. El cajero selecciona "Emitir Comprobante".
2.	Se inserta en payments el dinero recibido.
3.	El sistema asigna el correlativo.
o	Importante: La Sucursal Sur tiene su propia serie (ej: B002). El sistema busca el último número de la serie B002 y le suma 1. Esto evita huecos legales en la facturación.
4.	Se guarda en electronic_invoices.
Flujo 4: Gestión de Inventario (Receta)
Cuando se vende el "Lomo Saltado".
1.	El sistema mira la tabla recipes. "Lomo Saltado" lleva: 200g de carne, 100g de papa.
2.	El sistema va a la tabla ingredient_stock.
3.	Descuenta SOLAMENTE del stock donde branch_id = 2.
o	El stock de la Sucursal Norte (ID 1) queda intacto.
o	Si no hay stock en la Sur, el sistema alerta (pero permite venta en negativo si está configurado así).

---

## 🎬 PARTE 3: FLUJOS CLAVE EXPLICADOS

### 🔷 FLUJO 1: Creación de Cliente → 1 Sucursal
```
PASO 1: SUPER_ADMIN crea cliente en SUPER_ADMIN_DB
├─ INSERT INTO saas_customers (Don Pepe)
├─ INSERT INTO customer_databases (tenant_don_pepe_001)
├─ INSERT INTO customer_subscriptions (Plan Pro)
└─ INSERT INTO customer_limits_cache (límites en 0)

PASO 2: Script crea TENANT_DB
├─ Ejecuta todo el schema de TENANT_DB
└─ BD independiente: tenant_don_pepe_001

PASO 3: Dentro de TENANT_DB, configurar restaurante
├─ INSERT INTO restaurant_config (id=1, Don Pepe Operaciones)
├─ INSERT INTO branches (NORTE - Plaza Norte)
└─ INSERT INTO roles (admin, manager, waiter, cashier)

RESULTADO:
✅ Cliente creado en SaaS
✅ BD independiente creada
✅ 1 Sucursal operativa
```

















### 🔷 FLUJO 2: Venta Completa (Mesa → Orden → Pago → Factura)
```
PASO 1: Abrir caja
├─ INSERT INTO cash_sessions (opened_by, opening_amount)
└─ Estado: open

PASO 2: Cliente se sienta
├─ UPDATE tables SET status_id = 2 (occupied)
└─ Mesa bloqueada

PASO 3: Mesero crea orden
├─ INSERT INTO orders (branch_id, table_id, waiter_id)
├─ INSERT INTO order_items (2x Lomo Saltado)
└─ UPDATE orders SET total_amount = calculated

PASO 4: Cocina recibe ticket
├─ INSERT INTO kitchen_tickets (order_id, kitchen_station_id)
└─ Imprime automáticamente según printer_rules

PASO 5: Cliente paga
├─ INSERT INTO payments (order_id, payment_method_id)
├─ INSERT INTO cash_transactions (cash_session_id, amount)
└─ UPDATE orders SET status_id = 5 (delivered)

PASO 6: Generar factura
├─ INSERT INTO invoices (order_id, series_id, customer_tax_id)
├─ UPDATE invoice_series SET next_number = next_number + 1
└─ Genera XML/PDF para SUNAT

PASO 7: Liberar mesa
└─ UPDATE tables SET status_id = 1 (available)

PASO 8: Cerrar caja
├─ UPDATE cash_sessions SET closed_at, closing_amount
└─ Estado: closed
```

---

### 🔷 FLUJO 3: Validación de Límites del Plan
```
USUARIO intenta crear Caja #3

APP ejecuta:
1. Consulta SUPER_ADMIN_DB.customer_limits_cache.cash_registers_used → 2
2. Consulta plan activo → plan_id = 2 (Pro)
3. Consulta SUPER_ADMIN_DB.plans.max_cash_registers → 10
4. Validación: 2 < 10 → PERMITIR
5. INSERT INTO cash_registers
6. UPDATE customer_limits_cache SET cash_registers_used = 3

USUARIO intenta crear Usuario #21

APP ejecuta:
1. Consulta customer_limits_cache.users_used → 20
2. Consulta plan.max_users → 20
3. Validación: 20 >= 20 → BLOQUEAR
4. Error: "Has alcanzado el límite de usuarios de tu plan Pro (20/20)"








PARTE 4: DATA FAKE BÁSICA PARA 1 CLIENTE
-- ========================================
-- SUPER_ADMIN_DB
-- ========================================

-- Roles super admin
INSERT INTO super_roles (id, name) VALUES
(1, 'super_admin'),
(2, 'support'),
(3, 'sales');

-- Super usuario
INSERT INTO super_users (id, name, email, password_hash, role_id, status) VALUES
(1, 'Admin Master', 'admin@saas.com', '$2y$10$hashedpassword', 1, 'active');

-- Cliente SaaS
INSERT INTO saas_customers (id, business_name, legal_name, tax_id, country, timezone, status) VALUES
(10, 'Restaurantes Don Pepe SAC', 'Don Pepe SAC', '20123456789', 'PE', 'America/Lima', 'active');

-- Conexión a BD
INSERT INTO customer_databases (id, customer_id, db_host, db_port, db_name, db_user, db_password, db_engine, status) VALUES
(1, 10, 'localhost', 5432, 'tenant_don_pepe_001', 'tenant_user_10', 'encrypted_pass', 'postgresql', 'active');

-- Plan Pro
INSERT INTO plans (id, name, slug, max_branches, max_users, max_cash_registers, max_invoices_month, price_monthly, currency, has_multi_branch, status) VALUES
(2, 'Pro', 'pro', 5, 20, 10, 500, 149.00, 'USD', true, 'active');

-- Suscripción
INSERT INTO customer_subscriptions (id, customer_id, plan_id, start_date, status, billing_cycle, auto_renew) VALUES
(1, 10, 2, '2025-02-01', 'active', 'yearly', true);

-- Cache de límites
INSERT INTO customer_limits_cache (customer_id, branches_used, users_used, cash_registers_used, tables_used, current_month) VALUES
(10, 1, 3, 2, 10, '2025-02-01');

-- ========================================
-- TENANT_DB (tenant_don_pepe_001)
-- ========================================

-- Configuración restaurante
INSERT INTO restaurant_config (id, business_name, legal_name, tax_id, currency_default, timezone, status) VALUES
(1, 'Don Pepe - Operaciones', 'Don Pepe SAC', '20123456789', 'PEN', 'America/Lima', 'active');

-- Sucursal
INSERT INTO branches (id, code, name, address, city, country, is_main, status) VALUES
(1, 'NORTE', 'Plaza Norte', 'Av. Alfredo Mendiola 1400', 'Lima', 'PE', true, 'active');

-- Piso
INSERT INTO floors (id, branch_id, name, level, display_order, status) VALUES
(1, 1, 'Primer Piso', 1, 1, 'active');

-- Roles
INSERT INTO roles (id, name, description, level) VALUES
(1, 'admin', 'Administrador del sistema', 1),
(2, 'manager', 'Gerente de sucursal', 2),
(3, 'waiter', 'Mesero', 4),
(4, 'cashier', 'Cajero', 3);

-- Usuarios
INSERT INTO users (id, username, email, password_hash, full_name, role_id, default_branch_id, status) VALUES
(1, 'admin', 'admin@donpepe.com', '$2y$10$hash1', 'Carlos Administrador', 1, 1, 'active'),
(2, 'mesero1', 'mesero1@donpepe.com', '$2y$10$hash2', 'Juan Mesero', 3, 1, 'active'),
(3, 'cajero1', 'cajero1@donpepe.com', '$2y$10$hash3', 'Pedro Cajero', 4, 1, 'active');

-- Categoríassee
INSERT INTO categories (id, name, status) VALUES
(1, 'Platos de Fondo', 'active'),
(2, 'Bebidas', 'active'),
(3, 'Postres', 'active');

-- Productos
INSERT INTO products (id, category_id, name, is_available, status) VALUES
(1, 1, 'Lomo Saltado', true, 'active'),
(2, 2, 'Chicha Morada', true, 'active'),
(3, 3, 'Suspiro Limeño', true, 'active');

-- Variantes
INSERT INTO product_variants (id, product_id, variant_name, price, is_default, status) VALUES
(1, 1, NULL, 45.00, true, 'active'),
(2, 2, 'Personal', 12.00, true, 'active'),
(3, 2, 'Jarra', 25.00, false, 'active'),
(4, 3, NULL, 18.00, true, 'active');

-- Estados de mesa
INSERT INTO table_statuses (id, name, color_hex) VALUES
(1, 'available', '#28a745'),
(2, 'occupied', '#dc3545'),
(3, 'reserved', '#ffc107');

-- Zona de mesas
INSERT INTO table_zones (id, branch_id, floor_id, name, display_order, status) VALUES
(1, 1, 1, 'Salón Principal', 1, 'active');

-- Mesas
INSERT INTO tables (id, branch_id, zone_id, code, name, capacity, status_id) VALUES
(1, 1, 1, 'M01', 'Mesa 1', 4, 1),
(2, 1, 1, 'M02', 'Mesa 2', 4, 1),
(3, 1, 1, 'M03', 'Mesa 3', 6, 1);

-- Cajas
INSERT INTO cash_registers (id, branch_id, floor_id, code, name, status) VALUES
(1, 1, 1, 'CAJA-01', 'Caja Principal', 'active'),
(2, 1, 1, 'CAJA-02', 'Caja Express', 'active');

-- Métodos de pago
INSERT INTO payment_methods (id, name, code, is_cash, status) VALUES
(1, 'Efectivo', 'CASH', true, 'active'),
(2, 'Tarjeta', 'CARD', false, 'active'),
(3, 'Yape', 'YAPE', false, 'active');

-- Estados de pago
INSERT INTO payment_statuses (id, name) VALUES
(1, 'pending'),
(2, 'completed'),
(3, 'failed'),
(4, 'refunded');

-- Tipos de transacción de caja
INSERT INTO cash_transaction_types (id, name, affects_cash) VALUES
(1, 'sale', 'increase'),
(2, 'refund', 'decrease'),
(3, 'expense', 'decrease'),
(4, 'initial_cash', 'increase');

-- Tipos de orden
INSERT INTO order_types (id, name, code) VALUES
(1, 'Consumo en local', 'DINE'),
(2, 'Para llevar', 'TAKE'),
(3, 'Delivery', 'DELIV');

-- Estados de orden
INSERT INTO order_statuses (id, name, code, color_hex) VALUES
(1, 'Pendiente', 'PEND', '#ffc107'),
(2, 'Confirmado', 'CONF', '#17a2b8'),
(3, 'En preparación', 'PREP', '#fd7e14'),
(4, 'Listo', 'READY', '#20c997'),
(5, 'Entregado', 'DELIV', '#28a745'),
(6, 'Cancelado', 'CANCEL', '#dc3545');

-- Tipos de documento
INSERT INTO document_types (id, name, code, sunat_code) VALUES
(1, 'Boleta', 'BOL', '03'),
(2, 'Factura', 'FAC', '01'),
(3, 'Nota de Venta', 'NV', NULL);

-- Series de facturación
INSERT INTO invoice_series (id, branch_id, document_type_id, series, next_number, status) VALUES
(1, 1, 1, 'B001', 1, 'active'),
(2, 1, 2, 'F001', 1, 'active'),
(3, 1, 3, 'NV01', 1, 'active');

-- Estados de factura
INSERT INTO invoice_statuses (id, name, code) VALUES
(1, 'Borrador', 'DRAFT'),
(2, 'Enviado', 'SENT'),
(3, 'Aceptado', 'ACCPT'),
(4, 'Rechazado', 'REJCT'),
(5, 'Anulado', 'CANCEL');

-- Condiciones de pago
INSERT INTO payment_conditions (id, name, days_to_pay) VALUES
(1, 'Contado', 0),
(2, 'Crédito 15 días', 15),
(3, 'Crédito 30 días', 30);

-- Estaciones de cocina
INSERT INTO kitchen_stations (id, branch_id, code, name, station_type, status) VALUES
(1, 1, 'COCINA', 'Cocina Caliente', 'kitchen', 'active'),
(2, 1, 'BAR', 'Barra de Bar', 'bar', 'active');

-- Asignar categorías a estaciones
INSERT INTO kitchen_station_categories (kitchen_station_id, category_id) VALUES
(1, 1),  -- Platos → Cocina
(2, 2);  -- Bebidas → Bar

-- Estados de tickets de cocina
INSERT INTO kitchen_ticket_statuses (id, name, code, color_hex) VALUES
(1, 'Pendiente', 'PEND', '#ffc107'),
(2, 'En preparación', 'PROG', '#fd7e14'),
(3, 'Listo', 'READY', '#28a745'),
(4, 'Entregado', 'DELIV', '#6c757d');

-- Unidades de medida
INSERT INTO measurement_units (id, name, abbreviation) VALUES
(1, 'Kilogramos', 'kg'),
(2, 'Litros', 'l'),
(3, 'Unidades', 'un');










PARTE 2: FLUJOS DETALLADOS POR OPERACIÓN
📋 FLUJO 1: CREACIÓN DE CLIENTE SAAS
Descripción: Un super admin crea un nuevo cliente que usará el sistema.
Tablas involucradas:
SUPER_ADMIN_DB:
├─ saas_customers          ← Datos del cliente
├─ customer_databases      ← Conexión a su BD
├─ customer_subscriptions  ← Plan asignado
├─ customer_limits_cache   ← Límites inicializados
└─ admin_audit_logs        ← Registro de la acción

TENANT_DB (nueva):
└─ restaurant_config       ← Configuración inicial (id=1)
Secuencia:
1. Super admin accede al panel
   └─ Valida credenciales en: super_users + super_roles

2. Completa formulario de nuevo cliente
   └─ INSERT INTO saas_customers
       - business_name: "Restaurantes Don Pepe SAC"
       - country: "PE"
       - status: "trial"

3. Sistema asigna base de datos
   └─ INSERT INTO customer_databases
       - db_name: "tenant_don_pepe_001"
       - db_host, db_port, db_user, db_password

4. Asigna plan inicial
   └─ INSERT INTO customer_subscriptions
       - plan_id → plans.id (Plan Básico)
       - status: "trial"
       - start_date: HOY

5. Inicializa cache de límites
   └─ INSERT INTO customer_limits_cache
       - branches_used: 0
       - users_used: 0
       - cash_registers_used: 0

6. Script crea físicamente la TENANT_DB
   └─ CREATE DATABASE tenant_don_pepe_001
   └─ Ejecuta todas las tablas del schema TENANT

7. Registra en auditoría
   └─ INSERT INTO admin_audit_logs
       - action: "create_customer"
       - new_values: JSON con datos del cliente
________________________________________
📋 FLUJO 2: CONFIGURACIÓN INICIAL DEL RESTAURANTE
Descripción: El nuevo cliente configura su restaurante por primera vez.
Tablas involucradas:
TENANT_DB:
├─ restaurant_config       ← Configuración general (id=1)
├─ restaurant_settings     ← Configuraciones clave-valor
├─ branches               ← Sucursales
├─ floors                 ← Pisos por sucursal
├─ roles                  ← Roles del sistema
├─ users                  ← Usuario admin inicial
├─ table_zones            ← Zonas de mesas
├─ tables                 ← Mesas físicas
└─ cash_registers         ← Cajas registradoras
Secuencia:
1. Configurar datos generales del restaurante
   └─ INSERT INTO restaurant_config (id=1)
       - business_name: "Don Pepe - Operaciones"
       - currency_default: "PEN"
       - timezone: "America/Lima"

2. Configurar ajustes específicos
   └─ INSERT INTO restaurant_settings
       - (setting_key: "allow_tips", setting_value: "true")
       - (setting_key: "print_auto", setting_value: "false")
       - (setting_key: "tax_rate", setting_value: "18")

3. Crear primera sucursal
   └─ INSERT INTO branches
       - code: "NORTE"
       - name: "Plaza Norte"
       - is_main: true

4. Crear pisos de la sucursal
   └─ INSERT INTO floors
       - (branch_id: 1, name: "Primer Piso", level: 1)
       - (branch_id: 1, name: "Terraza", level: 2)

5. Crear roles básicos
   └─ INSERT INTO roles
       - admin, manager, waiter, cashier, chef

6. Crear usuario administrador
   └─ INSERT INTO users
       - username: "admin"
       - role_id: 1 (admin)
       - default_branch_id: 1

7. Crear zonas de mesas
   └─ INSERT INTO table_zones
       - (branch_id: 1, name: "Salón Principal")
       - (branch_id: 1, name: "Terraza")

8. Crear mesas
   └─ INSERT INTO tables
       - (branch_id: 1, zone_id: 1, code: "M01", capacity: 4)
       - (branch_id: 1, zone_id: 1, code: "M02", capacity: 4)
       - ... (hasta 20 mesas)

9. Crear cajas registradoras
   └─ INSERT INTO cash_registers
       - (branch_id: 1, code: "CAJA-01", name: "Caja Principal")
       - (branch_id: 1, code: "CAJA-02", name: "Caja Express")

10. Actualizar límites en SUPER_ADMIN_DB
    └─ UPDATE customer_limits_cache
        - branches_used: 1
        - users_used: 1
        - cash_registers_used: 2
        - tables_used: 20
________________________________________
📋 FLUJO 3: APERTURA DE CAJA (INICIO DE TURNO)
Descripción: El cajero abre su caja al inicio del día.
Tablas involucradas:
TENANT_DB:
├─ cash_registers          ← Caja a abrir
├─ cash_sessions           ← Nueva sesión
├─ cash_transaction_types  ← Tipo: "initial_cash"
├─ cash_transactions       ← Registro del monto inicial
└─ users                   ← Cajero que abre
Secuencia:
1. Cajero selecciona su caja
   └─ SELECT * FROM cash_registers 
       WHERE branch_id = 1 AND code = "CAJA-01"

2. Valida que no haya sesión abierta
   └─ SELECT * FROM cash_sessions 
       WHERE cash_register_id = 1 AND status = 'open'
       └─ Si existe → ERROR: "Ya hay una sesión abierta"

3. Ingresa monto inicial (ej: S/ 500.00)
   └─ INSERT INTO cash_sessions
       - cash_register_id: 1
       - opened_by: 3 (user_id del cajero)
       - opening_amount: 500.00
       - opened_at: NOW()
       - status: "open"

4. Registra transacción de apertura
   └─ INSERT INTO cash_transactions
       - cash_session_id: [id de la sesión creada]
       - transaction_type_id: 4 (initial_cash)
       - amount: 500.00
       - reference: "Apertura de caja"
       - created_by: 3

5. Respuesta al cajero
   └─ "Caja CAJA-01 abierta correctamente"
   └─ "Monto inicial: S/ 500.00"
________________________________________
📋 FLUJO 4: CREAR PEDIDO COMPLETO (MESA → ORDEN → COCINA)
Descripción: Un mesero toma un pedido de una mesa.
Tablas involucradas:
TENANT_DB:
├─ tables                  ← Mesa ocupada
├─ table_statuses          ← Estado: occupied
├─ orders                  ← Nueva orden
├─ order_types             ← Tipo: dine_in
├─ order_statuses          ← Estado: pending → confirmed
├─ order_items             ← Items del pedido
├─ products                ← Productos pedidos
├─ product_variants        ← Variantes (tamaños)
├─ modifier_groups         ← Grupos de modificadores
├─ modifier_options        ← Opciones (sin cebolla, extra queso)
├─ order_item_modifiers    ← Modificadores aplicados
├─ kitchen_tickets         ← Tickets para cocina
├─ kitchen_stations        ← Estaciones (cocina, bar)
├─ printers                ← Impresoras
├─ printer_rules           ← Reglas de impresión
├─ printed_tickets         ← Registro de impresión
└─ order_status_history    ← Historial de cambios
Secuencia:
1. Cliente se sienta en Mesa 5
   └─ UPDATE tables SET status_id = 2 (occupied)
       WHERE id = 5

2. Mesero crea la orden desde tablet
   └─ INSERT INTO orders
       - uuid: gen_random_uuid()
       - branch_id: 1
       - table_id: 5
       - order_type_id: 1 (dine_in)
       - status_id: 1 (pending)
       - waiter_id: 2 (user_id del mesero)
       - payment_condition_id: 1 (contado)
       - created_from_device: "TABLET-MESERO-01"
       - created_from_ip: "192.168.1.50"

3. Agregar items al pedido
   └─ INSERT INTO order_items (orden #1)
       - (product_variant_id: 1, quantity: 2, unit_price: 45.00)  ← 2x Lomo Saltado
       - (product_variant_id: 2, quantity: 1, unit_price: 12.00)  ← 1x Chicha Personal
       - (product_variant_id: 4, quantity: 1, unit_price: 18.00)  ← 1x Suspiro

4. Agregar modificadores al Lomo Saltado
   └─ INSERT INTO order_item_modifiers
       - order_item_id: 1 (primer Lomo)
       - modifier_option_id: 3 (sin cebolla)
       - extra_price: 0.00

5. Calcular totales
   └─ UPDATE orders SET
       - subtotal: 120.00 (45*2 + 12 + 18)
       - tax_amount: 21.60 (18% IGV)
       - total_amount: 141.60

6. Confirmar orden
   └─ UPDATE orders SET 
       - status_id: 2 (confirmed)
       - confirmed_at: NOW()

7. Registrar en historial
   └─ INSERT INTO order_status_history
       - order_id: 1
       - status_id: 2
       - changed_by: 2 (mesero)
       - changed_at: NOW()

8. Crear tickets de cocina por área
   └─ Sistema identifica que:
       - Lomo Saltado (categoría: Platos) → Cocina Caliente
       - Chicha (categoría: Bebidas) → Bar
       - Suspiro (categoría: Postres) → Postres

   └─ INSERT INTO kitchen_tickets
       - (order_id: 1, kitchen_station_id: 1, status_id: 1)  ← Cocina
       - (order_id: 1, kitchen_station_id: 2, status_id: 1)  ← Bar
       - (order_id: 1, kitchen_station_id: 3, status_id: 1)  ← Postres

9. Imprimir tickets según reglas
   └─ Sistema consulta printer_rules:
       - Categoría "Platos" → Impresora de Cocina
       - Categoría "Bebidas" → Impresora de Bar

   └─ INSERT INTO printed_tickets
       - (order_id: 1, printer_id: 1, ticket_type: "kitchen")
       - (order_id: 1, printer_id: 2, ticket_type: "kitchen")

10. Enviar a impresoras
    └─ UPDATE printed_tickets SET 
        - print_status: "printed"
        - printed_at: NOW()
________________________________________
📋 FLUJO 5: PROCESAR PAGO Y FACTURAR
Descripción: Cliente pide la cuenta y paga.
Tablas involucradas:
TENANT_DB:
├─ orders                  ← Orden a pagar
├─ payments                ← Registro de pago
├─ payment_methods         ← Método usado
├─ payment_statuses        ← Estado del pago
├─ cash_sessions           ← Sesión de caja activa
├─ cash_transactions       ← Registro en caja
├─ cash_transaction_types  ← Tipo: sale
├─ invoices                ← Factura/Boleta
├─ invoice_series          ← Serie a usar
├─ invoice_statuses        ← Estado de factura
├─ document_types          ← Tipo de documento
├─ tables                  ← Liberar mesa
└─ printed_tickets         ← Ticket de pago
Secuencia:
1. Cliente pide la cuenta
   └─ Mesero genera pre-cuenta desde tablet
   └─ SELECT * FROM orders WHERE id = 1
   └─ SELECT * FROM order_items WHERE order_id = 1

2. Cliente decide método de pago: Tarjeta
   └─ SELECT * FROM payment_methods WHERE code = "CARD"

3. Procesar pago
   └─ INSERT INTO payments
       - order_id: 1
       - payment_method_id: 2 (tarjeta)
       - amount: 141.60
       - reference: "VISA-****1234"
       - status_id: 2 (completed)
       - processed_by: 3 (cajero)

4. Registrar en caja
   └─ SELECT cash_session_id FROM cash_sessions 
       WHERE cash_register_id = 1 AND status = 'open'

   └─ INSERT INTO cash_transactions
       - cash_session_id: 1
       - transaction_type_id: 1 (sale)
       - payment_id: [id del pago]
       - amount: 141.60
       - reference: "Orden #1"
       - created_by: 3

5. Cliente solicita BOLETA
   └─ SELECT * FROM invoice_series 
       WHERE branch_id = 1 
       AND document_type_id = 1 (Boleta)
       AND status = 'active'

6. Generar factura
   └─ INSERT INTO invoices
       - order_id: 1
       - series_id: 1 (B001)
       - invoice_number: 1 (siguiente número)
       - full_number: "B001-00001"
       - status_id: 2 (sent)
       - is_internal: false
       - customer_name: "Cliente Anónimo"
       - subtotal: 120.00
       - tax_amount: 21.60
       - total_amount: 141.60
       - issued_at: NOW()

7. Actualizar serie
   └─ UPDATE invoice_series SET next_number = 2
       WHERE id = 1

8. Cerrar orden
   └─ UPDATE orders SET 
       - status_id: 5 (delivered)
       - completed_at: NOW()

9. Liberar mesa
   └─ UPDATE tables SET status_id = 1 (available)
       WHERE id = 5

10. Imprimir ticket de pago
    └─ INSERT INTO printed_tickets
        - order_id: 1
        - printer_id: 1
        - ticket_type: "receipt"
        - content_json: {...}
        - print_status: "printed"

11. Actualizar límites mensuales en SUPER_ADMIN_DB
    └─ UPDATE customer_limits_cache SET
        - invoices_month_used = invoices_month_used + 1
        WHERE customer_id = 10

12. Validar límite del plan
    └─ Si invoices_month_used >= max_invoices_month
        └─ Notificar: "Has alcanzado el límite de tu plan"
________________________________________
📋 FLUJO 6: CIERRE DE CAJA (FIN DE TURNO)
Descripción: El cajero cierra su caja al final del día.
Tablas involucradas:
TENANT_DB:
├─ cash_sessions           ← Sesión a cerrar
├─ cash_transactions       ← Todas las transacciones
├─ cash_transaction_types  ← Tipos de movimiento
└─ users                   ← Usuario que cierra
Secuencia:
1. Cajero inicia cierre de caja
   └─ SELECT * FROM cash_sessions 
       WHERE cash_register_id = 1 AND status = 'open'

2. Calcular monto esperado
   └─ SELECT 
       opening_amount +
       SUM(CASE 
           WHEN ctt.affects_cash = 'increase' THEN ct.amount
           WHEN ctt.affects_cash = 'decrease' THEN -ct.amount
           ELSE 0
       END) AS expected_amount
       FROM cash_transactions ct
       JOIN cash_transaction_types ctt ON ct.transaction_type_id = ctt.id
       WHERE cash_session_id = 1

   └─ Resultado: 500.00 (inicial) + 141.60 (venta) = 641.60

3. Cajero cuenta efectivo físico
   └─ Ingresa: 641.60

4. Cerrar sesión
   └─ UPDATE cash_sessions SET
       - closed_by: 3
       - closing_amount: 641.60
       - expected_amount: 641.60
       - difference: 0.00 (641.60 - 641.60)
       - closed_at: NOW()
       - status: "closed"

5. Generar reporte de cierre
   └─ SELECT 
       - Total ventas en efectivo
       - Total ventas en tarjeta
       - Total egresos
       - Diferencia (cuadre de caja)
________________________________________
📋 FLUJO 7: CANJE DE NOTA DE VENTA A FACTURA
Descripción: Cliente compró con nota de venta y luego pide factura.
Tablas involucradas:
TENANT_DB:
├─ invoices                ← Nota original + Factura nueva
├─ invoice_series          ← Series de ambos documentos
├─ document_types          ← Nota de Venta + Factura
├─ document_exchanges      ← Registro del canje
└─ orders                  ← Orden original
Secuencia:
1. Buscar nota de venta original
   └─ SELECT * FROM invoices 
       WHERE full_number = "NV01-00005"
       AND is_internal = true

2. Validar que no esté canjeada
   └─ Si is_exchange = true → ERROR: "Ya fue canjeada"

3. Cliente proporciona datos de factura
   └─ customer_name: "Empresa XYZ SAC"
   └─ customer_tax_id: "20987654321"

4. Obtener serie de facturas
   └─ SELECT * FROM invoice_series 
       WHERE document_type_id = 2 (Factura)
       AND branch_id = 1

5. Generar factura
   └─ INSERT INTO invoices
       - order_id: [mismo de la nota]
       - series_id: 2 (F001)
       - invoice_number: 15
       - full_number: "F001-00015"
       - is_internal: false
       - exchanged_from_id: [id de la nota]
       - is_exchange: true
       - customer_name: "Empresa XYZ SAC"
       - customer_tax_id: "20987654321"
       - subtotal, tax_amount, total_amount: [mismo]

6. Actualizar serie
   └─ UPDATE invoice_series SET next_number = 16
       WHERE id = 2

7. Registrar el canje
   └─ INSERT INTO document_exchanges
       - original_invoice_id: [id nota]
       - new_invoice_id: [id factura]
       - exchange_reason: "Cliente solicitó factura"
       - exchanged_by: [user_id]

8. Marcar nota original como canjeada
   └─ UPDATE invoices SET
       - status_id: 5 (anulado)
       - voided_at: NOW()
       WHERE id = [id nota]

9. Enviar factura a SUNAT
   └─ Generar XML
   └─ Firmar digitalmente
   └─ Enviar a SUNAT
   └─ Guardar CDR

10. Actualizar rutas de archivos
    └─ UPDATE invoices SET
        - xml_path: "/facturas/F001-00015.xml"
        - pdf_path: "/facturas/F001-00015.pdf"
        - sunat_cdr_path: "/facturas/CDR-F001-00015.xml"
        WHERE id = [id factura]
________________________________________
📋 FLUJO 8: AGREGAR NUEVA SUCURSAL
Descripción: El cliente quiere abrir una segunda sucursal.
Tablas involucradas:
SUPER_ADMIN_DB:
├─ customer_subscriptions  ← Validar plan
├─ plans                   ← Límite de sucursales
└─ customer_limits_cache   ← Actualizar contadores

TENANT_DB:
├─ branches               ← Nueva sucursal
├─ floors                 ← Pisos de la nueva sucursal
├─ table_zones            ← Zonas de la nueva sucursal
├─ tables                 ← Mesas de la nueva sucursal
└─ cash_registers         ← Cajas de la nueva sucursal
Secuencia:
1. Usuario admin intenta crear sucursal
   └─ Sistema valida en SUPER_ADMIN_DB:

   └─ SELECT 
       cl.branches_used,
       p.max_branches
       FROM customer_limits_cache cl
       JOIN customer_subscriptions cs ON cl.customer_id = cs.customer_id
       JOIN plans p ON cs.plan_id = p.id
       WHERE cl.customer_id = 10 AND cs.status = 'active'

   └─ Resultado: branches_used = 1, max_branches = 5
   └─ Validación: 1 < 5 → PERMITIR

2. Crear sucursal en TENANT_DB
   └─ INSERT INTO branches
       - code: "SUR"
       - name: "Plaza Sur"
       - is_main: false
       - branch_id: 2

3. Crear pisos
   └─ INSERT INTO floors
       - (branch_id: 2, name: "Planta Baja", level: 0)

4. Crear zonas de mesas
   └─ INSERT INTO table_zones
       - (branch_id: 2, name: "Salón Principal")

5. Crear mesas
   └─ INSERT INTO tables
       - (branch_id: 2, code: "M01", capacity: 4)
       - ... (10 mesas)

6. Crear cajas
   └─ INSERT INTO cash_registers
       - (branch_id: 2, code: "CAJA-01")

7. Actualizar cache en SUPER_ADMIN_DB
   └─ UPDATE customer_limits_cache SET
       - branches_used: 2
       - tables_used: tables_used + 10
       - cash_registers_used: cash_registers_used + 1
       WHERE customer_id = 10




GEMINI PRO 

FLUJOS LÓGICOS DEL TENANT (RESTAURANTE)
1. Flujo de Login y Sesión
Este flujo es el que determina qué puede ver y hacer el usuario según su sucursal asignada.
•	Tablas involucradas: users, roles, user_branches, branches.
•	Proceso:
1.	El usuario ingresa credenciales.
2.	Se consulta users para validar el password_hash.
3.	Se cruza con roles para obtener el nivel de permiso.
4.	Se consulta user_branches para saber a qué sucursales tiene permiso.
5.	Contexto de App: El sistema debe "setear" una sucursal activa. Si tiene varias, el usuario elige una al entrar.
2. Flujo de Configuración de Menú y Precios
•	Tablas involucradas: categories, products, product_variants, branch_product_prices.
•	Proceso:
1.	Se crea la categoría (ej. "Vinos").
2.	Se crea el producto y su variante base (ej. "Copa Malbec" -> $10.00).
3.	Diferenciación: Si la "Sucursal Playa" vende esa copa a $15.00, se inserta en branch_product_prices vinculando el branch_id de la playa.
4.	Uso: Cuando el POS carga el menú, hace un LEFT JOIN entre la variante y los precios por sucursal, priorizando el precio específico si existe.
3. Flujo de Pedido (Comanda) y Cocina
•	Tablas involucradas: tables, orders, order_items, order_item_modifiers, kitchen_tickets.
•	Proceso:
1.	Apertura: Se selecciona una table. El status_id de la mesa cambia a "Ocupada".
2.	Cabecera: Se crea el registro en orders con el waiter_id y branch_id.
3.	Detalle: Por cada plato, se inserta en order_items. Si el cliente pide "Sin cebolla", se guarda en notes o en order_item_modifiers.
4.	Producción: Automáticamente se generan los kitchen_tickets dirigidos a la kitchen_station_id correspondiente (ej. lo que es bebida va al Bar, lo que es fuego va a Cocina).
4. Flujo de Pago y Facturación (El "Momento de la Verdad")
•	Tablas involucradas: payments, cash_sessions, electronic_invoices, inventory_movements, ingredient_stock.
•	Proceso:
1.	El cajero cierra la orden. Se registra el pago en payments vinculado a la cash_session_id activa.
2.	Fiscal: Se genera la electronic_invoice. Aquí se consume el correlativo legal (Serie-Número) de esa sucursal.
3.	Inventario: Por cada ítem vendido, el sistema busca la recipes. Por cada ingrediente, genera un inventory_movements de tipo "Salida por Venta" y resta el current_stock en esa sucursal específica.
________________________________________
💰 EL CIERRE DE CAJA CIEGO (Blind Close)
En un SaaS profesional, el "Cierre Ciego" es vital para evitar el robo hormiga.
¿Qué es?
Es un proceso donde el cajero no sabe cuánto dinero dice el sistema que debería haber. Él simplemente cuenta lo que tiene físicamente y lo declara. El sistema luego compara y reporta las diferencias al administrador.
Estructura del Flujo y Tablas:
•	Tablas: cash_sessions, cash_transactions, cash_registers.
El Proceso Paso a Paso:
1.	Apertura de Turno:
o	El cajero inicia sesión y abre caja con un monto inicial (ej. $50.00 para cambio).
o	Se crea un registro en cash_sessions con status = 'open'.
2.	Operación:
o	Durante el día, cada venta en efectivo o tarjeta genera un registro automático en cash_transactions (vía el flujo de pago).
o	Si el cajero saca dinero para comprar limpieza, registra una "Salida de Efectivo" manualmente en cash_transactions.
3.	Ejecución del Cierre Ciego:
o	Al terminar el turno, el cajero presiona "Cerrar Caja".
o	Punto Clave: El sistema NO le muestra el total de ventas. Le muestra un formulario vacío que dice: "¿Cuánto dinero físico tienes en billetes y monedas?".
o	El cajero cuenta su efectivo y escribe: "Tengo $450.50".
o	El cajero ingresa los vouchers de tarjeta (si el proceso es manual).
4.	Validación (Backend):
o	El sistema toma el opening_amount ($50) + suma de cash_transactions de entrada - suma de salidas.
o	Supongamos que el sistema calculó que debería haber $460.00 (expected_amount).
o	Como el cajero declaró $450.50 (closing_amount), el sistema calcula una difference de -$9.50.
5.	Resultado y Auditoría:
o	La cash_session cambia a status = 'closed' o 'audited'.
o	Se dispara una alerta al dueño (Super Admin o Gerente de Sucursal) indicando el descuadre.
o	El cajero ya no puede editar nada de esa sesión.
Por qué es mejor para tu SaaS:
•	Integridad: Evita que el cajero "ajuste" el dinero físico para que coincida con el sistema si se quedó con un vuelto.
•	Responsabilidad: Cada diferencia queda registrada en la base de datos con nombre y apellido para auditoría posterior.

