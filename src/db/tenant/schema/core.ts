import { relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, real, timestamp, index, varchar, boolean, time, jsonb, uniqueIndex, uuid, AnyPgColumn } from 'drizzle-orm/pg-core';
import { customers } from './customers';

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

	// Configuración de impuestos por sucursal. Cada ítem representa un switch
	// operativo editable desde la sucursal y usado por POS/cobro/facturación.
	taxes: jsonb('taxes').$type<{
		key: string;
		label: string;
		rate: number;
		defaultActive: boolean;
		isActive: boolean;
	}[]>(),

	sunatAnexo: varchar('sunat_anexo', { length: 4 }),
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
// branchId: dueño del canal. null = canal global, disponible para todas las sucursales.
// Reemplaza al antiguo pivote branch_channels (many-to-many): ahora cada canal
// pertenece a lo sumo a una sucursal, o a ninguna (global).
export const salesChannels = pgTable('sales_channels', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').references(() => branches.id, { onDelete: 'set null' }),
	name: varchar('name', { length: 100 }).notNull(),
	code: varchar('code', { length: 30 }).notNull().unique(), // Ej: 'SALON', 'DELIVERY-PROPIO', 'RAPPI'
	classificationCode: varchar('classification_code', { length: 50 }), // FK Lógica a master.sales_channel_classifications
	isActive: boolean('is_active').default(true).notNull(),
	isWaiterEnabled: boolean('is_waiter_enabled').default(false).notNull(), // Activar mozo
	requireTable: boolean('require_table').default(false).notNull(), // Exigir mesa
	requireWaiter: boolean('require_waiter').default(false).notNull(), // Exigir mozo
	requirePax: boolean('require_pax').default(false).notNull(), // Exigir pax
	requireCustomer: boolean('require_customer').default(false).notNull(), // Exigir cliente frecuente
	requireDeliveryAddress: boolean('require_delivery_address').default(false).notNull(), // Exigir entregar a (dirección o destinatario)
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	codeIdx: index('sales_channels_code_idx').on(table.code),
	activeIdx: index('sales_channels_active_idx').on(table.isActive),
	branchIdx: index('sales_channels_branch_idx').on(table.branchId),
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

// Salones (ambientes) de una sucursal: "Terraza", "Salón Principal", "Barra".
// Un salón agrupa muchas mesas; una mesa pertenece a lo sumo a UN salón
// (FK nullable en restaurant_tables — mesa sin salón = salonId NULL).
export const salons = pgTable('salons', {
	id: uuid('id').primaryKey().defaultRandom(),
	branchId: integer('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
	name: varchar('name', { length: 100 }).notNull(), // Ej: 'Terraza', 'Salón Principal'
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('salons_branch_idx').on(table.branchId),
}));

export const tables = pgTable('restaurant_tables', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id),
	// Salón al que pertenece la mesa. NULL = mesa sin salón (se puede asignar después).
	// Al eliminar un salón sus mesas quedan sin salón, no se eliminan.
	salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'set null' }),
	name: varchar('name', { length: 50 }).notNull(), // Ej: 'Mesa 1'
	slug: varchar('slug', { length: 8 }).notNull().unique(), // URL única del QR de la mesa
	capacity: integer('capacity').default(1),
	// Posición en el mapa visual de mesas: % del lienzo del salón (0-100). NULL = mesa aún sin ubicar.
	posX: real('pos_x'),
	posY: real('pos_y'),
	shape: varchar('shape', { length: 10, enum: ['square', 'round'] as const }).default('square'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('restaurant_tables_branch_idx').on(table.branchId),
	salonIdx: index('restaurant_tables_salon_idx').on(table.salonId),
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
	// Código de estación de cocina por defecto para los productos de esta categoría
	// (SIGG 2.7). Se guarda por CÓDIGO, no por ID: como las estaciones son por
	// sucursal, una categoría compartida entre sedes no puede apuntar a un ID fijo
	// de una sola sede. Se resuelve buscando ese código en la sucursal del pedido.
	// Un producto hereda de su subcategoría, y si esta no tiene, de su categoría padre.
	// Un producto puede seguir teniendo su propia excepción en product_kitchen_stations.
	kitchenStationCode: varchar('kitchen_station_code', { length: 30 }),
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
	// Stock manual del producto (independiente del almacén/insumos). null = sin límite de stock.
	stock: integer('stock'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	categoryIdIdx: index('products_category_id_idx').on(table.categoryId),
}));

export const productSalesChannelPrices = pgTable('product_sales_channel_prices', {
	id: serial('id').primaryKey(),
	productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
	salesChannelId: integer('sales_channel_id').notNull().references(() => salesChannels.id, { onDelete: 'cascade' }),
	price: decimal('price', { precision: 10, scale: 2 }).notNull(),
	discountPrice: decimal('discount_price', { precision: 10, scale: 2 }),
	taxes: jsonb('taxes').$type<{
		key: string;
		label: string;
		rate: number;
		isActive: boolean;
	}[]>(),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	productChannelUnique: uniqueIndex('product_sales_channel_prices_unique_idx').on(table.productId, table.salesChannelId),
	productIdx: index('product_sales_channel_prices_product_idx').on(table.productId),
	channelIdx: index('product_sales_channel_prices_channel_idx').on(table.salesChannelId),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
	category: one(categories, {
		fields: [products.categoryId],
		references: [categories.id],
	}),
	kitchenStationAssignments: many(productKitchenStations),
	channelPrices: many(productSalesChannelPrices),
}));

export const productSalesChannelPricesRelations = relations(productSalesChannelPrices, ({ one }) => ({
	product: one(products, { fields: [productSalesChannelPrices.productId], references: [products.id] }),
	channel: one(salesChannels, { fields: [productSalesChannelPrices.salesChannelId], references: [salesChannels.id] }),
}));

// ==========================================
// 🍳 ESTACIONES DE COCINA Y RUTEO (SIGG 2.7)
// ==========================================

// Catálogo de estaciones POR SUCURSAL (Ej: "Bar", "Cocina Caliente", "Cocina Fría").
// Cada local tiene sus propias filas — Local 1 sin Bar no ve ni administra el
// "Bar" de Local 3 (US 1.5: "CRUD de Áreas de Producción... utilizadas por local").
// Distinto de `storage_areas` (warehouse.ts), que es almacén/inventario, no ruteo de pedidos.
export const kitchenStations = pgTable('kitchen_stations', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
	name: varchar('name', { length: 100 }).notNull(),
	code: varchar('code', { length: 30 }).notNull(), // Ej: 'BAR', 'COCINA-CALIENTE' — único POR sucursal, no global
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchCodeUnique: uniqueIndex('kitchen_stations_branch_code_unique_idx').on(table.branchId, table.code),
	branchIdx: index('kitchen_stations_branch_idx').on(table.branchId),
	activeIdx: index('kitchen_stations_active_idx').on(table.isActive),
}));

// Pivote: excepción puntual de un producto (tenant-wide, sin sucursal propia) a una
// estación. Se guarda por CÓDIGO, no por ID: como cada sucursal tiene su propia fila
// de "Bar" con un ID distinto, la excepción se resuelve buscando ese código dentro de
// la sucursal del pedido en curso (ver resolveEffectiveStations).
export const productKitchenStations = pgTable('product_kitchen_stations', {
	id: serial('id').primaryKey(),
	productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
	stationCode: varchar('station_code', { length: 30 }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	productStationUnique: uniqueIndex('product_kitchen_stations_unique_idx').on(table.productId, table.stationCode),
	productIdx: index('product_kitchen_stations_product_idx').on(table.productId),
}));

export const kitchenStationsRelations = relations(kitchenStations, ({ one }) => ({
	branch: one(branches, { fields: [kitchenStations.branchId], references: [branches.id] }),
}));

export const productKitchenStationsRelations = relations(productKitchenStations, ({ one }) => ({
	product: one(products, { fields: [productKitchenStations.productId], references: [products.id] }),
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
	// Cliente frecuente vinculado (opcional). customerName/Phone/Address se mantienen
	// como snapshot histórico del pedido — no se eliminan ni se derivan de aquí; un
	// pedido anónimo sigue siendo válido con customerId=null.
	customerId: integer('customer_id').references(() => customers.id),
	customerName: varchar('customer_name', { length: 100 }).notNull(),
	customerPhone: varchar('customer_phone', { length: 20 }),
	customerAddress: text('customer_address'),
	deliveryInfo: jsonb('delivery_info').$type<{
		lat: number;
		lng: number;
		reference: string;
	}>(),

	deliveryType: varchar('delivery_type', { length: 50 }).notNull(),
	salesChannelId: integer('sales_channel_id').references(() => salesChannels.id),
	salesChannelName: varchar('sales_channel_name', { length: 100 }),
	tableId: integer('table_id').references(() => tables.id),
	tableName: varchar('table_name', { length: 50 }),
	// Pax (comensales) cuando el canal de venta lo exige (requirePax). Se separan
	// adultos/niños para reportes de aforo y, a futuro, tarifas diferenciadas.
	paxAdults: integer('pax_adults'),
	paxChildren: integer('pax_children'),

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
	// Mozo asignado al pedido cuando el canal de venta lo activa/exige (isWaiterEnabled/requireWaiter).
	waiterId: integer('waiter_id').references(() => users.id),
	// Turno del mozo que generó el pedido (para trazabilidad de ventas por vendedor).
	cashSessionId: integer('cash_session_id'), // FK lógica a cash_sessions (warehouse.ts)
	// Turno del cajero que cobró el pedido (para atribución del ingreso en caja).
	// Se setea al marcar como pagado; el ingreso va a este turno, no al del mozo.
	collectedSessionId: integer('collected_session_id'), // FK lógica a cash_sessions
	taxBreakdown: jsonb('tax_breakdown').$type<{
		key: string;
		label: string;
		sunatCode?: string;
		rate: number;
		calculationType?: 'percentage' | 'fixed';
		defaultActive?: boolean;
		isActive: boolean;
		amount?: number;
	}[]>(),

	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('orders_branch_idx').on(table.branchId),
	customerIdx: index('orders_customer_idx').on(table.customerId),
	statusIdx: index('orders_status_idx').on(table.status),
	cashSessionIdx: index('orders_cash_session_idx').on(table.cashSessionId),
	collectedSessionIdx: index('orders_collected_session_idx').on(table.collectedSessionId),
	// Reportes y listados filtran siempre por sucursal + rango de fechas
	branchCreatedAtIdx: index('orders_branch_created_at_idx').on(table.branchId, table.createdAt),
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
	salesChannelId: integer('sales_channel_id').references(() => salesChannels.id),
	productName: varchar('product_name', { length: 150 }).notNull(),
	unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
	quantity: integer('quantity').notNull(),
	selectedAlternatives: jsonb('selected_alternatives').$type<{ name: string, extraPrice: number }[]>().default([]),
	packagingFee: decimal('packaging_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
	notes: varchar('notes', { length: 100 }),
	totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
	// Costo unitario de la receta del producto congelado al crear el pedido
	// (insumos a precio promedio de ese momento). NULL: sin receta o pedido
	// anterior a esta columna; los reportes recalculan con precios actuales.
	unitCost: decimal('unit_cost', { precision: 10, scale: 4 }),
	taxSnapshot: jsonb('tax_snapshot').$type<{
		key: string;
		label: string;
		sunatCode?: string;
		rate: number;
		calculationType?: 'percentage' | 'fixed';
		defaultActive?: boolean;
		isActive: boolean;
		amount?: number;
	}[]>(),
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
	salons: many(salons),
	tables: many(tables),
	orders: many(orders),
	paymentMethods: many(paymentMethods),
	banners: many(banners),
	socialLinks: many(socialLinks),
	categories: many(categories),
	salesChannels: many(salesChannels),
}));

export const salesChannelsRelations = relations(salesChannels, ({ one }) => ({
	branch: one(branches, { fields: [salesChannels.branchId], references: [branches.id] }),
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

export const salonsRelations = relations(salons, ({ one, many }) => ({
	branch: one(branches, { fields: [salons.branchId], references: [branches.id] }),
	tables: many(tables),
}));

export const tablesRelations = relations(tables, ({ one, many }) => ({
	branch: one(branches, { fields: [tables.branchId], references: [branches.id] }),
	salon: one(salons, { fields: [tables.salonId], references: [salons.id] }),
	orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
	branch: one(branches, { fields: [orders.branchId], references: [branches.id] }),
	customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
	table: one(tables, { fields: [orders.tableId], references: [tables.id] }),
	driver: one(users, { fields: [orders.driverId], references: [users.id] }),
	waiter: one(users, { fields: [orders.waiterId], references: [users.id] }),
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
