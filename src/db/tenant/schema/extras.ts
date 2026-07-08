import { relations } from 'drizzle-orm';
import { pgTable, serial, varchar, integer, decimal, boolean, timestamp, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';
import { brands, products, orderItems } from './core';
import { items, recipes } from './warehouse';

// ==========================================
// 🍟 EXTRAS — GRUPOS Y ADICIONES DE PRODUCTO
// ==========================================

// Grupos de extras (ej: "Bebidas", "Salsas adicionales", "Temperatura")
// El catálogo se define por marca: cada marca arma su propio set de grupos.
export const productExtraGroups = pgTable('product_extra_groups', {
  id: serial('id').primaryKey(),
  brandId: integer('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  isMultiple: boolean('is_multiple').default(true).notNull(),   // permite elegir más de uno
  maxSelections: integer('max_selections'),                      // null = sin límite
  isRequired: boolean('is_required').default(false).notNull(),  // cliente debe elegir al menos uno
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  brandIdx: index('peg_brand_idx').on(table.brandId),
}));

// Asignación de grupos a productos (qué productos ofrecen qué grupos de extras)
// extraIds = null  → el producto ofrece TODOS los extras del grupo (comportamiento por defecto)
// extraIds = [..]  → el producto solo ofrece esos extras puntuales dentro del grupo asignado
export const productExtraGroupAssignments = pgTable('product_extra_group_assignments', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => productExtraGroups.id, { onDelete: 'cascade' }),
  extraIds: jsonb('extra_ids').$type<number[] | null>().default(null),
}, (table) => ({
  productGroupUnique: uniqueIndex('pega_product_group_unique_idx').on(table.productId, table.groupId),
  productIdx: index('pega_product_idx').on(table.productId),
  groupIdx: index('pega_group_idx').on(table.groupId),
}));

// Extras individuales dentro de un grupo
// sourceType='item'   → descuenta un item del almacén directamente (ej: gaseosa, porción de salsa)
// sourceType='recipe' → descuenta ingredientes de una mini-receta (ej: mayonesa casera)
// sourceType='none'   → preferencia de preparación sin costo ni stock (ej: "Helada" / "Sin Helar")
export const productExtras = pgTable('product_extras', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').notNull().references(() => productExtraGroups.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull().default('0'),
  sourceType: varchar('source_type', { length: 20, enum: ['item', 'recipe', 'none'] as const }).notNull(),
  itemId: integer('item_id').references(() => items.id),         // cuando sourceType = 'item'
  itemQty: decimal('item_qty', { precision: 12, scale: 3 }).notNull().default('1'), // cantidad del item por unidad de extra
  recipeId: integer('recipe_id').references(() => recipes.id),  // cuando sourceType = 'recipe'
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Extras seleccionados en cada línea de orden (snapshot de precio al momento del pedido)
export const orderItemExtras = pgTable('order_item_extras', {
  id: serial('id').primaryKey(),
  orderItemId: integer('order_item_id').notNull().references(() => orderItems.id, { onDelete: 'cascade' }),
  extraId: integer('extra_id').notNull().references(() => productExtras.id),
  qty: integer('qty').notNull().default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
}, (table) => ({
  orderItemIdx: index('oie_order_item_idx').on(table.orderItemId),
  extraIdx: index('oie_extra_idx').on(table.extraId),
}));

// ==========================================
// 🔗 RELATIONS — EXTRAS
// ==========================================

export const productExtraGroupsRelations = relations(productExtraGroups, ({ one, many }) => ({
  brand: one(brands, { fields: [productExtraGroups.brandId], references: [brands.id] }),
  assignments: many(productExtraGroupAssignments),
  extras: many(productExtras),
}));

export const productExtraGroupAssignmentsRelations = relations(productExtraGroupAssignments, ({ one }) => ({
  product: one(products, { fields: [productExtraGroupAssignments.productId], references: [products.id] }),
  group: one(productExtraGroups, { fields: [productExtraGroupAssignments.groupId], references: [productExtraGroups.id] }),
}));

export const productExtrasRelations = relations(productExtras, ({ one, many }) => ({
  group: one(productExtraGroups, { fields: [productExtras.groupId], references: [productExtraGroups.id] }),
  item: one(items, { fields: [productExtras.itemId], references: [items.id] }),
  recipe: one(recipes, { fields: [productExtras.recipeId], references: [recipes.id] }),
  orderExtras: many(orderItemExtras),
}));

export const orderItemExtrasRelations = relations(orderItemExtras, ({ one }) => ({
  orderItem: one(orderItems, { fields: [orderItemExtras.orderItemId], references: [orderItems.id] }),
  extra: one(productExtras, { fields: [orderItemExtras.extraId], references: [productExtras.id] }),
}));
