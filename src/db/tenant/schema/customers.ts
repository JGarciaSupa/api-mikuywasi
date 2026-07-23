import { relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, timestamp, index, varchar, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

// ==========================================
// 👤 CLIENTES FRECUENTES (por corporación/tenant — no por sucursal)
// ==========================================
// Se registran progresivamente al generar pedidos (búsqueda por teléfono/nombre,
// alta rápida si no existe). No tienen scope de sucursal ni marca: un cliente que
// pide en cualquier sede del tenant es el mismo registro.

export const customers = pgTable('customers', {
	id: serial('id').primaryKey(),
	customerType: varchar('customer_type', { length: 20, enum: ['person', 'company'] as const }).notNull().default('person'),
	firstName: varchar('first_name', { length: 100 }).notNull(), // razón social si customerType='company'
	lastName: varchar('last_name', { length: 100 }),
	status: varchar('status', { length: 20, enum: ['active', 'inactive'] as const }).notNull().default('active'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	statusIdx: index('customers_status_idx').on(table.status),
}));

// Teléfonos/emails del cliente. Se exige unicidad en `value` para evitar duplicados.
export const customerContacts = pgTable('customer_contacts', {
	id: serial('id').primaryKey(),
	customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
	contactType: varchar('contact_type', { length: 20, enum: ['phone', 'mobile', 'email'] as const }).notNull(),
	value: varchar('value', { length: 150 }).notNull(),
	isPrimary: boolean('is_primary').default(false).notNull(),
}, (table) => ({
	customerIdx: index('customer_contacts_customer_idx').on(table.customerId),
	valueIdx: uniqueIndex('customer_contacts_value_idx').on(table.value),
}));

// Direcciones de entrega guardadas del cliente (puede tener varias: "Casa", "Oficina"...).
// Sin deliveryZoneId por ahora: no existe catálogo de zonas con ID en el sistema
// (solo un polígono por sucursal) — la zona/tarifa se sigue calculando dinámicamente
// contra el polígono de la sucursal al momento del pedido, igual que hoy.
export const customerAddresses = pgTable('customer_addresses', {
	id: serial('id').primaryKey(),
	customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
	name: varchar('name', { length: 100 }), // "Casa", "Oficina"...
	address: text('address').notNull(),
	district: varchar('district', { length: 100 }),
	latitude: decimal('latitude', { precision: 10, scale: 7 }),
	longitude: decimal('longitude', { precision: 10, scale: 7 }),
	deliveryInstructions: text('delivery_instructions'),
	isDefault: boolean('is_default').default(false).notNull(),
}, (table) => ({
	customerIdx: index('customer_addresses_customer_idx').on(table.customerId),
}));

// Directorio INDEPENDIENTE de perfiles fiscales (RUC/DNI) — NO pertenece a ningún
// Customer (sin customerId, sin relación). Es su propio catálogo de "documentos ya
// vistos": se busca por documentType+documentNumber; si existe se reutiliza tal
// cual, si no existe se agrega. Un mismo RUC puede facturar a distintos clientes
// (nombre/teléfono) sin que eso lo duplique aquí — por eso va desacoplado.
// PRELLENA los campos de comprador al facturar (billing_documents.buyer*) pero no
// los reemplaza — ese snapshot se sigue congelando por documento.
// documentType usa los mismos códigos del catálogo master identity_document_types.
export const customerTaxProfiles = pgTable('customer_tax_profiles', {
	id: serial('id').primaryKey(),
	documentType: varchar('document_type', { length: 20 }).notNull(),
	documentNumber: varchar('document_number', { length: 20 }).notNull(),
	legalName: varchar('legal_name', { length: 200 }),
	taxAddress: text('tax_address'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	uniqueDoc: uniqueIndex('customer_tax_profiles_unique_doc_idx').on(table.documentType, table.documentNumber),
}));

// ── Relations ────────────────────────────────────────────────────────────────

export const customersRelations = relations(customers, ({ many }) => ({
	contacts: many(customerContacts),
	addresses: many(customerAddresses),
}));

export const customerContactsRelations = relations(customerContacts, ({ one }) => ({
	customer: one(customers, { fields: [customerContacts.customerId], references: [customers.id] }),
}));

export const customerAddressesRelations = relations(customerAddresses, ({ one }) => ({
	customer: one(customers, { fields: [customerAddresses.customerId], references: [customers.id] }),
}));
