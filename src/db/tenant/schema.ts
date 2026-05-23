import { sql, relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, timestamp, index, varchar, boolean, time, jsonb, uniqueIndex, date, bigserial } from 'drizzle-orm/pg-core';

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
	username: varchar('username', { length: 50 }).notNull().unique(),
	password: varchar('password', { length: 255 }).notNull(),
	name: varchar('name', { length: 255 }).notNull(),
	image: text('image'),
	role: varchar('role', { length: 255, enum: ['admin', 'kitchen', 'waiter', 'delivery'] }).notNull(),
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

// ==========================================
// 🏬 WAREHOUSE — CATALOGUE
// ==========================================

export const itemFamilies = pgTable('item_families', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 100 }).notNull().unique(),
	description: varchar('description', { length: 255 }),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const itemSubfamilies = pgTable('item_subfamilies', {
	id: serial('id').primaryKey(),
	familyId: integer('family_id').notNull().references(() => itemFamilies.id),
	name: varchar('name', { length: 100 }).notNull(),
	description: varchar('description', { length: 255 }),
	isActive: boolean('is_active').default(true).notNull(),
}, (table) => ({
	familyNameUnique: uniqueIndex('item_subfamilies_family_name_idx').on(table.familyId, table.name),
}));

export const storageAreas = pgTable('storage_areas', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 100 }).notNull().unique(),
	type: varchar('type', { length: 50, enum: ['ambient', 'cold', 'frozen', 'sub_warehouse'] as const })
		.notNull().default('ambient'),
	isCentral: boolean('is_central').default(false).notNull(),
	description: varchar('description', { length: 255 }),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const suppliers = pgTable('suppliers', {
	id: serial('id').primaryKey(),
	taxId: varchar('tax_id', { length: 20 }).unique(),
	legalName: varchar('legal_name', { length: 200 }).notNull(),
	tradeName: varchar('trade_name', { length: 200 }),
	contactPerson: varchar('contact_person', { length: 100 }),
	phone: varchar('phone', { length: 30 }).notNull().default('-'),
	email: varchar('email', { length: 150 }).notNull().default('-'),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// ==========================================
// 🏬 WAREHOUSE — ITEM MASTER
// ==========================================

export const items = pgTable('items', {
	id: serial('id').primaryKey(),
	code: varchar('code', { length: 20 }).notNull().unique(),
	fullDescription: varchar('full_description', { length: 200 }).notNull(),
	shortDescription: varchar('short_description', { length: 100 }).notNull(),
	subfamilyId: integer('subfamily_id').notNull().references(() => itemSubfamilies.id),
	itemType: varchar('item_type', { length: 50, enum: ['goods', 'service', 'fixed_asset'] as const })
		.notNull().default('goods'),
	ledgerUnit: varchar('ledger_unit', { length: 30 }).notNull(),
	costUnit: varchar('cost_unit', { length: 30 }).notNull(),
	conversionFactor: decimal('conversion_factor', { precision: 12, scale: 4 }).notNull().default('1'),
	minStock: decimal('min_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	maxStock: decimal('max_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	targetStock: decimal('target_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	currentStock: decimal('current_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	expiryDays: integer('expiry_days').notNull().default(0),
	marketPrice: decimal('market_price', { precision: 12, scale: 4 }).notNull().default('0'),
	avgPrice: decimal('avg_price', { precision: 12, scale: 4 }).notNull().default('0'),
	transferPrice: decimal('transfer_price', { precision: 12, scale: 4 }).notNull().default('0'),
	costValue: decimal('cost_value', { precision: 12, scale: 4 }).notNull().default('0'),
	isActive: boolean('is_active').default(true).notNull(),
	dailyControl: boolean('daily_control').default(true).notNull(),
	portionable: boolean('portionable').default(false).notNull(),
	useMarketPrice: boolean('use_market_price').default(false).notNull(),
	recipeDischarge: boolean('recipe_discharge').default(false).notNull(),
	printCriteria: varchar('print_criteria', { length: 100 }),
	externalCode: varchar('external_code', { length: 50 }),
	taxCode: varchar('tax_code', { length: 30 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
	updatedBy: varchar('updated_by', { length: 100 }),
}, (table) => ({
	subfamilyIdx: index('items_subfamily_idx').on(table.subfamilyId),
	codeIdx: index('items_code_idx').on(table.code),
	activeIdx: index('items_active_idx').on(table.isActive),
}));

export const itemAreaAssignments = pgTable('item_area_assignments', {
	id: serial('id').primaryKey(),
	itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	isActive: boolean('is_active').default(true).notNull(),
}, (table) => ({
	itemAreaUnique: uniqueIndex('item_area_assignments_unique_idx').on(table.itemId, table.areaId),
}));

// ==========================================
// 🏬 WAREHOUSE — PURCHASE DOCUMENTS
// ==========================================

export const purchaseDocuments = pgTable('purchase_documents', {
	id: serial('id').primaryKey(),
	documentType: varchar('document_type', { length: 30, enum: ['invoice', 'receipt', 'delivery_note'] as const }).notNull(),
	series: varchar('series', { length: 10 }).notNull(),
	sequential: varchar('sequential', { length: 20 }).notNull(),
	supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
	issueDate: date('issue_date').notNull(),
	entryDate: date('entry_date').notNull().default(sql`CURRENT_DATE`),
	paymentDate: date('payment_date'),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	entryType: varchar('entry_type', { length: 30, enum: ['goods', 'service', 'fixed_asset'] as const })
		.notNull().default('goods'),
	taxOperation: varchar('tax_operation', { length: 20, enum: ['taxed', 'exempt', 'unaffected'] as const })
		.notNull().default('taxed'),
	currency: varchar('currency', { length: 10 }).notNull().default('PEN'),
	exchangeRate: decimal('exchange_rate', { precision: 8, scale: 4 }).notNull().default('1'),
	notes: varchar('notes', { length: 200 }),
	reference: varchar('reference', { length: 100 }),
	subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
	tax: decimal('tax', { precision: 12, scale: 2 }).notNull().default('0'),
	total: decimal('total', { precision: 12, scale: 2 }).notNull().default('0'),
	rounding: decimal('rounding', { precision: 8, scale: 4 }).notNull().default('0'),
	totalDiscount: decimal('total_discount', { precision: 12, scale: 2 }).notNull().default('0'),
	status: varchar('status', { length: 20, enum: ['draft', 'processed', 'voided'] as const })
		.notNull().default('draft'),
	internalNumber: varchar('internal_number', { length: 30 }),
	createdBy: varchar('created_by', { length: 100 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => ({
	seriesSeqSupplierUnique: uniqueIndex('purchase_docs_series_seq_supplier_idx')
		.on(table.series, table.sequential, table.supplierId),
	supplierIdx: index('purchase_docs_supplier_idx').on(table.supplierId),
	areaIdx: index('purchase_docs_area_idx').on(table.areaId),
	statusIdx: index('purchase_docs_status_idx').on(table.status),
	dateIdx: index('purchase_docs_date_idx').on(table.entryDate),
}));

export const purchaseDocumentLines = pgTable('purchase_document_lines', {
	id: serial('id').primaryKey(),
	documentId: integer('document_id').notNull().references(() => purchaseDocuments.id, { onDelete: 'cascade' }),
	itemId: integer('item_id').notNull().references(() => items.id),
	qty: decimal('qty', { precision: 12, scale: 3 }).notNull(),
	unitPrice: decimal('unit_price', { precision: 12, scale: 4 }).notNull(),
	lineTotal: decimal('line_total', { precision: 12, scale: 2 }).notNull(),
	taxPct: decimal('tax_pct', { precision: 5, scale: 2 }).notNull().default('18'),
	taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
	discount: decimal('discount', { precision: 12, scale: 2 }).notNull().default('0'),
	otherCharges: decimal('other_charges', { precision: 12, scale: 2 }).notNull().default('0'),
	notes: varchar('notes', { length: 200 }),
});

// ==========================================
// 🏬 WAREHOUSE — REQUISITIONS
// ==========================================

export const requisitions = pgTable('requisitions', {
	id: serial('id').primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	attendedAt: timestamp('attended_at', { withTimezone: true }),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	areaManager: varchar('area_manager', { length: 100 }),
	reference: varchar('reference', { length: 100 }),
	status: varchar('status', { length: 20, enum: ['draft', 'processed', 'voided'] as const })
		.notNull().default('draft'),
	createdBy: varchar('created_by', { length: 100 }),
	processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => ({
	areaIdx: index('requisitions_area_idx').on(table.areaId),
	statusIdx: index('requisitions_status_idx').on(table.status),
	dateIdx: index('requisitions_date_idx').on(table.createdAt),
}));

export const requisitionLines = pgTable('requisition_lines', {
	id: serial('id').primaryKey(),
	requisitionId: integer('requisition_id').notNull().references(() => requisitions.id, { onDelete: 'cascade' }),
	itemId: integer('item_id').notNull().references(() => items.id),
	requestedQty: decimal('requested_qty', { precision: 12, scale: 3 }).notNull().default('0'),
	servedQty: decimal('served_qty', { precision: 12, scale: 3 }).notNull().default('0'),
	pendingQty: decimal('pending_qty', { precision: 12, scale: 3 }).notNull().default('0'),
	referenceStock: decimal('reference_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	ledgerUnit: varchar('ledger_unit', { length: 30 }),
	costUnit: varchar('cost_unit', { length: 30 }),
});

// ==========================================
// 🏬 WAREHOUSE — STOCK TRANSFERS
// ==========================================

export const stockTransfers = pgTable('stock_transfers', {
	id: serial('id').primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	sourceAreaId: integer('source_area_id').notNull().references(() => storageAreas.id),
	targetAreaId: integer('target_area_id').notNull().references(() => storageAreas.id),
	requisitionId: integer('requisition_id').references(() => requisitions.id),
	reference: varchar('reference', { length: 100 }),
	status: varchar('status', { length: 20, enum: ['draft', 'processed', 'voided'] as const })
		.notNull().default('draft'),
	createdBy: varchar('created_by', { length: 100 }),
	processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => ({
	sourceIdx: index('stock_transfers_source_idx').on(table.sourceAreaId),
	targetIdx: index('stock_transfers_target_idx').on(table.targetAreaId),
	statusIdx: index('stock_transfers_status_idx').on(table.status),
}));

export const stockTransferLines = pgTable('stock_transfer_lines', {
	id: serial('id').primaryKey(),
	transferId: integer('transfer_id').notNull().references(() => stockTransfers.id, { onDelete: 'cascade' }),
	itemId: integer('item_id').notNull().references(() => items.id),
	ledgerQty: decimal('ledger_qty', { precision: 12, scale: 3 }).notNull(),
	costQty: decimal('cost_qty', { precision: 12, scale: 3 }),
	ledgerUnit: varchar('ledger_unit', { length: 30 }),
	costUnit: varchar('cost_unit', { length: 30 }),
});

// ==========================================
// 🏬 WAREHOUSE — STOCK EXITS
// ==========================================

export const stockExits = pgTable('stock_exits', {
	id: serial('id').primaryKey(),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	exitType: varchar('exit_type', { length: 30, enum: [
		'consumption', 'write_off', 'quality_control',
		'kitchen_test', 'invoice_transfer',
		'fruit_cleaning', 'expense', 'customer_return',
	] as const }).notNull().default('consumption'),
	concept: varchar('concept', { length: 100 }),
	reason: varchar('reason', { length: 200 }),
	destinationAreaId: integer('destination_area_id').references(() => storageAreas.id),
	date: timestamp('date', { withTimezone: true }).defaultNow(),
	attendant: varchar('attendant', { length: 100 }),
	process: varchar('process', { length: 100 }),
	opReference: varchar('op_reference', { length: 50 }),
	status: varchar('status', { length: 20, enum: ['draft', 'processed', 'voided'] as const })
		.notNull().default('draft'),
	createdBy: varchar('created_by', { length: 100 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => ({
	areaIdx: index('stock_exits_area_idx').on(table.areaId),
	dateIdx: index('stock_exits_date_idx').on(table.date),
}));

export const stockExitLines = pgTable('stock_exit_lines', {
	id: serial('id').primaryKey(),
	exitId: integer('exit_id').notNull().references(() => stockExits.id, { onDelete: 'cascade' }),
	itemId: integer('item_id').notNull().references(() => items.id),
	exitQty: decimal('exit_qty', { precision: 12, scale: 3 }).notNull(),
	costQty: decimal('cost_qty', { precision: 12, scale: 3 }),
	costValue: decimal('cost_value', { precision: 12, scale: 4 }),
	ledgerUnit: varchar('ledger_unit', { length: 30 }),
	costUnit: varchar('cost_unit', { length: 30 }),
});

// ==========================================
// 🏬 WAREHOUSE — PORTIONINGS
// ==========================================

export const portionings = pgTable('portionings', {
	id: serial('id').primaryKey(),
	date: timestamp('date', { withTimezone: true }).defaultNow(),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	sourceItemId: integer('source_item_id').notNull().references(() => items.id),
	inputQty: decimal('input_qty', { precision: 12, scale: 3 }).notNull(),
	outputQty: decimal('output_qty', { precision: 12, scale: 3 }).notNull().default('0'),
	waste: decimal('waste', { precision: 12, scale: 3 }).notNull().default('0'),
	wastePct: decimal('waste_pct', { precision: 6, scale: 2 }).notNull().default('0'),
	status: varchar('status', { length: 20, enum: ['draft', 'processed', 'voided'] as const })
		.notNull().default('draft'),
	createdBy: varchar('created_by', { length: 100 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	processedAt: timestamp('processed_at', { withTimezone: true }),
});

export const portioningLines = pgTable('portioning_lines', {
	id: serial('id').primaryKey(),
	portioningId: integer('portioning_id').notNull().references(() => portionings.id, { onDelete: 'cascade' }),
	targetItemId: integer('target_item_id').notNull().references(() => items.id),
	equivalent: decimal('equivalent', { precision: 12, scale: 3 }).notNull(),
	portionCount: decimal('portion_count', { precision: 12, scale: 3 }).notNull(),
	totalWeight: decimal('total_weight', { precision: 12, scale: 3 }),
	unitPrice: decimal('unit_price', { precision: 12, scale: 4 }),
	ledgerUnit: varchar('ledger_unit', { length: 30 }),
});

// ==========================================
// 🏬 WAREHOUSE — INVENTORY ADJUSTMENTS
// ==========================================

export const inventoryAdjustments = pgTable('inventory_adjustments', {
	id: serial('id').primaryKey(),
	code: varchar('code', { length: 30 }).notNull().unique(),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	date: date('date').notNull().default(sql`CURRENT_DATE`),
	status: varchar('status', { length: 20, enum: ['open', 'closed'] as const })
		.notNull().default('open'),
	createdBy: varchar('created_by', { length: 100 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	processedAt: timestamp('processed_at', { withTimezone: true }),
});

export const adjustmentLines = pgTable('adjustment_lines', {
	id: serial('id').primaryKey(),
	adjustmentId: integer('adjustment_id').notNull().references(() => inventoryAdjustments.id, { onDelete: 'cascade' }),
	itemId: integer('item_id').notNull().references(() => items.id),
	closingStock: decimal('closing_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	finalStock: decimal('final_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	adjustment: decimal('adjustment', { precision: 12, scale: 3 }).notNull().default('0'),
	avgPrice: decimal('avg_price', { precision: 12, scale: 4 }).notNull().default('0'),
	adjustmentValue: decimal('adjustment_value', { precision: 12, scale: 4 }).notNull().default('0'),
});

// ==========================================
// 📊 LEDGER (KARDEX)
// ==========================================

export const mainLedger = pgTable('main_ledger', {
	id: serial('id').primaryKey(),
	itemId: integer('item_id').notNull().references(() => items.id),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow(),
	documentType: varchar('document_type', { length: 50 }),
	documentNumber: varchar('document_number', { length: 30 }),
	originDest: varchar('origin_dest', { length: 100 }),
	entryQty: decimal('entry_qty', { precision: 12, scale: 3 }).notNull().default('0'),
	exitQty: decimal('exit_qty', { precision: 12, scale: 3 }).notNull().default('0'),
	entryPrice: decimal('entry_price', { precision: 12, scale: 4 }).notNull().default('0'),
	exitPrice: decimal('exit_price', { precision: 12, scale: 4 }).notNull().default('0'),
	entryValue: decimal('entry_value', { precision: 12, scale: 2 }).notNull().default('0'),
	exitValue: decimal('exit_value', { precision: 12, scale: 2 }).notNull().default('0'),
	currentStock: decimal('current_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	avgPrice: decimal('avg_price', { precision: 12, scale: 4 }).notNull().default('0'),
}, (table) => ({
	itemIdx: index('main_ledger_item_idx').on(table.itemId),
	areaIdx: index('main_ledger_area_idx').on(table.areaId),
	dateIdx: index('main_ledger_date_idx').on(table.recordedAt),
}));

export const areaLedger = pgTable('area_ledger', {
	id: serial('id').primaryKey(),
	itemId: integer('item_id').notNull().references(() => items.id),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow(),
	documentType: varchar('document_type', { length: 50 }),
	documentNumber: varchar('document_number', { length: 30 }),
	originDest: varchar('origin_dest', { length: 100 }),
	entryQty: decimal('entry_qty', { precision: 12, scale: 3 }).notNull().default('0'),
	exitQty: decimal('exit_qty', { precision: 12, scale: 3 }).notNull().default('0'),
	entryPrice: decimal('entry_price', { precision: 12, scale: 4 }).notNull().default('0'),
	entryValue: decimal('entry_value', { precision: 12, scale: 2 }).notNull().default('0'),
	exitValue: decimal('exit_value', { precision: 12, scale: 2 }).notNull().default('0'),
	currentStock: decimal('current_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	avgPrice: decimal('avg_price', { precision: 12, scale: 4 }).notNull().default('0'),
}, (table) => ({
	itemIdx: index('area_ledger_item_idx').on(table.itemId),
	areaIdx: index('area_ledger_area_idx').on(table.areaId),
	dateIdx: index('area_ledger_date_idx').on(table.recordedAt),
}));

// ==========================================
// 📊 SNAPSHOTS / PIVOTS
// ==========================================

export const purchasePriceHistory = pgTable('purchase_price_history', {
	id: serial('id').primaryKey(),
	itemId: integer('item_id').notNull().references(() => items.id),
	supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
	documentId: integer('document_id').notNull().references(() => purchaseDocuments.id),
	purchasePrice: decimal('purchase_price', { precision: 12, scale: 4 }).notNull(),
	qty: decimal('qty', { precision: 12, scale: 3 }).notNull(),
	purchaseDate: date('purchase_date').notNull(),
	currency: varchar('currency', { length: 10 }).notNull().default('PEN'),
});

export const stockSnapshot = pgTable('stock_snapshot', {
	id: serial('id').primaryKey(),
	itemId: integer('item_id').notNull().references(() => items.id),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	currentStock: decimal('current_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	avgPrice: decimal('avg_price', { precision: 12, scale: 4 }).notNull().default('0'),
	totalValue: decimal('total_value', { precision: 14, scale: 2 }).notNull().default('0'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	itemAreaUnique: uniqueIndex('stock_snapshot_item_area_idx').on(table.itemId, table.areaId),
	areaIdx: index('stock_snapshot_area_idx').on(table.areaId),
	itemIdx: index('stock_snapshot_item_idx').on(table.itemId),
}));

export const wasteLog = pgTable('waste_log', {
	id: serial('id').primaryKey(),
	portioningId: integer('portioning_id').notNull().references(() => portionings.id),
	itemId: integer('item_id').notNull().references(() => items.id),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	familyId: integer('family_id').notNull().references(() => itemFamilies.id),
	subfamilyId: integer('subfamily_id').notNull().references(() => itemSubfamilies.id),
	date: date('date').notNull(),
	usedQty: decimal('used_qty', { precision: 12, scale: 3 }).notNull(),
	waste: decimal('waste', { precision: 12, scale: 3 }).notNull(),
	wasteValue: decimal('waste_value', { precision: 12, scale: 4 }).notNull(),
	wastePct: decimal('waste_pct', { precision: 6, scale: 2 }).notNull(),
	unit: varchar('unit', { length: 30 }),
}, (table) => ({
	dateIdx: index('waste_log_date_idx').on(table.date),
	areaIdx: index('waste_log_area_idx').on(table.areaId),
}));

// ==========================================
// 🍳 RECIPES & SALES DISCHARGE
// ==========================================

export const recipes = pgTable('recipes', {
	id: serial('id').primaryKey(),
	productId: integer('product_id').notNull().references(() => products.id),
	name: varchar('name', { length: 200 }).notNull(),
	servings: decimal('servings', { precision: 8, scale: 3 }).notNull().default('1'),
	yieldPct: decimal('yield_pct', { precision: 6, scale: 2 }).notNull().default('100'),
	productionAreaId: integer('production_area_id').references(() => storageAreas.id),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => ({
	productIdx: index('recipes_product_idx').on(table.productId),
	areaIdx: index('recipes_area_idx').on(table.productionAreaId),
}));

export const recipeLines = pgTable('recipe_lines', {
	id: serial('id').primaryKey(),
	recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
	itemId: integer('item_id').notNull().references(() => items.id),
	qty: decimal('qty', { precision: 12, scale: 4 }).notNull(),
	unit: varchar('unit', { length: 30 }).notNull(),
	isCost: boolean('is_cost').default(false).notNull(),
	isOptional: boolean('is_optional').default(false).notNull(),
	notes: varchar('notes', { length: 200 }),
}, (table) => ({
	recipeItemUnique: uniqueIndex('recipe_lines_recipe_item_idx').on(table.recipeId, table.itemId),
	recipeIdx: index('recipe_lines_recipe_idx').on(table.recipeId),
	itemIdx: index('recipe_lines_item_idx').on(table.itemId),
}));

export const batches = pgTable('batches', {
	id: serial('id').primaryKey(),
	itemId: integer('item_id').notNull().references(() => items.id),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	documentId: integer('document_id').references(() => purchaseDocuments.id),
	batchNumber: varchar('batch_number', { length: 50 }),
	initialQty: decimal('initial_qty', { precision: 12, scale: 3 }).notNull(),
	currentQty: decimal('current_qty', { precision: 12, scale: 3 }).notNull(),
	entryDate: date('entry_date').notNull().default(sql`CURRENT_DATE`),
	expiryDate: date('expiry_date'),
	status: varchar('status', { length: 20, enum: ['active', 'expiring_soon', 'expired', 'depleted'] as const })
		.notNull().default('active'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	itemIdx: index('batches_item_idx').on(table.itemId),
	areaIdx: index('batches_area_idx').on(table.areaId),
	statusIdx: index('batches_status_idx').on(table.status),
	expiryIdx: index('batches_expiry_idx').on(table.expiryDate),
}));

export const salesDischarge = pgTable('sales_discharge', {
	id: serial('id').primaryKey(),
	orderId: varchar('order_id', { length: 12 }).notNull().references(() => orders.id).unique(),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	date: timestamp('date', { withTimezone: true }).defaultNow(),
	status: varchar('status', { length: 20, enum: ['draft', 'processed', 'voided'] as const })
		.notNull().default('draft'),
	totalCost: decimal('total_cost', { precision: 12, scale: 4 }).notNull().default('0'),
	createdBy: varchar('created_by', { length: 100 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => ({
	orderIdx: index('sales_discharge_order_idx').on(table.orderId),
	areaIdx: index('sales_discharge_area_idx').on(table.areaId),
	statusIdx: index('sales_discharge_status_idx').on(table.status),
}));

export const salesDischargeLines = pgTable('sales_discharge_lines', {
	id: serial('id').primaryKey(),
	dischargeId: integer('discharge_id').notNull().references(() => salesDischarge.id, { onDelete: 'cascade' }),
	itemId: integer('item_id').notNull().references(() => items.id),
	recipeId: integer('recipe_id').notNull().references(() => recipes.id),
	qty: decimal('qty', { precision: 12, scale: 4 }).notNull(),
	unit: varchar('unit', { length: 30 }),
	avgPrice: decimal('avg_price', { precision: 12, scale: 4 }).notNull().default('0'),
	lineCost: decimal('line_cost', { precision: 12, scale: 4 }).notNull().default('0'),
}, (table) => ({
	dischargeIdx: index('sales_discharge_lines_discharge_idx').on(table.dischargeId),
	itemIdx: index('sales_discharge_lines_item_idx').on(table.itemId),
}));

// ==========================================
// 💵 CAJA — GESTIÓN DE SESIONES Y MOVIMIENTOS
// ==========================================

export const cashSessions = pgTable('cash_sessions', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  openedBy: varchar('opened_by', { length: 100 }).notNull(),
  closedBy: varchar('closed_by', { length: 100 }),
  openingBalance: decimal('opening_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  closingBalance: decimal('closing_balance', { precision: 12, scale: 2 }),
  // sum of all income movements
  totalIncome: decimal('total_income', { precision: 12, scale: 2 }).notNull().default('0'),
  // sum of all expense + withdrawal movements
  totalExpense: decimal('total_expense', { precision: 12, scale: 2 }).notNull().default('0'),
  // opening + totalIncome - totalExpense (calculated on each movement)
  expectedBalance: decimal('expected_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  // closingBalance - expectedBalance (filled on close)
  difference: decimal('difference', { precision: 12, scale: 2 }),
  status: varchar('status', { length: 20, enum: ['open', 'closed'] as const }).notNull().default('open'),
  notes: varchar('notes', { length: 300 }),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => ({
  statusIdx: index('cash_sessions_status_idx').on(table.status),
  openedAtIdx: index('cash_sessions_opened_at_idx').on(table.openedAt),
}));

export const cashMovements = pgTable('cash_movements', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull().references(() => cashSessions.id),
  // income = dinero que entra; expense = gasto; withdrawal = retiro de fondo; deposit = depósito adicional
  movementType: varchar('movement_type', { length: 20, enum: ['income', 'expense', 'withdrawal', 'deposit'] as const }).notNull(),
  concept: varchar('concept', { length: 200 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 100 }),
  orderId: varchar('order_id', { length: 12 }).references(() => orders.id),
  reference: varchar('reference', { length: 100 }),
  createdBy: varchar('created_by', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sessionIdx: index('cash_movements_session_idx').on(table.sessionId),
  typeIdx: index('cash_movements_type_idx').on(table.movementType),
  orderIdx: index('cash_movements_order_idx').on(table.orderId),
}));

export const cashSessionsRelations = relations(cashSessions, ({ many }) => ({
  movements: many(cashMovements),
}));

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  session: one(cashSessions, { fields: [cashMovements.sessionId], references: [cashSessions.id] }),
  order: one(orders, { fields: [cashMovements.orderId], references: [orders.id] }),
}));

// ==========================================
// ⚙️ SUPPORT — SETTINGS & AUDIT
// ==========================================

export const systemSettings = pgTable('system_settings', {
	key: varchar('key', { length: 100 }).primaryKey(),
	value: text('value').notNull(),
	description: varchar('description', { length: 255 }),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
	userId: integer('user_id').references(() => users.id),
});

export const auditLog = pgTable('audit_log', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	tableName: varchar('table_name', { length: 100 }).notNull(),
	operation: varchar('operation', { length: 20, enum: ['INSERT', 'UPDATE', 'DELETE', 'PROCESS', 'VOID', 'ADJUST'] as const }).notNull(),
	recordId: integer('record_id'),
	beforeData: jsonb('before_data'),
	afterData: jsonb('after_data'),
	userId: integer('user_id').references(() => users.id),
	userName: varchar('user_name', { length: 100 }),
	module: varchar('module', { length: 100 }),
	description: varchar('description', { length: 300 }),
	ipAddress: varchar('ip_address', { length: 45 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	tableIdx: index('audit_log_table_idx').on(table.tableName),
	dateIdx: index('audit_log_date_idx').on(table.createdAt),
	userIdx: index('audit_log_user_idx').on(table.userId),
	moduleIdx: index('audit_log_module_idx').on(table.module),
	recordIdx: index('audit_log_record_idx').on(table.tableName, table.recordId),
}));

// ==========================================
// 🔗 RELATIONS — WAREHOUSE
// ==========================================

export const itemFamiliesRelations = relations(itemFamilies, ({ many }) => ({
	subfamilies: many(itemSubfamilies),
}));

export const itemSubfamiliesRelations = relations(itemSubfamilies, ({ one, many }) => ({
	family: one(itemFamilies, { fields: [itemSubfamilies.familyId], references: [itemFamilies.id] }),
	items: many(items),
}));

export const storageAreasRelations = relations(storageAreas, ({ many }) => ({
	itemAssignments: many(itemAreaAssignments),
	purchaseDocuments: many(purchaseDocuments),
	requisitions: many(requisitions),
	stockExits: many(stockExits),
	portionings: many(portionings),
	mainLedger: many(mainLedger),
	areaLedger: many(areaLedger),
	recipes: many(recipes),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
	purchaseDocuments: many(purchaseDocuments),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
	subfamily: one(itemSubfamilies, { fields: [items.subfamilyId], references: [itemSubfamilies.id] }),
	areaAssignments: many(itemAreaAssignments),
	recipeLines: many(recipeLines),
	batches: many(batches),
}));

export const itemAreaAssignmentsRelations = relations(itemAreaAssignments, ({ one }) => ({
	item: one(items, { fields: [itemAreaAssignments.itemId], references: [items.id] }),
	area: one(storageAreas, { fields: [itemAreaAssignments.areaId], references: [storageAreas.id] }),
}));

export const purchaseDocumentsRelations = relations(purchaseDocuments, ({ one, many }) => ({
	supplier: one(suppliers, { fields: [purchaseDocuments.supplierId], references: [suppliers.id] }),
	area: one(storageAreas, { fields: [purchaseDocuments.areaId], references: [storageAreas.id] }),
	lines: many(purchaseDocumentLines),
	batches: many(batches),
}));

export const requisitionsRelations = relations(requisitions, ({ one, many }) => ({
	area: one(storageAreas, { fields: [requisitions.areaId], references: [storageAreas.id] }),
	lines: many(requisitionLines),
	stockTransfers: many(stockTransfers),
}));

export const stockTransfersRelations = relations(stockTransfers, ({ one, many }) => ({
	sourceArea: one(storageAreas, { fields: [stockTransfers.sourceAreaId], references: [storageAreas.id] }),
	targetArea: one(storageAreas, { fields: [stockTransfers.targetAreaId], references: [storageAreas.id] }),
	requisition: one(requisitions, { fields: [stockTransfers.requisitionId], references: [requisitions.id] }),
	lines: many(stockTransferLines),
}));

export const stockExitsRelations = relations(stockExits, ({ one, many }) => ({
	area: one(storageAreas, { fields: [stockExits.areaId], references: [storageAreas.id] }),
	lines: many(stockExitLines),
}));

export const portioningsRelations = relations(portionings, ({ one, many }) => ({
	area: one(storageAreas, { fields: [portionings.areaId], references: [storageAreas.id] }),
	sourceItem: one(items, { fields: [portionings.sourceItemId], references: [items.id] }),
	lines: many(portioningLines),
}));

export const inventoryAdjustmentsRelations = relations(inventoryAdjustments, ({ one, many }) => ({
	area: one(storageAreas, { fields: [inventoryAdjustments.areaId], references: [storageAreas.id] }),
	lines: many(adjustmentLines),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
	product: one(products, { fields: [recipes.productId], references: [products.id] }),
	productionArea: one(storageAreas, { fields: [recipes.productionAreaId], references: [storageAreas.id] }),
	lines: many(recipeLines),
}));

export const recipeLinesRelations = relations(recipeLines, ({ one }) => ({
	recipe: one(recipes, { fields: [recipeLines.recipeId], references: [recipes.id] }),
	item: one(items, { fields: [recipeLines.itemId], references: [items.id] }),
}));

export const batchesRelations = relations(batches, ({ one }) => ({
	item: one(items, { fields: [batches.itemId], references: [items.id] }),
	area: one(storageAreas, { fields: [batches.areaId], references: [storageAreas.id] }),
	document: one(purchaseDocuments, { fields: [batches.documentId], references: [purchaseDocuments.id] }),
}));

export const salesDischargeRelations = relations(salesDischarge, ({ one, many }) => ({
	order: one(orders, { fields: [salesDischarge.orderId], references: [orders.id] }),
	area: one(storageAreas, { fields: [salesDischarge.areaId], references: [storageAreas.id] }),
	lines: many(salesDischargeLines),
}));

export const salesDischargeLinesRelations = relations(salesDischargeLines, ({ one }) => ({
	discharge: one(salesDischarge, { fields: [salesDischargeLines.dischargeId], references: [salesDischarge.id] }),
	item: one(items, { fields: [salesDischargeLines.itemId], references: [items.id] }),
	recipe: one(recipes, { fields: [salesDischargeLines.recipeId], references: [recipes.id] }),
}));

export const productsWarehouseRelations = relations(products, ({ many }) => ({
	recipes: many(recipes),
}));

export const ordersWarehouseRelations = relations(orders, ({ one }) => ({
	salesDischarge: one(salesDischarge, { fields: [orders.id], references: [salesDischarge.orderId] }),
}));

// ==========================================
// 🛡️ RBAC — CONTROL DE ACCESO LOCAL
// ==========================================

// Copia local del catálogo de sub-acciones habilitadas por el Superadmin para este tenant.
// masterSubActionId es la FK conceptual hacia sub_actions.id en la BD Master.
// No hay FK física entre bases de datos; la sincronización la hace el servicio de sync.
export const permissionsCatalog = pgTable('permissions_catalog', {
	id: serial('id').primaryKey(),
	masterSubActionId: integer('master_sub_action_id').notNull().unique(), // ref conceptual → BD Master sub_actions.id
	actionCode: varchar('action_code', { length: 50 }).notNull(),          // 'ventas'
	actionName: varchar('action_name', { length: 100 }).notNull(),         // 'Ventas'
	subActionCode: varchar('sub_action_code', { length: 100 }).notNull(),  // 'ventas.crear_factura'
	subActionName: varchar('sub_action_name', { length: 100 }).notNull(),  // 'Crear Factura'
	order: integer('order').default(0).notNull(),
	syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	actionCodeIdx: index('perm_catalog_action_idx').on(table.actionCode),
}));

// Roles del tenant: pueden ser clones de un Rol Base (masterRoleId ≠ null)
// o roles completamente personalizados (isCustom = true, masterRoleId = null).
export const roles = pgTable('roles', {
	id: serial('id').primaryKey(),
	masterRoleId: integer('master_role_id'),                      // ref conceptual → BD Master base_roles.id
	code: varchar('code', { length: 50 }).notNull().unique(),
	name: varchar('name', { length: 100 }).notNull(),
	description: varchar('description', { length: 255 }),
	isCustom: boolean('is_custom').default(false).notNull(),       // true = creado por el admin del tenant
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Qué permisos (del catálogo local) tiene asignados cada rol del tenant
export const rolePermissions = pgTable('role_permissions', {
	id: serial('id').primaryKey(),
	roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
	permCatalogId: integer('perm_catalog_id').notNull().references(() => permissionsCatalog.id, { onDelete: 'cascade' }),
}, (table) => ({
	unique: uniqueIndex('role_permissions_unique_idx').on(table.roleId, table.permCatalogId),
	roleIdx: index('role_permissions_role_idx').on(table.roleId),
}));

// Asignación de rol a usuario (1 usuario → 1 rol)
export const userRoles = pgTable('user_roles', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
	roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'restrict' }),
	assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
	assignedBy: integer('assigned_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
	roleIdx: index('user_roles_role_idx').on(table.roleId),
}));

// ── Relations RBAC Tenant ────────────────────────────────────────────────────

export const permissionsCatalogRelations = relations(permissionsCatalog, ({ many }) => ({
	rolePermissions: many(rolePermissions),
	userOverrides: many(userPermissionOverrides),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
	permissions: many(rolePermissions),
	userRoles: many(userRoles),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
	role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
	permCatalog: one(permissionsCatalog, { fields: [rolePermissions.permCatalogId], references: [permissionsCatalog.id] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
	user: one(users, { fields: [userRoles.userId], references: [users.id] }),
	role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
	assignedByUser: one(users, {
		fields: [userRoles.assignedBy],
		references: [users.id],
		relationName: 'assignedByUser',
	}),
}));

// Permisos individuales por usuario: grant amplía lo del rol, deny restringe (incluso lo del rol)
// effective = (role_perms ∪ grants) − denies
export const userPermissionOverrides = pgTable('user_permission_overrides', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	permCatalogId: integer('perm_catalog_id').notNull().references(() => permissionsCatalog.id, { onDelete: 'cascade' }),
	type: varchar('type', { length: 10, enum: ['grant', 'deny'] as const }).notNull().default('grant'),
	grantedBy: integer('granted_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	unique: uniqueIndex('user_perm_overrides_unique_idx').on(table.userId, table.permCatalogId),
	userIdx: index('user_perm_overrides_user_idx').on(table.userId),
}));

export const userPermissionOverridesRelations = relations(userPermissionOverrides, ({ one }) => ({
	user: one(users, { fields: [userPermissionOverrides.userId], references: [users.id] }),
	permCatalog: one(permissionsCatalog, { fields: [userPermissionOverrides.permCatalogId], references: [permissionsCatalog.id] }),
	grantedByUser: one(users, {
		fields: [userPermissionOverrides.grantedBy],
		references: [users.id],
		relationName: 'grantedByUser',
	}),
}));

