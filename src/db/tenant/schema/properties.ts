import { relations } from 'drizzle-orm';
import { pgTable, serial, varchar, integer, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { brands, products, orderItems } from './core';

// ==========================================
// 🏷️ PROPIEDADES — GRUPOS Y OPCIONES DE PRODUCTO
// ==========================================
// Preferencias de preparación sin costo y sin descuento de stock
// (ej: "Helada" / "Sin Helar", término de cocción). Se diferencian de los
// Extras (product_extras) en que NUNCA tienen precio ni fuente de stock.
// El catálogo se define por marca: cada marca arma sus propias propiedades.

// Grupos de propiedades (ej: "Temperatura", "Término de cocción")
export const productPropertyGroups = pgTable('product_property_groups', {
  id: serial('id').primaryKey(),
  brandId: integer('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  isMultiple: boolean('is_multiple').default(false).notNull(),   // permite elegir más de una opción
  isRequired: boolean('is_required').default(false).notNull(),   // cliente/mesero debe elegir al menos una
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  brandIdx: index('ppg_brand_idx').on(table.brandId),
}));

// Opciones individuales dentro de un grupo (sin price, sin sourceType, sin stock)
export const productProperties = pgTable('product_properties', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').notNull().references(() => productPropertyGroups.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Asignación de grupos a productos (qué productos ofrecen qué grupos de propiedades)
export const productPropertyGroupAssignments = pgTable('product_property_group_assignments', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => productPropertyGroups.id, { onDelete: 'cascade' }),
}, (table) => ({
  productGroupUnique: uniqueIndex('ppga_product_group_unique_idx').on(table.productId, table.groupId),
  productIdx: index('ppga_product_idx').on(table.productId),
  groupIdx: index('ppga_group_idx').on(table.groupId),
}));

// Propiedades seleccionadas en cada línea de orden (snapshot del nombre, sin precio)
export const orderItemProperties = pgTable('order_item_properties', {
  id: serial('id').primaryKey(),
  orderItemId: integer('order_item_id').notNull().references(() => orderItems.id, { onDelete: 'cascade' }),
  propertyId: integer('property_id').notNull().references(() => productProperties.id),
  propertyName: varchar('property_name', { length: 100 }).notNull(),
}, (table) => ({
  orderItemIdx: index('oip_order_item_idx').on(table.orderItemId),
  propertyIdx: index('oip_property_idx').on(table.propertyId),
}));

// ==========================================
// 🔗 RELATIONS — PROPIEDADES
// ==========================================

export const productPropertyGroupsRelations = relations(productPropertyGroups, ({ one, many }) => ({
  brand: one(brands, { fields: [productPropertyGroups.brandId], references: [brands.id] }),
  assignments: many(productPropertyGroupAssignments),
  properties: many(productProperties),
}));

export const productPropertyGroupAssignmentsRelations = relations(productPropertyGroupAssignments, ({ one }) => ({
  product: one(products, { fields: [productPropertyGroupAssignments.productId], references: [products.id] }),
  group: one(productPropertyGroups, { fields: [productPropertyGroupAssignments.groupId], references: [productPropertyGroups.id] }),
}));

export const productPropertiesRelations = relations(productProperties, ({ one, many }) => ({
  group: one(productPropertyGroups, { fields: [productProperties.groupId], references: [productPropertyGroups.id] }),
  orderProperties: many(orderItemProperties),
}));

export const orderItemPropertiesRelations = relations(orderItemProperties, ({ one }) => ({
  orderItem: one(orderItems, { fields: [orderItemProperties.orderItemId], references: [orderItems.id] }),
  property: one(productProperties, { fields: [orderItemProperties.propertyId], references: [productProperties.id] }),
}));
