import { sql, relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, timestamp, index, varchar, boolean, time, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

export const tablaLobitoPrueba = pgTable('lobito_prueba', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 100 }).notNull(),
	edad: integer('edad').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// ==========================================
// 🏢 CONFIGURACIÓN LOCAL DEL RESTAURANTE
// ==========================================

export const tenantConfigs = pgTable('tenant_configs', {
	id: serial('id').primaryKey(), // Normalmente tendrá un único registro (ID: 1) por base de datos
	logo: varchar('logo', { length: 255 }),
	primaryColor: varchar('primary_color', { length: 255 }).default("#000000"),
	phone: varchar('phone', { length: 255 }),
	whatsapp: varchar('whatsapp', { length: 255 }),
	email: varchar('email', { length: 255 }),
	category: varchar('category', { length: 255 }), // Ej: 'Pollería', 'Chifa'

	// Datos de Ubicación y Delivery Pesados (Extraídos de la Maestra)
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

	// Configuración de Canales de Atención
	hasDelivery: boolean('has_delivery').default(false).notNull(),
	hasPickup: boolean('has_pickup').default(false).notNull(),
	hasDineIn: boolean('has_dine_in').default(false).notNull(),
	hasLiveTracking: boolean('has_live_tracking').default(false).notNull(),

	// Restricciones Económicas Locales
	minOrderAmount: decimal('min_order_amount', { precision: 10, scale: 2 }).default('0.00'),
	defaultDeliveryFee: decimal('default_delivery_fee', { precision: 10, scale: 2 }).default('0.00'),
	freeDeliveryThreshold: decimal('free_delivery_threshold', { precision: 10, scale: 2 }),

	// Datos Fiscales locales (RUC / Razón Social para boletas/facturas del restaurante)
	fiscalId: varchar('fiscal_id', { length: 255 }),
	fiscalName: varchar('fiscal_name', { length: 255 }),

	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ==========================================
// 👥 USUARIOS OPERATIVOS Y CONTROL DE ACCESO
// ==========================================

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	email: varchar('email', { length: 255 }).notNull().unique(), // Único únicamente dentro de este restaurante
	password: varchar('password', { length: 255 }).notNull(),
	name: varchar('name', { length: 255 }).notNull(),
	image: text('image'),
	role: varchar('role', { length: 255, enum: ['admin', 'kitchen', 'waiter', 'delivery'] }).notNull(), // Sin super-admin
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

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
// 🍽️ INFRAESTRUCTURA DEL LOCAL
// ==========================================

export const paymentMethods = pgTable('payment_methods', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 100 }).notNull(), // Ej: 'Yape', 'Efectivo', 'Visa'
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const tables = pgTable('restaurant_tables', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 50 }).notNull(), // Ej: 'Mesa 1'
	slug: varchar('slug', { length: 8 }).notNull().unique(), // URL única de la mesa directa en esta BD
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ==========================================
// 📦 CATÁLOGO / MENÚ DEL RESTAURANTE
// ==========================================

export const categories = pgTable('categories', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 50 }).notNull(),
	order: integer('order').default(0),
	isActive: boolean('is_active').default(true).notNull(),
	startTime: time('start_time'),
	endTime: time('end_time'),
	availableDays: jsonb('available_days').default([0, 1, 2, 3, 4, 5, 6]),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
	products: many(products),
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
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	categoryIdIdx: index('products_category_id_idx').on(table.categoryId),
}));

export const productsRelations = relations(products, ({ one }) => ({
	category: one(categories, {
		fields: [products.categoryId],
		references: [categories.id],
	}),
}));

// ==========================================
// 📝 FLUJO OPERATIVO DE PEDIDOS (ORDERS)
// ==========================================

export const orders = pgTable('orders', {
	id: varchar('id', { length: 12 }).primaryKey(), // NanoID / UUID Corto
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

	paymentMethod: text('payment_method').notNull(),
	notes: varchar('notes', { length: 100 }),

	subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
	deliveryFee: decimal('delivery_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
	total: decimal('total', { precision: 10, scale: 2 }).notNull(),

	status: text('status', {
		enum: ['pending', 'confirmed', 'preparing', 'dispatched', 'ready_for_pickup', 'completed', 'cancelled']
	}).default('pending').notNull(),

	paymentStatus: text('payment_status', {
		enum: ['unpaid', 'paid', 'review_pending']
	}).default('unpaid').notNull(),

	trackingCode: varchar('tracking_code', { length: 20 }).unique(),
	driverId: integer('driver_id').references(() => users.id), // Apunta al repartidor del propio tenant

	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const orderItems = pgTable('order_items', {
	id: serial('id').primaryKey(),
	orderId: varchar('order_id', { length: 12 }).references(() => orders.id, { onDelete: 'cascade' }).notNull(),
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
	url: text('url').notNull(),
	order: integer('order').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const socialLinks = pgTable('social_links', {
	id: serial('id').primaryKey(),
	platform: text('platform').notNull(), // Ej: 'facebook', 'instagram'
	url: text('url').notNull(),
	order: integer('order').notNull().default(0),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});