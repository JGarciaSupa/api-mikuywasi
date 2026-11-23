import { pgTable, serial, integer, varchar, boolean, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './core';

// ==========================================
// ✉️ CORREO DE ENVÍO DEL RESTAURANTE
// ==========================================
// Cuenta SMTP propia del restaurante (p. ej. Gmail con contraseña de aplicación) desde la que se
// envían los correos del sistema (reportes del cierre de caja). Una sola fila por tenant.
// La contraseña se guarda cifrada (utils/secret-crypto) y nunca se devuelve al navegador.
export const mailSettings = pgTable('mail_settings', {
	id: serial('id').primaryKey(),
	singleton: boolean('singleton').default(true).notNull(),
	host: varchar('host', { length: 255 }).notNull(),
	port: integer('port').default(465).notNull(),
	username: varchar('username', { length: 255 }).notNull(),
	passwordEncrypted: text('password_encrypted').notNull(),
	fromName: varchar('from_name', { length: 120 }),
	isActive: boolean('is_active').default(true).notNull(),
	updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	singletonUnique: uniqueIndex('mail_settings_singleton_idx').on(table.singleton),
}));
