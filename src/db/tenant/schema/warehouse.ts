import { sql, relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, timestamp, index, varchar, boolean, jsonb, uniqueIndex, date, bigserial } from 'drizzle-orm/pg-core';
import { users, products, orders, branches } from './core';

// ==========================================
// 🏬 WAREHOUSE — CATALOGUE
// ==========================================

export const itemCategories = pgTable('item_categories', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 100 }).notNull().unique(),
	description: varchar('description', { length: 255 }),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const itemSubcategories = pgTable('item_subcategories', {
	id: serial('id').primaryKey(),
	categoryId: integer('category_id').notNull().references(() => itemCategories.id),
	name: varchar('name', { length: 100 }).notNull(),
	description: varchar('description', { length: 255 }),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	categoryNameUnique: uniqueIndex('item_subcategories_category_name_idx').on(table.categoryId, table.name),
}));

// Almacenes físicos. Pueden ser centrales (isCentral=true, branchId=null)
// o propios de una sucursal (branchId=X).
export const warehouses = pgTable('warehouses', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').references(() => branches.id), // null = almacén central
	name: varchar('name', { length: 100 }).notNull(),
	code: varchar('code', { length: 20 }).notNull().unique(), // Ej: 'ALM-CENTRAL', 'ALM-MFL'
	isCentral: boolean('is_central').default(false).notNull(), // true = abastece a todas las sedes
	description: varchar('description', { length: 255 }),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('warehouses_branch_idx').on(table.branchId),
	codeIdx: index('warehouses_code_idx').on(table.code),
}));

// Áreas de almacenamiento dentro de un almacén (ej: Cámara Fría, Ambiente, Congelado).
// El nombre es único por almacén (no globalmente).
export const storageAreas = pgTable('storage_areas', {
	id: serial('id').primaryKey(),
	warehouseId: integer('warehouse_id').notNull().references(() => warehouses.id),
	name: varchar('name', { length: 100 }).notNull(),
	type: varchar('type', { length: 50, enum: ['ambient', 'cold', 'frozen', 'sub_warehouse'] as const })
		.notNull().default('ambient'),
	description: varchar('description', { length: 255 }),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	warehouseIdx: index('storage_areas_warehouse_idx').on(table.warehouseId),
	nameWarehouseUnique: uniqueIndex('storage_areas_name_warehouse_idx').on(table.warehouseId, table.name),
}));

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
// 🏬 WAREHOUSE — MEASUREMENT UNITS CATALOG
// ==========================================

export const measurementUnits = pgTable('measurement_units', {
	id: serial('id').primaryKey(),
	code: varchar('code', { length: 30 }).notNull().unique(),
	name: varchar('name', { length: 100 }).notNull(),
	dimension: varchar('dimension', { length: 50 }).notNull(),
	baseFactor: decimal('base_factor', { precision: 14, scale: 6 }),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// ==========================================
// 🏬 WAREHOUSE — ITEM MASTER
// ==========================================

export const items = pgTable('items', {
	id: serial('id').primaryKey(),
	image: varchar('image', { length: 255 }).default(''),
	code: varchar('code', { length: 20 }).notNull().unique(),
	shortDescription: varchar('short_description', { length: 100 }).notNull(),
	subcategoryId: integer('subcategory_id').references(() => itemSubcategories.id),
	ledgerUnitId: integer('ledger_unit_id').references(() => measurementUnits.id),
	costUnitId: integer('cost_unit_id').references(() => measurementUnits.id),
	ledgerUnit: varchar('ledger_unit', { length: 30 }).notNull().default(''),
	costUnit: varchar('cost_unit', { length: 30 }).notNull().default(''),
	conversionFactor: decimal('conversion_factor', { precision: 12, scale: 4 }).notNull().default('1'),
	minStock: decimal('min_stock', { precision: 12, scale: 3 }).notNull().default('0'),
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
	recipeDischarge: boolean('recipe_discharge').default(false).notNull(), // true = se descarga por receta al vender
	printCriteria: varchar('print_criteria', { length: 100 }),
	externalCode: varchar('external_code', { length: 50 }),
	taxCode: varchar('tax_code', { length: 30 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
	updatedBy: varchar('updated_by', { length: 100 }),
}, (table) => ({
	subcategoryIdx: index('items_subcategory_idx').on(table.subcategoryId),
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
	branchId: integer('branch_id').notNull().references(() => branches.id), // Qué sede realiza la compra
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
	branchIdx: index('purchase_docs_branch_idx').on(table.branchId),
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
	branchId: integer('branch_id').notNull().references(() => branches.id), // Qué sede solicita
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
	branchIdx: index('requisitions_branch_idx').on(table.branchId),
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

// Traslados de stock entre áreas/almacenes/sucursales.
// sourceBranchId/targetBranchId desnormalizados para reportes cross-branch eficientes.
export const stockTransfers = pgTable('stock_transfers', {
	id: serial('id').primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	sourceAreaId: integer('source_area_id').notNull().references(() => storageAreas.id),
	targetAreaId: integer('target_area_id').notNull().references(() => storageAreas.id),
	sourceBranchId: integer('source_branch_id').notNull().references(() => branches.id),
	targetBranchId: integer('target_branch_id').notNull().references(() => branches.id),
	requisitionId: integer('requisition_id').references(() => requisitions.id),
	reference: varchar('reference', { length: 100 }),
	status: varchar('status', { length: 20, enum: ['draft', 'processed', 'voided'] as const })
		.notNull().default('draft'),
	createdBy: varchar('created_by', { length: 100 }),
	processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => ({
	sourceIdx: index('stock_transfers_source_idx').on(table.sourceAreaId),
	targetIdx: index('stock_transfers_target_idx').on(table.targetAreaId),
	sourceBranchIdx: index('stock_transfers_source_branch_idx').on(table.sourceBranchId),
	targetBranchIdx: index('stock_transfers_target_branch_idx').on(table.targetBranchId),
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
	branchId: integer('branch_id').notNull().references(() => branches.id),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	exitType: varchar('exit_type', {
		length: 30, enum: [
			'consumption', 'write_off', 'quality_control',
			'kitchen_test', 'invoice_transfer',
			'fruit_cleaning', 'expense', 'customer_return',
		] as const
	}).notNull().default('consumption'),
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
	branchIdx: index('stock_exits_branch_idx').on(table.branchId),
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
	branchId: integer('branch_id').notNull().references(() => branches.id),
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
}, (table) => ({
	branchIdx: index('portionings_branch_idx').on(table.branchId),
}));

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
	branchId: integer('branch_id').notNull().references(() => branches.id),
	code: varchar('code', { length: 30 }).notNull().unique(),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	date: date('date').notNull().default(sql`CURRENT_DATE`),
	status: varchar('status', { length: 20, enum: ['open', 'closed'] as const })
		.notNull().default('open'),
	createdBy: varchar('created_by', { length: 100 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => ({
	branchIdx: index('inventory_adjustments_branch_idx').on(table.branchId),
}));

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

// Kardex global del restaurante: todos los movimientos de todos los almacenes.
export const mainLedger = pgTable('main_ledger', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id),
	warehouseId: integer('warehouse_id').notNull().references(() => warehouses.id),
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
	branchIdx: index('main_ledger_branch_idx').on(table.branchId),
	warehouseIdx: index('main_ledger_warehouse_idx').on(table.warehouseId),
	itemIdx: index('main_ledger_item_idx').on(table.itemId),
	areaIdx: index('main_ledger_area_idx').on(table.areaId),
	dateIdx: index('main_ledger_date_idx').on(table.recordedAt),
}));

// Kardex por área de almacenamiento (segmentado).
export const areaLedger = pgTable('area_ledger', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id),
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
	branchIdx: index('area_ledger_branch_idx').on(table.branchId),
	itemIdx: index('area_ledger_item_idx').on(table.itemId),
	areaIdx: index('area_ledger_area_idx').on(table.areaId),
	dateIdx: index('area_ledger_date_idx').on(table.recordedAt),
}));

// ==========================================
// 📊 SNAPSHOTS / PIVOTS
// ==========================================

export const purchasePriceHistory = pgTable('purchase_price_history', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id),
	itemId: integer('item_id').notNull().references(() => items.id),
	supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
	documentId: integer('document_id').notNull().references(() => purchaseDocuments.id),
	purchasePrice: decimal('purchase_price', { precision: 12, scale: 4 }).notNull(),
	qty: decimal('qty', { precision: 12, scale: 3 }).notNull(),
	purchaseDate: date('purchase_date').notNull(),
	currency: varchar('currency', { length: 10 }).notNull().default('PEN'),
});

// Snapshot del stock actual por ítem + área (desnormalizado para performance).
export const stockSnapshot = pgTable('stock_snapshot', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id),
	itemId: integer('item_id').notNull().references(() => items.id),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	currentStock: decimal('current_stock', { precision: 12, scale: 3 }).notNull().default('0'),
	avgPrice: decimal('avg_price', { precision: 12, scale: 4 }).notNull().default('0'),
	totalValue: decimal('total_value', { precision: 14, scale: 2 }).notNull().default('0'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	itemAreaUnique: uniqueIndex('stock_snapshot_item_area_idx').on(table.itemId, table.areaId),
	branchIdx: index('stock_snapshot_branch_idx').on(table.branchId),
	areaIdx: index('stock_snapshot_area_idx').on(table.areaId),
	itemIdx: index('stock_snapshot_item_idx').on(table.itemId),
}));

export const wasteLog = pgTable('waste_log', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id),
	portioningId: integer('portioning_id').notNull().references(() => portionings.id),
	itemId: integer('item_id').notNull().references(() => items.id),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
	subcategoryId: integer('subcategory_id').notNull().references(() => itemSubcategories.id),
	date: date('date').notNull(),
	usedQty: decimal('used_qty', { precision: 12, scale: 3 }).notNull(),
	waste: decimal('waste', { precision: 12, scale: 3 }).notNull(),
	wasteValue: decimal('waste_value', { precision: 12, scale: 4 }).notNull(),
	wastePct: decimal('waste_pct', { precision: 6, scale: 2 }).notNull(),
	unit: varchar('unit', { length: 30 }),
}, (table) => ({
	branchIdx: index('waste_log_branch_idx').on(table.branchId),
	dateIdx: index('waste_log_date_idx').on(table.date),
	areaIdx: index('waste_log_area_idx').on(table.areaId),
}));

// ==========================================
// 🍳 RECIPES & SALES DISCHARGE
// ==========================================

// Receta de un producto: qué insumos y en qué cantidad se consumen al prepararlo.
// Las recetas son GLOBALES (compartidas entre sucursales).
// El área de producción por sucursal se configura en branch_recipe_areas.
export const recipes = pgTable('recipes', {
	id: serial('id').primaryKey(),
	productId: integer('product_id').references(() => products.id),
	producedItemId: integer('produced_item_id').references(() => items.id),
	type: varchar('type', { length: 30 }).default('sales').notNull(),
	name: varchar('name', { length: 200 }),
	preparation: text('preparation'),
	servings: decimal('servings', { precision: 8, scale: 3 }).notNull().default('1'),
	yieldPct: decimal('yield_pct', { precision: 6, scale: 2 }).notNull().default('100'),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => ({
	productIdx: index('recipes_product_idx').on(table.productId),
	producedItemIdx: index('recipes_produced_item_idx').on(table.producedItemId),
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

// Mapeo de área de producción por sucursal y producto.
// Determina de qué área de almacén se descuenta el stock cuando se vende
// un producto en una sucursal específica.
export const branchRecipeAreas = pgTable('branch_recipe_areas', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
	productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
	areaId: integer('area_id').notNull().references(() => storageAreas.id),
}, (table) => ({
	branchProductUnique: uniqueIndex('branch_recipe_areas_unique_idx').on(table.branchId, table.productId),
	branchIdx: index('branch_recipe_areas_branch_idx').on(table.branchId),
	productIdx: index('branch_recipe_areas_product_idx').on(table.productId),
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

// Descarga de stock generada automáticamente al procesar un pedido.
// Se dispara cuando order.status cambia a 'preparing'.
// Usa branch_recipe_areas para saber de qué área descontar por sucursal.
export const salesDischarge = pgTable('sales_discharge', {
	id: serial('id').primaryKey(),
	orderId: varchar('order_id', { length: 12 }).notNull().references(() => orders.id).unique(),
	branchId: integer('branch_id').notNull().references(() => branches.id),
	areaId: integer('area_id').references(() => storageAreas.id),
	date: timestamp('date', { withTimezone: true }).defaultNow(),
	status: varchar('status', { length: 20, enum: ['draft', 'processed', 'voided'] as const })
		.notNull().default('draft'),
	totalCost: decimal('total_cost', { precision: 12, scale: 4 }).notNull().default('0'),
	createdBy: varchar('created_by', { length: 100 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => ({
	orderIdx: index('sales_discharge_order_idx').on(table.orderId),
	branchIdx: index('sales_discharge_branch_idx').on(table.branchId),
	areaIdx: index('sales_discharge_area_idx').on(table.areaId),
	statusIdx: index('sales_discharge_status_idx').on(table.status),
}));

export const salesDischargeLines = pgTable('sales_discharge_lines', {
	id: serial('id').primaryKey(),
	dischargeId: integer('discharge_id').notNull().references(() => salesDischarge.id, { onDelete: 'cascade' }),
	itemId: integer('item_id').notNull().references(() => items.id),
	recipeId: integer('recipe_id').references(() => recipes.id), // nullable: null cuando la descarga proviene de extra directo (item)
	areaId: integer('area_id').references(() => storageAreas.id),
	qty: decimal('qty', { precision: 12, scale: 4 }).notNull(),
	unit: varchar('unit', { length: 30 }),
	avgPrice: decimal('avg_price', { precision: 12, scale: 4 }).notNull().default('0'),
	lineCost: decimal('line_cost', { precision: 12, scale: 4 }).notNull().default('0'),
}, (table) => ({
	dischargeIdx: index('sales_discharge_lines_discharge_idx').on(table.dischargeId),
	itemIdx: index('sales_discharge_lines_item_idx').on(table.itemId),
	areaIdx: index('sales_discharge_lines_area_idx').on(table.areaId),
}));

// ==========================================
// 💵 CAJA — GESTIÓN DE SESIONES Y MOVIMIENTOS
// ==========================================

export const cashRegisters = pgTable('cash_registers', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id),
	name: varchar('name', { length: 100 }).notNull(),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => ({
	branchIdx: index('cash_registers_branch_idx').on(table.branchId),
}));

export const cashSessions = pgTable('cash_sessions', {
	id: serial('id').primaryKey(),
	registerId: integer('register_id').references(() => cashRegisters.id),
	branchId: integer('branch_id').notNull().references(() => branches.id),
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
	branchIdx: index('cash_sessions_branch_idx').on(table.branchId),
	registerIdx: index('cash_sessions_register_idx').on(table.registerId),
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

export const measurementUnitsRelations = relations(measurementUnits, ({ many }) => ({
	itemsAsLedger: many(items, { relationName: 'ledgerUnit' }),
	itemsAsCost: many(items, { relationName: 'costUnit' }),
}));

export const itemCategoriesRelations = relations(itemCategories, ({ many }) => ({
	subcategories: many(itemSubcategories),
}));

export const itemSubcategoriesRelations = relations(itemSubcategories, ({ one, many }) => ({
	category: one(itemCategories, { fields: [itemSubcategories.categoryId], references: [itemCategories.id] }),
	items: many(items),
}));

export const warehousesRelations = relations(warehouses, ({ one, many }) => ({
	branch: one(branches, { fields: [warehouses.branchId], references: [branches.id] }),
	storageAreas: many(storageAreas),
}));

export const storageAreasRelations = relations(storageAreas, ({ one, many }) => ({
	warehouse: one(warehouses, { fields: [storageAreas.warehouseId], references: [warehouses.id] }),
	itemAssignments: many(itemAreaAssignments),
	purchaseDocuments: many(purchaseDocuments),
	requisitions: many(requisitions),
	stockExits: many(stockExits),
	portionings: many(portionings),
	mainLedger: many(mainLedger),
	areaLedger: many(areaLedger),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
	purchaseDocuments: many(purchaseDocuments),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
	subcategory: one(itemSubcategories, { fields: [items.subcategoryId], references: [itemSubcategories.id] }),
	ledgerUnitRef: one(measurementUnits, { fields: [items.ledgerUnitId], references: [measurementUnits.id], relationName: 'ledgerUnit' }),
	costUnitRef: one(measurementUnits, { fields: [items.costUnitId], references: [measurementUnits.id], relationName: 'costUnit' }),
	areaAssignments: many(itemAreaAssignments),
	recipeLines: many(recipeLines),
	batches: many(batches),
}));

export const itemAreaAssignmentsRelations = relations(itemAreaAssignments, ({ one }) => ({
	item: one(items, { fields: [itemAreaAssignments.itemId], references: [items.id] }),
	area: one(storageAreas, { fields: [itemAreaAssignments.areaId], references: [storageAreas.id] }),
}));

export const purchaseDocumentsRelations = relations(purchaseDocuments, ({ one, many }) => ({
	branch: one(branches, { fields: [purchaseDocuments.branchId], references: [branches.id] }),
	supplier: one(suppliers, { fields: [purchaseDocuments.supplierId], references: [suppliers.id] }),
	area: one(storageAreas, { fields: [purchaseDocuments.areaId], references: [storageAreas.id] }),
	lines: many(purchaseDocumentLines),
	batches: many(batches),
}));

export const requisitionsRelations = relations(requisitions, ({ one, many }) => ({
	branch: one(branches, { fields: [requisitions.branchId], references: [branches.id] }),
	area: one(storageAreas, { fields: [requisitions.areaId], references: [storageAreas.id] }),
	lines: many(requisitionLines),
	stockTransfers: many(stockTransfers),
}));

export const stockTransfersRelations = relations(stockTransfers, ({ one, many }) => ({
	sourceArea: one(storageAreas, { fields: [stockTransfers.sourceAreaId], references: [storageAreas.id] }),
	targetArea: one(storageAreas, { fields: [stockTransfers.targetAreaId], references: [storageAreas.id] }),
	sourceBranch: one(branches, { fields: [stockTransfers.sourceBranchId], references: [branches.id] }),
	targetBranch: one(branches, { fields: [stockTransfers.targetBranchId], references: [branches.id] }),
	requisition: one(requisitions, { fields: [stockTransfers.requisitionId], references: [requisitions.id] }),
	lines: many(stockTransferLines),
}));

export const stockExitsRelations = relations(stockExits, ({ one, many }) => ({
	branch: one(branches, { fields: [stockExits.branchId], references: [branches.id] }),
	area: one(storageAreas, { fields: [stockExits.areaId], references: [storageAreas.id] }),
	lines: many(stockExitLines),
}));

export const portioningsRelations = relations(portionings, ({ one, many }) => ({
	branch: one(branches, { fields: [portionings.branchId], references: [branches.id] }),
	area: one(storageAreas, { fields: [portionings.areaId], references: [storageAreas.id] }),
	sourceItem: one(items, { fields: [portionings.sourceItemId], references: [items.id] }),
	lines: many(portioningLines),
}));

export const inventoryAdjustmentsRelations = relations(inventoryAdjustments, ({ one, many }) => ({
	branch: one(branches, { fields: [inventoryAdjustments.branchId], references: [branches.id] }),
	area: one(storageAreas, { fields: [inventoryAdjustments.areaId], references: [storageAreas.id] }),
	lines: many(adjustmentLines),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
	product: one(products, { fields: [recipes.productId], references: [products.id] }),
	producedItem: one(items, { fields: [recipes.producedItemId], references: [items.id] }),
	lines: many(recipeLines),
	branchAreas: many(branchRecipeAreas),
}));

export const recipeLinesRelations = relations(recipeLines, ({ one }) => ({
	recipe: one(recipes, { fields: [recipeLines.recipeId], references: [recipes.id] }),
	item: one(items, { fields: [recipeLines.itemId], references: [items.id] }),
}));

export const branchRecipeAreasRelations = relations(branchRecipeAreas, ({ one }) => ({
	branch: one(branches, { fields: [branchRecipeAreas.branchId], references: [branches.id] }),
	product: one(products, { fields: [branchRecipeAreas.productId], references: [products.id] }),
	area: one(storageAreas, { fields: [branchRecipeAreas.areaId], references: [storageAreas.id] }),
}));

export const batchesRelations = relations(batches, ({ one }) => ({
	item: one(items, { fields: [batches.itemId], references: [items.id] }),
	area: one(storageAreas, { fields: [batches.areaId], references: [storageAreas.id] }),
	document: one(purchaseDocuments, { fields: [batches.documentId], references: [purchaseDocuments.id] }),
}));

export const salesDischargeRelations = relations(salesDischarge, ({ one, many }) => ({
	order: one(orders, { fields: [salesDischarge.orderId], references: [orders.id] }),
	branch: one(branches, { fields: [salesDischarge.branchId], references: [branches.id] }),
	area: one(storageAreas, { fields: [salesDischarge.areaId], references: [storageAreas.id] }),
	lines: many(salesDischargeLines),
}));

export const salesDischargeLinesRelations = relations(salesDischargeLines, ({ one }) => ({
	discharge: one(salesDischarge, { fields: [salesDischargeLines.dischargeId], references: [salesDischarge.id] }),
	item: one(items, { fields: [salesDischargeLines.itemId], references: [items.id] }),
	recipe: one(recipes, { fields: [salesDischargeLines.recipeId], references: [recipes.id] }),
	area: one(storageAreas, { fields: [salesDischargeLines.areaId], references: [storageAreas.id] }),
}));

export const cashRegistersRelations = relations(cashRegisters, ({ one, many }) => ({
	branch: one(branches, { fields: [cashRegisters.branchId], references: [branches.id] }),
	sessions: many(cashSessions),
}));

export const cashSessionsRelations = relations(cashSessions, ({ one, many }) => ({
	register: one(cashRegisters, { fields: [cashSessions.registerId], references: [cashRegisters.id] }),
	branch: one(branches, { fields: [cashSessions.branchId], references: [branches.id] }),
	movements: many(cashMovements),
}));

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
	session: one(cashSessions, { fields: [cashMovements.sessionId], references: [cashSessions.id] }),
	order: one(orders, { fields: [cashMovements.orderId], references: [orders.id] }),
}));

export const productsWarehouseRelations = relations(products, ({ many }) => ({
	recipes: many(recipes),
	branchRecipeAreas: many(branchRecipeAreas),
}));

export const ordersWarehouseRelations = relations(orders, ({ one }) => ({
	salesDischarge: one(salesDischarge, { fields: [orders.id], references: [salesDischarge.orderId] }),
}));
