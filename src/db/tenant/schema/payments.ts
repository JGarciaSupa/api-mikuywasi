import { pgTable, serial, varchar, integer, decimal, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { orders, paymentMethods, users, orderSplits } from './core';

// ==========================================
// 💳 PAGOS DEL PEDIDO (pago mixto)
// ==========================================
// Desglose de un cobro hecho con varios métodos (ej. S/ 50 efectivo + S/ 30 Yape).
// El cobro con un solo método sigue usando orders.payment_method(_id) y NO crea filas
// aquí. Cada fila genera su propio ingreso de caja (con su isCash y su retención).
export const orderPayments = pgTable('order_payments', {
	id: serial('id').primaryKey(),
	orderId: varchar('order_id', { length: 12 }).notNull().references(() => orders.id, { onDelete: 'cascade' }),
	splitId: integer('split_id').references(() => orderSplits.id, { onDelete: 'cascade' }),
	paymentMethodId: integer('payment_method_id').references(() => paymentMethods.id),
	paymentMethod: varchar('payment_method', { length: 100 }).notNull(), // snapshot del nombre
	amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
	isCash: boolean('is_cash').default(false).notNull(),
	retentionPercentage: decimal('retention_percentage', { precision: 5, scale: 2 }).default('0.00').notNull(),
	retentionAmount: decimal('retention_amount', { precision: 12, scale: 2 }).default('0.00').notNull(),
	createdById: integer('created_by_id').references(() => users.id),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	orderIdx: index('order_payments_order_idx').on(table.orderId),
	splitIdx: index('order_payments_split_idx').on(table.splitId),
}));
