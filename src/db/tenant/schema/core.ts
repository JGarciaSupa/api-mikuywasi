import { relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, timestamp, index, varchar, boolean, time, jsonb, uniqueIndex, AnyPgColumn } from 'drizzle-orm/pg-core';

// ==========================================
// 🏷️ MARCAS
// ==========================================

// Cada marca agrupa un conjunto de sucursales bajo una identidad visual común.
// La corporación (tenant) puede tener múltiples marcas.
export const brands = pgTable('brands', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	code: varchar('code', { length: 20 }).notNull().unique(), // Ej: 'LOBITO', 'PIZZA-CO'
	logo: varchar('logo', { length: 255 }),
	primaryColor: varchar('primary_color', { length: 255 }).default('#000000'),
	email: varchar('email', { length: 255 }),
	category: varchar('category', { length: 255 }),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	codeIdx: index('brands_code_idx').on(table.code),
	activeIdx: index('brands_active_idx').on(table.isActive),
}));

// ==========================================
// 🏢 CONFIGURACIÓN GLOBAL DE MARCA
// ==========================================

// Un único registro (ID: 1) con datos de marca globales del restaurante.
// Los datos de ubicación/canales/fiscales ahora viven en branches.
export const tenantConfigs = pgTable('tenant_configs', {
	id: serial('id').primaryKey(),
	logo: varchar('logo', { length: 255 }),
	primaryColor: varchar('primary_color', { length: 255 }).default("#000000"),
	email: varchar('email', { length: 255 }),
	category: varchar('category', { length: 255 }),

	// Facturación electrónica: empresa por defecto del tenant (Caso A / fallback mixto).
	// Todas las sucursales sin facturadorEmpresaId propio heredan este valor.
	facturadorEmpresaId: integer('facturador_empresa_id'),
	facturadorRuc: varchar('facturador_ruc', { length: 20 }),

	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});


// ==========================================
// 🏪 SUCURSALES
// ==========================================

export const branches = pgTable('branches', {
	id: serial('id').primaryKey(),
	brandId: integer('brand_id').notNull().references(() => brands.id, { onDelete: 'restrict' }),
	name: varchar('name', { length: 100 }).notNull(),
	code: varchar('code', { length: 20 }).notNull().unique(), // Ej: 'MFL-01', 'SJM-01'
	isMain: boolean('is_main').default(false).notNull(),      // true = sucursal principal de la marca

	// Ubicación y canales propios de esta sede
	address: jsonb('address').$type<{
		fullAddress: string;
		lat: number;
		lng: number;
	}>(),
	deliveryZone: jsonb('delivery_zone').$type<{
		type: 'Polygon';
		coordinates: number[][][]; // GeoJSON
	} | null>(),
	schedules: jsonb('schedules').$type<{
		day: string;
		startTime: string;
		endTime: string;
		closed: boolean;
	}[]>().default([]),

	phone: varchar('phone', { length: 30 }),
	whatsapp: varchar('whatsapp', { length: 30 }),
	email: varchar('email', { length: 150 }),

	// Canales de atención por sede
	hasDelivery: boolean('has_delivery').default(false).notNull(),
	hasPickup: boolean('has_pickup').default(false).notNull(),
	hasDineIn: boolean('has_dine_in').default(false).notNull(),
	hasLiveTracking: boolean('has_live_tracking').default(false).notNull(),

	// Restricciones económicas por sede
	minOrderAmount: decimal('min_order_amount', { precision: 10, scale: 2 }).default('0.00'),
	defaultDeliveryFee: decimal('default_delivery_fee', { precision: 10, scale: 2 }).default('0.00'),
	freeDeliveryThreshold: decimal('free_delivery_threshold', { precision: 10, scale: 2 }),

	// País al que pertenece esta sucursal (ISO 3166-1, ej. 'PE', 'CL')
	countryCode: varchar('country_code', { length: 3 }),

	// Finanzas de la sede (ISO 4217, ej. 'PEN', 'USD'). El catálogo vive en la BD
	// master (tabla currencies) — igual que countryCode, se guarda el código suelto,
	// sin FK real, porque son bases de datos distintas.
	// baseCurrency: moneda principal transaccional de la sede.
	// foreignCurrency: si no es null, la apertura de turno de caja de esta sede exige tipo de cambio.
	baseCurrency: varchar('base_currency', { length: 3 }),
	foreignCurrency: varchar('foreign_currency', { length: 3 }),

	// Datos fiscales propios de la sede (RUC / Razón Social)
	fiscalId: varchar('fiscal_id', { length: 30 }),
	fiscalName: varchar('fiscal_name', { length: 200 }),

	// Facturación electrónica: empresa propia en el facturador (Caso B).
	// NULL → hereda la empresa del tenantConfigs (Caso A).
	facturadorEmpresaId: integer('facturador_empresa_id'),

	isActive: boolean('is_active').default(true).notNull(),
	allowSellWithoutStock: boolean('allow_sell_without_stock').default(false).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	brandIdx: index('branches_brand_idx').on(table.brandId),
	codeIdx: index('branches_code_idx').on(table.code),
	activeIdx: index('branches_active_idx').on(table.isActive),
}));

// ==========================================
// 👥 USUARIOS OPERATIVOS Y CONTROL DE ACCESO
// ==========================================

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	username: varchar('username', { length: 50 }).notNull().unique(),
	password: varchar('password', { length: 255 }).notNull(),
	name: varchar('name', { length: 255 }).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Asignación de usuarios a sucursales.
// Un usuario puede operar en una o varias sedes.
// El JWT lleva el branchId de la sesión activa.
export const userBranches = pgTable('user_branches', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	branchId: integer('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
	isDefault: boolean('is_default').default(false).notNull(), // Sucursal de inicio de sesión por defecto
	assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	unique: uniqueIndex('user_branches_unique_idx').on(table.userId, table.branchId),
	userIdx: index('user_branches_user_idx').on(table.userId),
	branchIdx: index('user_branches_branch_idx').on(table.branchId),
}));

export const refreshTokens = pgTable('refresh_tokens', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	tokenHash: text('token_hash').notNull().unique(),
	userAgent: varchar('user_agent', { length: 255 }),
	ipAddress: varchar('ip_address', { length: 100 }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	isRevoked: boolean('is_revoked').default(false).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	userIdIdx: index('refresh_tokens_user_id_idx').on(table.userId),
}));

// ==========================================
// 🛎️ CANALES DE VENTA (SIGG 2.6)
// ==========================================

// Catálogo de canales por tenant (Ej: "Salón", "Delivery Propio", "Rappi", "PedidosYa").
// Evita que cada sede tipee el nombre del canal de forma distinta.
export const salesChannels = pgTable('sales_channels', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	code: varchar('code', { length: 30 }).notNull().unique(), // Ej: 'SALON', 'DELIVERY-PROPIO', 'RAPPI'
	type: varchar('type', { length: 20, enum: ['dine_in', 'delivery', 'pickup'] as const }).notNull(),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	codeIdx: index('sales_channels_code_idx').on(table.code),
	activeIdx: index('sales_channels_active_idx').on(table.isActive),
}));

// Activación por sucursal: qué canales del catálogo atiende ESTA sede.
// Reemplaza los booleanos fijos hasDineIn/hasDelivery/hasPickup de `branches`.
// Presencia de la fila = canal activo. Sin fila = inactivo (no hace falta un booleano propio).
export const branchChannels = pgTable('branch_channels', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
	channelId: integer('channel_id').notNull().references(() => salesChannels.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchChannelUnique: uniqueIndex('branch_channels_unique_idx').on(table.branchId, table.channelId),
	branchIdx: index('branch_channels_branch_idx').on(table.branchId),
	channelIdx: index('branch_channels_channel_idx').on(table.channelId),
}));

// ==========================================
// 🍽️ INFRAESTRUCTURA DEL LOCAL
// ==========================================

export const paymentMethods = pgTable('payment_methods', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 100 }).notNull(), // Ej: 'Yape', 'Efectivo', 'Visa'
	branchId: integer('branch_id').references(() => branches.id), // null = disponible en todas las sedes
	retentionPercentage: decimal('retention_percentage', { precision: 5, scale: 2 }).default('0.00').notNull(),
	// true = este método es EFECTIVO físico y cuenta en el arqueo de la caja
	isCash: boolean('is_cash').default(false).notNull(),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('payment_methods_branch_idx').on(table.branchId),
}));

export const tables = pgTable('restaurant_tables', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id),
	name: varchar('name', { length: 50 }).notNull(), // Ej: 'Mesa 1'
	slug: varchar('slug', { length: 8 }).notNull().unique(), // URL única del QR de la mesa
	capacity: integer('capacity').default(1),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('restaurant_tables_branch_idx').on(table.branchId),
}));

// ==========================================
// 📦 CATÁLOGO / MENÚ DEL RESTAURANTE
// ==========================================

// Catálogo global — compartido entre todas las sucursales.
// Si se necesitan precios distintos por sede en el futuro, usar branch_product_prices.

export const categories = pgTable('categories', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').references(() => branches.id),
	parentId: integer('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'cascade' }),
	name: varchar('name', { length: 50 }).notNull(),
	order: integer('order').default(0),
	isActive: boolean('is_active').default(true).notNull(),
	startTime: time('start_time'),
	endTime: time('end_time'),
	availableDays: jsonb('available_days').default([0, 1, 2, 3, 4, 5, 6]),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('categories_branch_idx').on(table.branchId),
	parentIdx: index('categories_parent_idx').on(table.parentId),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
	products: many(products),
	branch: one(branches, { fields: [categories.branchId], references: [branches.id] }),
}));

export const products = pgTable('products', {
	id: serial('id').primaryKey(),
	categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
	name: varchar('name', { length: 150 }).notNull(),
	description: text('description'),
	price: decimal('price', { precision: 10, scale: 2 }).notNull(),
	discountPrice: decimal('discount_price', { precision: 10, scale: 2 }),
	packagingFee: decimal('packaging_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
	image: text('image'),
	order: integer('order').default(0),
	alternatives: jsonb('alternatives').$type<{
		name: string;
		extraPrice: number;
	}[]>().default([]), // Ej: Cremas, término de carne, etc.
	isActive: boolean('is_active').default(true).notNull(),
	allowSellWithoutStock: boolean('allow_sell_without_stock').default(false).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	categoryIdIdx: index('products_category_id_idx').on(table.categoryId),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
	category: one(categories, {
		fields: [products.categoryId],
		references: [categories.id],
	}),
	kitchenStationAssignments: many(productKitchenStations),
}));

// ==========================================
// 🍳 ESTACIONES DE COCINA Y RUTEO (SIGG 2.7)
// ==========================================

// Catálogo de estaciones por tenant (Ej: "Bar", "Cocina Caliente", "Cocina Fría").
// Distinto de `storage_areas` (warehouse.ts), que es almacén/inventario, no ruteo de pedidos.
export const kitchenStations = pgTable('kitchen_stations', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	code: varchar('code', { length: 30 }).notNull().unique(), // Ej: 'BAR', 'COCINA-CALIENTE'
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	codeIdx: index('kitchen_stations_code_idx').on(table.code),
	activeIdx: index('kitchen_stations_active_idx').on(table.isActive),
}));

// Pivote: a qué estación(es) se despacha cada producto. El admin lo define una sola
// vez a nivel de catálogo y todas las sucursales heredan la regla de ruteo.
export const productKitchenStations = pgTable('product_kitchen_stations', {
	id: serial('id').primaryKey(),
	productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
	stationId: integer('station_id').notNull().references(() => kitchenStations.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	productStationUnique: uniqueIndex('product_kitchen_stations_unique_idx').on(table.productId, table.stationId),
	productIdx: index('product_kitchen_stations_product_idx').on(table.productId),
	stationIdx: index('product_kitchen_stations_station_idx').on(table.stationId),
}));

export const kitchenStationsRelations = relations(kitchenStations, ({ many }) => ({
	productAssignments: many(productKitchenStations),
}));

export const productKitchenStationsRelations = relations(productKitchenStations, ({ one }) => ({
	product: one(products, { fields: [productKitchenStations.productId], references: [products.id] }),
	station: one(kitchenStations, { fields: [productKitchenStations.stationId], references: [kitchenStations.id] }),
}));

// Confirmación de "listo" por estación, por pedido. El pedido completo pasa a
// ready_for_pickup recién cuando TODAS las estaciones que tocó confirmaron —
// evita que una estación marque como lista la parte de otra que aún no terminó.
export const orderStationConfirmations = pgTable('order_station_confirmations', {
	id: serial('id').primaryKey(),
	orderId: varchar('order_id', { length: 12 }).notNull().references(() => orders.id, { onDelete: 'cascade' }),
	stationId: integer('station_id').notNull().references(() => kitchenStations.id, { onDelete: 'cascade' }),
	confirmedAt: timestamp('confirmed_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	orderStationUnique: uniqueIndex('order_station_confirmations_unique_idx').on(table.orderId, table.stationId),
	orderIdx: index('order_station_confirmations_order_idx').on(table.orderId),
}));

export const orderStationConfirmationsRelations = relations(orderStationConfirmations, ({ one }) => ({
	order: one(orders, { fields: [orderStationConfirmations.orderId], references: [orders.id] }),
	station: one(kitchenStations, { fields: [orderStationConfirmations.stationId], references: [kitchenStations.id] }),
}));

// ==========================================
// 📝 FLUJO OPERATIVO DE PEDIDOS (ORDERS)
// ==========================================

export const orders = pgTable('orders', {
	id: varchar('id', { length: 12 }).primaryKey(), // NanoID / UUID Corto
	branchId: integer('branch_id').notNull().references(() => branches.id),
	customerName: varchar('customer_name', { length: 100 }).notNull(),
	customerPhone: varchar('customer_phone', { length: 20 }),
	customerAddress: text('customer_address'),
	deliveryInfo: jsonb('delivery_info').$type<{
		lat: number;
		lng: number;
		reference: string;
	}>(),

	deliveryType: text('delivery_type', { enum: ['delivery', 'pickup', 'dine_in'] }).notNull(),
	tableId: integer('table_id').references(() => tables.id),
	tableName: varchar('table_name', { length: 50 }),

	paymentMethod: text('payment_method'), // método: null al crear (interno); web guarda el previsto; se define al cobrar
	paymentMethodId: integer('payment_method_id').references(() => paymentMethods.id), // relación estable (rename-proof)
	notes: varchar('notes', { length: 100 }),

	subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
	deliveryFee: decimal('delivery_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
	retentionPercentage: decimal('retention_percentage', { precision: 5, scale: 2 }).default('0.00').notNull(),
	retentionAmount: decimal('retention_amount', { precision: 10, scale: 2 }).default('0.00').notNull(),
	total: decimal('total', { precision: 10, scale: 2 }).notNull(),

	status: text('status', {
		enum: ['pending', 'confirmed', 'preparing', 'dispatched', 'ready_for_pickup', 'completed', 'cancelled']
	}).default('pending').notNull(),

	paymentStatus: text('payment_status', {
		enum: ['unpaid', 'paid', 'review_pending']
	}).default('unpaid').notNull(),

	trackingCode: varchar('tracking_code', { length: 20 }).unique(),
	driverId: integer('driver_id').references(() => users.id), // Repartidor de esta sede
	// Turno del mozo que generó el pedido (para trazabilidad de ventas por vendedor).
	cashSessionId: integer('cash_session_id'), // FK lógica a cash_sessions (warehouse.ts)
	// Turno del cajero que cobró el pedido (para atribución del ingreso en caja).
	// Se setea al marcar como pagado; el ingreso va a este turno, no al del mozo.
	collectedSessionId: integer('collected_session_id'), // FK lógica a cash_sessions

	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('orders_branch_idx').on(table.branchId),
	statusIdx: index('orders_status_idx').on(table.status),
	cashSessionIdx: index('orders_cash_session_idx').on(table.cashSessionId),
	collectedSessionIdx: index('orders_collected_session_idx').on(table.collectedSessionId),
}));

// Cuentas separadas dentro de un pedido (para dividir la facturación)
export const orderSplits = pgTable('order_splits', {
	id: serial('id').primaryKey(),
	orderId: varchar('order_id', { length: 12 }).notNull().references(() => orders.id, { onDelete: 'cascade' }),
	label: varchar('label', { length: 100 }).notNull().default('Cuenta'),
	paymentStatus: text('payment_status', {
		enum: ['unpaid', 'paid', 'review_pending']
	}).default('unpaid').notNull(),
	paymentMethod: text('payment_method'), // snapshot del nombre
	paymentMethodId: integer('payment_method_id').references(() => paymentMethods.id), // relación estable
	subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull().default('0.00'),
	retentionPercentage: decimal('retention_percentage', { precision: 5, scale: 2 }).default('0.00').notNull(),
	retentionAmount: decimal('retention_amount', { precision: 10, scale: 2 }).default('0.00').notNull(),
	total: decimal('total', { precision: 10, scale: 2 }).notNull().default('0.00'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	orderIdx: index('order_splits_order_idx').on(table.orderId),
}));

export const orderItems = pgTable('order_items', {
	id: serial('id').primaryKey(),
	orderId: varchar('order_id', { length: 12 }).references(() => orders.id, { onDelete: 'cascade' }).notNull(),
	splitId: integer('split_id').references(() => orderSplits.id, { onDelete: 'set null' }),
	productId: integer('product_id').references(() => products.id),
	productName: varchar('product_name', { length: 150 }).notNull(),
	unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
	quantity: integer('quantity').notNull(),
	selectedAlternatives: jsonb('selected_alternatives').$type<{ name: string, extraPrice: number }[]>().default([]),
	packagingFee: decimal('packaging_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
	notes: varchar('notes', { length: 100 }),
	totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
});

// ==========================================
// 🎨 PERSONALIZACIÓN DE INTERFAZ WEB/WEBAPP
// ==========================================

export const banners = pgTable('banners', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').references(() => branches.id), // null = banner global
	url: text('url').notNull(),
	order: integer('order').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('banners_branch_idx').on(table.branchId),
}));

export const socialLinks = pgTable('social_links', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').references(() => branches.id), // null = link global
	platform: text('platform').notNull(), // Ej: 'facebook', 'instagram'
	url: text('url').notNull(),
	order: integer('order').notNull().default(0),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('social_links_branch_idx').on(table.branchId),
}));

// ==========================================
// 🔗 RELATIONS — CORE
// ==========================================

export const brandsRelations = relations(brands, ({ many }) => ({
	branches: many(branches),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
	brand: one(brands, { fields: [branches.brandId], references: [brands.id] }),
	userBranches: many(userBranches),
	tables: many(tables),
	orders: many(orders),
	paymentMethods: many(paymentMethods),
	banners: many(banners),
	socialLinks: many(socialLinks),
	categories: many(categories),
	branchChannels: many(branchChannels),
}));

export const salesChannelsRelations = relations(salesChannels, ({ many }) => ({
	branchChannels: many(branchChannels),
}));

export const branchChannelsRelations = relations(branchChannels, ({ one }) => ({
	branch: one(branches, { fields: [branchChannels.branchId], references: [branches.id] }),
	channel: one(salesChannels, { fields: [branchChannels.channelId], references: [salesChannels.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
	refreshTokens: many(refreshTokens),
	userBranches: many(userBranches),
}));

export const userBranchesRelations = relations(userBranches, ({ one }) => ({
	user: one(users, { fields: [userBranches.userId], references: [users.id] }),
	branch: one(branches, { fields: [userBranches.branchId], references: [branches.id] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
	user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const tablesRelations = relations(tables, ({ one, many }) => ({
	branch: one(branches, { fields: [tables.branchId], references: [branches.id] }),
	orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
	branch: one(branches, { fields: [orders.branchId], references: [branches.id] }),
	table: one(tables, { fields: [orders.tableId], references: [tables.id] }),
	driver: one(users, { fields: [orders.driverId], references: [users.id] }),
	orderItems: many(orderItems),
	splits: many(orderSplits),
}));

export const orderSplitsRelations = relations(orderSplits, ({ one, many }) => ({
	order: one(orders, { fields: [orderSplits.orderId], references: [orders.id] }),
	items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
	order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
	split: one(orderSplits, { fields: [orderItems.splitId], references: [orderSplits.id] }),
	product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));
