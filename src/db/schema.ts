import { pgTable, serial, text, decimal, integer, timestamp, index, varchar, boolean, time, jsonb, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  logo: text('logo'),
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  accentColor: text('accent_color'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  email: text('email'),
  category: text('category'),
  address: jsonb('address').$type<{
    fullAddress: string;
    lat: number;
    lng: number;
  }>(),
  schedules: jsonb('schedules').$type<{
    day: string;
    time: string;
    closed: boolean;
  }[]>().default([]),
  planId: integer('plan_id').references(() => plans.id),
  trialEnding: timestamp('trial_ending'),
  status: text('status').default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  planIdIdx: index('tenants_plan_id_idx').on(table.planId),
}));

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
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  url: text('url').notNull(),
  order: integer('order').notNull().default(0), 
}, (table) => {
  return {
    tenantIdIdx: index('banners_tenant_id_idx').on(table.tenantId),
    tenantOrderUnique: unique('banners_tenant_order_unique').on(table.tenantId, table.order),
  }
});

export const socialLinks = pgTable('social_links', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  platform: text('platform').notNull(),
  url: text('url').notNull(),
  color: text('color'),
  order: integer('order').notNull().default(0),
  isActive: boolean('is_active').default(true).notNull(),
}, (table) => {
  return {
    tenantIdIdx: index('social_links_tenant_id_idx').on(table.tenantId),
  }
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  name: varchar('name', { length: 50 }).notNull(),
  order: integer('order').default(0),
  isActive: boolean('is_active').default(true).notNull(),
  startTime: time('start_time'), 
  endTime: time('end_time'),     
  availableDays: jsonb('available_days').default([0,1,2,3,4,5,6]), 
}, (table) => {
  return {
    tenantIdIdx: index('categories_tenant_id_idx').on(table.tenantId),
  }
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 150 }).notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  discountPrice: decimal('discount_price', { precision: 10, scale: 2 }),
  image: text('image'),
  order: integer('order').default(0),
  // Estado para mostrar o Cultar el producto en la carta
  isActive: boolean('is_active').default(true).notNull(),
  
}, (table) => {
  return {
    tenantIdIdx: index('products_tenant_id_idx').on(table.tenantId),
    categoryIdIdx: index('products_category_id_idx').on(table.categoryId),
  }
});

export const productAlternatives = pgTable('product_alternatives', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  productId: integer('product_id').references(() => products.id),
  name: text('name').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
}, (table) => {
  return {
    tenantIdIdx: index('product_alternatives_tenant_id_idx').on(table.tenantId),
    productIdIdx: index('product_alternatives_product_id_idx').on(table.productId),
  }
});

export const productSides = pgTable('product_sides', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  productId: integer('product_id').references(() => products.id),
  name: text('name').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
}, (table) => {
  return {
    tenantIdIdx: index('product_sides_tenant_id_idx').on(table.tenantId),
    productIdIdx: index('product_sides_product_id_idx').on(table.productId),
  }
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  status: text('status').default('pending').notNull(), // 'pending', 'preparing', 'delivered', 'cancelled'
  total: decimal('total', { precision: 10, scale: 2 }).notNull(),
  customerName: text('customer_name'),
  tableNumber: text('table_number'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    tenantIdIdx: index('orders_tenant_id_idx').on(table.tenantId),
  }
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  orderId: integer('order_id').references(() => orders.id),
  productId: integer('product_id').references(() => products.id),
  quantity: integer('quantity').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  selectedAlternativeName: text('selected_alternative_name'),
  selectedAlternativePrice: decimal('selected_alternative_price', { precision: 10, scale: 2 }),
}, (table) => {
  return {
    tenantIdIdx: index('order_items_tenant_id_idx').on(table.tenantId),
    orderIdIdx: index('order_items_order_id_idx').on(table.orderId),
    productIdIdx: index('order_items_product_id_idx').on(table.productId),
  }
});

export const orderItemSides = pgTable('order_item_sides', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  orderItemId: integer('order_item_id').references(() => orderItems.id),
  sideName: text('side_name').notNull(),
  sidePrice: decimal('side_price', { precision: 10, scale: 2 }).notNull(),
}, (table) => {
  return {
    tenantIdIdx: index('order_item_sides_tenant_id_idx').on(table.tenantId),
    orderItemIdIdx: index('order_item_sides_order_item_id_idx').on(table.orderItemId),
  }
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
}, (table) => {
  return {
    tenantIdIdx: index('users_tenant_id_idx').on(table.tenantId),
  }
});

// Relations
export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  plan: one(plans, { fields: [tenants.planId], references: [plans.id] }),
  banners: many(banners),
  socialLinks: many(socialLinks),
  categories: many(categories),
  products: many(products),
  productAlternatives: many(productAlternatives),
  productSides: many(productSides),
  orders: many(orders),
  orderItems: many(orderItems),
  orderItemSides: many(orderItemSides),
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
  tenant: one(tenants, { fields: [products.tenantId], references: [tenants.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  alternatives: many(productAlternatives),
  sides: many(productSides),
}));

export const bannersRelations = relations(banners, ({ one }) => ({
  tenant: one(tenants, { fields: [banners.tenantId], references: [tenants.id] }),
}));

export const socialLinksRelations = relations(socialLinks, ({ one }) => ({
  tenant: one(tenants, { fields: [socialLinks.tenantId], references: [tenants.id] }),
}));

export const productAlternativesRelations = relations(productAlternatives, ({ one }) => ({
  tenant: one(tenants, { fields: [productAlternatives.tenantId], references: [tenants.id] }),
  product: one(products, { fields: [productAlternatives.productId], references: [products.id] }),
}));

export const productSidesRelations = relations(productSides, ({ one }) => ({
  tenant: one(tenants, { fields: [productSides.tenantId], references: [tenants.id] }),
  product: one(products, { fields: [productSides.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  tenant: one(tenants, { fields: [orders.tenantId], references: [tenants.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  tenant: one(tenants, { fields: [orderItems.tenantId], references: [tenants.id] }),
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  sides: many(orderItemSides),
}));

export const orderItemSidesRelations = relations(orderItemSides, ({ one }) => ({
  tenant: one(tenants, { fields: [orderItemSides.tenantId], references: [tenants.id] }),
  orderItem: one(orderItems, { fields: [orderItemSides.orderItemId], references: [orderItems.id] }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
}));
