import { relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, timestamp, index, varchar, boolean, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { orders, orderSplits, orderItems, products, branches, paymentMethods, users } from './core';
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
		enum: ['factura', 'boleta', 'nota_de_venta', 'nota_de_credito', 'cortesia'] as const }).notNull(),
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

	// Snapshot del emisor (empresa SUNAT) para el PDF: se congela la primera vez que se
	// genera el comprobante, así el PDF no depende del facturador ni cambia si la empresa
	// se edita después. NULL = documento aún sin snapshot (se resuelve en vivo).
	emisorRuc: varchar('emisor_ruc', { length: 15 }),
	emisorName: varchar('emisor_name', { length: 200 }),
	emisorAddress: text('emisor_address'),

	status: varchar('status', { length: 20,
		enum: ['draft', 'issued', 'voided'] as const }).notNull().default('issued'),
	notes: text('notes'),

	// Pago pendiente: marca interna (no SUNAT, no caja) de que el cliente se llevó la venta
	// sin pagar por un acuerdo con el dueño. Se resuelve a mano con "Marcar como cobrado".
	// Documento interno de cortesía (document_type 'cortesia'): total 0; valor de referencia y
	// motivo de lo regalado. No va a SUNAT ni suma a ventas ni a caja.
	courtesyAmount: decimal('courtesy_amount', { precision: 12, scale: 2 }).default('0.00').notNull(),
	courtesyMotivo: varchar('courtesy_motivo', { length: 200 }),
	paymentPending: boolean('payment_pending').default(false).notNull(),
	paymentPendingNote: varchar('payment_pending_note', { length: 200 }),
	paymentCollectedAt: timestamp('payment_collected_at', { withTimezone: true }),
	paymentCollectedBy: varchar('payment_collected_by', { length: 100 }),
	// Cómo pagó el cliente al cobrar la venta pendiente (informativo: la caja ya registró el pago al vender)
	paymentCollectedMethodId: integer('payment_collected_method_id').references(() => paymentMethods.id),
	paymentCollectedMethod: varchar('payment_collected_method', { length: 100 }),
	paymentCollectedReference: varchar('payment_collected_reference', { length: 50 }),

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
	voidedBy: varchar('voided_by', { length: 100 }), // usuario que anuló (mismo criterio que created_by)
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

// Autorización remota de una anulación (pedido, producto enviado o comprobante): el supervisor valida
// su contraseña en su celular (enlace con token) y la API genera un código de 6 dígitos de un solo uso,
// válido solo para esa anulación y para quien la pidió. Mismo modelo que cash_close_authorizations.
export const voidAuthorizations = pgTable('void_authorizations', {
	id: serial('id').primaryKey(),
	type: varchar('type', { length: 20, enum: ['order', 'item', 'document'] as const }).notNull(),
	orderId: varchar('order_id', { length: 12 }).references(() => orders.id),
	orderItemId: integer('order_item_id').references(() => orderItems.id),
	documentId: integer('document_id').references(() => billingDocuments.id),
	branchId: integer('branch_id').notNull().references(() => branches.id),
	// Lo que ve el supervisor al aprobar (pedido, producto, cantidad, importe, motivo)
	summary: jsonb('summary').$type<Record<string, unknown>>(),
	requestTokenHash: varchar('request_token_hash', { length: 64 }).notNull(),
	requestedById: integer('requested_by_id').references(() => users.id),
	status: varchar('status', { length: 20, enum: ['pending', 'approved', 'used', 'locked'] as const }).notNull().default('pending'),
	codeHash: varchar('code_hash', { length: 64 }),
	approvedById: integer('approved_by_id').references(() => users.id),
	approvedAt: timestamp('approved_at', { withTimezone: true }),
	usedAt: timestamp('used_at', { withTimezone: true }),
	failedAttempts: integer('failed_attempts').notNull().default(0),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	requestTokenHashUnique: uniqueIndex('void_authorizations_request_token_hash_idx').on(table.requestTokenHash),
	orderIdx: index('void_authorizations_order_idx').on(table.orderId),
	documentIdx: index('void_authorizations_document_idx').on(table.documentId),
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

