import { relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, timestamp, index, varchar, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { orders, orderSplits, orderItems, products, branches } from './core';
import { cashRegisters } from './warehouse';

// 🧾 FACTURACIÓN — SERIES Y DOCUMENTOS DE VENTA
// ==========================================

// Asigna a cada caja qué serie usar por tipo de comprobante, conteniendo la serie y correlativos directamente.
export const cashRegisterDocumentSeries = pgTable('cash_register_document_series', {
	id: serial('id').primaryKey(),
	registerId: integer('register_id').notNull().references(() => cashRegisters.id, { onDelete: 'cascade' }),
	series: varchar('series', { length: 10 }).notNull(),
	description: varchar('description', { length: 200 }),
	receiptTypeCode: varchar('receipt_type_code', { length: 20 }),
	initialSequential: integer('initial_sequential').notNull().default(1),
	lastSequential: integer('last_sequential').notNull().default(0),
	isActiveFacturacion: boolean('is_active_facturacion').notNull().default(true),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	registerReceiptTypeUnique: uniqueIndex('cash_reg_doc_series_register_receipt_type_idx').on(table.registerId, table.receiptTypeCode),
	seriesTypeUnique: uniqueIndex('cash_reg_doc_series_type_series_idx').on(table.receiptTypeCode, table.series),
	registerIdx: index('cash_reg_doc_series_register_idx').on(table.registerId),
}));

export const billingDocuments = pgTable('billing_documents', {
	id: serial('id').primaryKey(),
	branchId: integer('branch_id').notNull().references(() => branches.id), // Documento emitido desde esta sede
	orderId: varchar('order_id', { length: 12 }).notNull().references(() => orders.id),
	splitId: integer('split_id').references(() => orderSplits.id),
	seriesId: integer('series_id').notNull().references(() => cashRegisterDocumentSeries.id),
	documentType: varchar('document_type', { length: 20,
		enum: ['factura', 'boleta', 'nota_de_venta', 'nota_de_credito'] as const }).notNull(),
	series: varchar('series', { length: 10 }).notNull(),
	sequential: integer('sequential').notNull(),
	documentNumber: varchar('document_number', { length: 20 }).notNull().unique(),
	referencedDocumentId: integer('referenced_document_id'), // NC → ID del doc original (factura/boleta)

	// Código del tipo de documento de identidad del comprador (ej. 'RUC', 'DNI', 'CE'
	// en Perú). Ya no es un enum fijo: el catálogo real vive en master.identityDocumentTypes,
	// scoped por país — cada país puede tener sus propios códigos.
	buyerDocType: varchar('buyer_doc_type', { length: 20 }),
	buyerDocNumber: varchar('buyer_doc_number', { length: 20 }),
	buyerName: varchar('buyer_name', { length: 200 }),
	buyerAddress: text('buyer_address'),
	buyerEmail: varchar('buyer_email', { length: 150 }),

	subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
	taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).notNull(),
	taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull(),
	total: decimal('total', { precision: 12, scale: 2 }).notNull(),
	currency: varchar('currency', { length: 10 }).notNull().default('PEN'),

	// Snapshot del anexo/código de establecimiento SUNAT de la sucursal al momento de
	// emitir (igual criterio que buyerName/buyerAddress: se congela, no se referencia,
	// para no perder trazabilidad si el anexo de la sucursal cambia después).
	sunatAnexo: varchar('sunat_anexo', { length: 4 }),

	status: varchar('status', { length: 20,
		enum: ['draft', 'issued', 'voided'] as const }).notNull().default('issued'),
	notes: text('notes'),

	// Campos SUNAT — poblados tras llamar al facturador-restaurante
	sunatStatus: varchar('sunat_status', { length: 20 }),    // ACEPTADO | RECHAZADO | ERROR
	sunatCode: varchar('sunat_code', { length: 10 }),
	sunatMessage: text('sunat_message'),
	xmlHash: varchar('xml_hash', { length: 100 }),
	xmlFilename: varchar('xml_filename', { length: 60 }),
	facturadorComprobanteId: integer('facturador_comprobante_id'),

	issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow(),
	voidedAt: timestamp('voided_at', { withTimezone: true }),
	voidedReason: text('voided_reason'),
	voidedTicket: varchar('voided_ticket', { length: 60 }),
	voidedSunatStatus: varchar('voided_sunat_status', { length: 20 }),
	createdBy: varchar('created_by', { length: 100 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchIdx: index('billing_docs_branch_idx').on(table.branchId),
	orderIdx: index('billing_docs_order_idx').on(table.orderId),
	statusIdx: index('billing_docs_status_idx').on(table.status),
	typeIdx: index('billing_docs_type_idx').on(table.documentType),
	issuedAtIdx: index('billing_docs_issued_at_idx').on(table.issuedAt),
}));

export const billingDocumentLines = pgTable('billing_document_lines', {
	id: serial('id').primaryKey(),
	documentId: integer('document_id').notNull()
		.references(() => billingDocuments.id, { onDelete: 'cascade' }),
	orderItemId: integer('order_item_id').references(() => orderItems.id, { onDelete: 'cascade' }),
	productId: integer('product_id').references(() => products.id),
	productName: varchar('product_name', { length: 150 }).notNull(),
	quantity: integer('quantity').notNull(),
	unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
	alternativesDesc: varchar('alternatives_desc', { length: 300 }),
	packagingFee: decimal('packaging_fee', { precision: 10, scale: 2 }).notNull().default('0'),
	subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
	taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull(),
	lineTotal: decimal('line_total', { precision: 12, scale: 2 }).notNull(),
	notes: varchar('notes', { length: 200 }),
}, (table) => ({
	docIdx: index('billing_doc_lines_doc_idx').on(table.documentId),
	orderItemUniqueIdx: uniqueIndex('billing_doc_lines_order_item_unique_idx').on(table.orderItemId),
}));

// ── Relations Billing ────────────────────────────────────────────────────────

export const cashRegisterDocumentSeriesRelations = relations(cashRegisterDocumentSeries, ({ one, many }) => ({
	register: one(cashRegisters, { fields: [cashRegisterDocumentSeries.registerId], references: [cashRegisters.id] }),
	documents: many(billingDocuments),
}));

export const billingDocumentsRelations = relations(billingDocuments, ({ one, many }) => ({
	branch: one(branches, { fields: [billingDocuments.branchId], references: [branches.id] }),
	order: one(orders, { fields: [billingDocuments.orderId], references: [orders.id] }),
	split: one(orderSplits, { fields: [billingDocuments.splitId], references: [orderSplits.id] }),
	series: one(cashRegisterDocumentSeries, { fields: [billingDocuments.seriesId], references: [cashRegisterDocumentSeries.id] }),
	lines: many(billingDocumentLines),
}));

export const billingDocumentLinesRelations = relations(billingDocumentLines, ({ one }) => ({
	document: one(billingDocuments, { fields: [billingDocumentLines.documentId], references: [billingDocuments.id] }),
	orderItem: one(orderItems, { fields: [billingDocumentLines.orderItemId], references: [orderItems.id] }),
	product: one(products, { fields: [billingDocumentLines.productId], references: [products.id] }),
}));

