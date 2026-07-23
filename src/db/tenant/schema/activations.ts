import { relations } from 'drizzle-orm';
import { pgTable, serial, integer, varchar, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { cashRegisters } from './warehouse';

// ==========================================
// 🎚️ ACTIVACIONES POR CAJA
// ==========================================
// Estado (ON/OFF) de las activaciones a nivel de caja. El catálogo de activaciones
// disponibles vive en el maestro (`activations` en db/master/schema.ts); aquí solo
// se guarda el override por caja. Se referencia por `activationCode` (string), NO
// por id, porque maestro y tenant están en bases de datos distintas — mismo criterio
// que `billingSeries.receiptTypeCode`.
//
// Valor efectivo de una caja = fila de esta tabla si existe, si no el
// `defaultEnabled` del maestro. Sin nivel corporación por ahora.
export const registerActivations = pgTable('register_activations', {
	id: serial('id').primaryKey(),
	registerId: integer('register_id').notNull().references(() => cashRegisters.id, { onDelete: 'cascade' }),
	activationCode: varchar('activation_code', { length: 80 }).notNull(),
	isEnabled: boolean('is_enabled').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	registerCodeUnique: uniqueIndex('register_activations_reg_code_idx').on(table.registerId, table.activationCode),
}));

export const registerActivationsRelations = relations(registerActivations, ({ one }) => ({
	register: one(cashRegisters, { fields: [registerActivations.registerId], references: [cashRegisters.id] }),
}));
