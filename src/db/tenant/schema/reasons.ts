import { relations } from 'drizzle-orm';
import { pgTable, serial, decimal, integer, timestamp, index, varchar, boolean } from 'drizzle-orm/pg-core';
import { branches } from './core';

// ==========================================
// 📝 MOTIVOS (por sucursal)
// ==========================================
// Catálogo configurable de motivos. Una sola tabla con discriminador `type`
// porque los 4 tipos comparten descripción/estado/sucursal y solo difieren en
// 3 columnas puntuales; así un tipo nuevo no requiere cambios de esquema.
//
// Campos por tipo:
//   courtesy       → maxAmount (tope) + isFreeTransfer (transferencia gratuita)
//   order_cancel   → (solo los comunes)
//   document_void  → (solo los comunes)
//   discount       → maxAmount (tope por pedido) + discountMode
export const reasons = pgTable('reasons', {
	id: serial('id').primaryKey(),
	// Cada sucursal define sus propios motivos (mismo criterio que kitchen_stations).
	branchId: integer('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
	// courtesy = Cortesía | order_cancel = Eliminación de pedidos (ORDER)
	// document_void = Anulaciones (DOCUMENT) | discount = Motivos de descuento
	type: varchar('type', { length: 20,
		enum: ['courtesy', 'order_cancel', 'document_void', 'discount'] as const }).notNull(),
	description: varchar('description', { length: 50 }).notNull(),
	longDescription: varchar('long_description', { length: 150 }),
	// TOPE (monto máximo). Solo courtesy y discount; en discount es por pedido.
	maxAmount: decimal('max_amount', { precision: 12, scale: 2 }),
	// CHECK "transferencia gratuita" — solo courtesy.
	isFreeTransfer: boolean('is_free_transfer').default(false).notNull(),
	// Clave del descuento: porcentaje / monto / manual — solo discount.
	discountMode: varchar('discount_mode', { length: 20,
		enum: ['percentage', 'amount', 'manual'] as const }),
	// Valor asociado a la clave: % si es percentage, importe si es amount.
	// En 'manual' queda null a propósito: el valor lo define el usuario en cada pedido.
	discountValue: decimal('discount_value', { precision: 12, scale: 2 }),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	branchTypeIdx: index('reasons_branch_type_idx').on(table.branchId, table.type),
}));

export const reasonsRelations = relations(reasons, ({ one }) => ({
	branch: one(branches, { fields: [reasons.branchId], references: [branches.id] }),
}));
