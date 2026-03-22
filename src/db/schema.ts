import { pgTable, serial, text, decimal, integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: text('category'),
  logo: text('logo'),
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  accentColor: text('accent_color'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  email: text('email'),
  address: text('address'),
  planId: integer('plan_id').references(() => plans.id),
  trialEnding: timestamp('trial_ending'),
  status: text('status').default('active').notNull(), // 'active', 'inactive'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const plans = pgTable('plans', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  monthlyPrice: decimal('monthly_price', { precision: 10, scale: 2 }).notNull(),
  yearlyPrice: decimal('yearly_price', { precision: 10, scale: 2 }).notNull(),
  features: text('features').array(),
  order: integer('order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const banners = pgTable('banners', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  url: text('url').notNull(),
});

export const socialLinks = pgTable('social_links', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  platform: text('platform').notNull(),
  url: text('url').notNull(),
  color: text('color'),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  name: text('name').notNull(),
  order: integer('order').default(0),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  categoryId: integer('category_id').references(() => categories.id),
  name: text('name').notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  discountPrice: decimal('discount_price', { precision: 10, scale: 2 }),
  image: text('image'),
  order: integer('order').default(0),
});

export const productAlternatives = pgTable('product_alternatives', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id),
  name: text('name').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
});

export const productSides = pgTable('product_sides', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id),
  name: text('name').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  status: text('status').default('pending').notNull(), // 'pending', 'preparing', 'delivered', 'cancelled'
  total: decimal('total', { precision: 10, scale: 2 }).notNull(),
  customerName: text('customer_name'),
  tableNumber: text('table_number'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id),
  productId: integer('product_id').references(() => products.id),
  quantity: integer('quantity').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  selectedAlternativeName: text('selected_alternative_name'),
  selectedAlternativePrice: decimal('selected_alternative_price', { precision: 10, scale: 2 }),
});

export const orderItemSides = pgTable('order_item_sides', {
  id: serial('id').primaryKey(),
  orderItemId: integer('order_item_id').references(() => orderItems.id),
  sideName: text('side_name').notNull(),
  sidePrice: decimal('side_price', { precision: 10, scale: 2 }).notNull(),
});

export const superAdmins = pgTable('super_admins', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(), // 'admin', 'repartidor'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  plan: one(plans, { fields: [tenants.planId], references: [plans.id] }),
  banners: many(banners),
  socialLinks: many(socialLinks),
  categories: many(categories),
  products: many(products),
  orders: many(orders),
  users: many(users),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  tenants: many(tenants),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  tenant: one(tenants, { fields: [categories.tenantId], references: [tenants.id] }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  alternatives: many(productAlternatives),
  sides: many(productSides),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  tenant: one(tenants, { fields: [orders.tenantId], references: [tenants.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  sides: many(orderItemSides),
}));

export const usersRelations = relations(users, ({ one }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
}));
