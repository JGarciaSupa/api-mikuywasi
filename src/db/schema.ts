import { sql, relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, timestamp, index, varchar, boolean, time, jsonb, uniqueIndex, check } from 'drizzle-orm/pg-core';

// TODO: SUPER ADMIN
// --- USUARIOS ---
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  image: text('image'),
  role: varchar('role', { length: 255, enum: ['super-admin', 'admin'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  roleTenantCheck: check('role_tenant_check', sql`
    (role = 'super-admin' AND tenant_id IS NULL) OR
    (role = 'admin' AND tenant_id IS NOT NULL)
  `),
  tenantIdIdx: index('users_tenant_id_idx').on(table.tenantId),
}));

// --- REFRESH TOKENS ---
export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(), // ID del refresh token
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(), // Hash del refresh token
  userAgent: varchar('user_agent', { length: 255 }), // User agent del dispositivo
  ipAddress: varchar('ip_address', { length: 100 }), // IP del dispositivo
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // Fecha de expiración del token
  isRevoked: boolean('is_revoked').default(false).notNull(), // Estado del token
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(), // Fecha de creación del token
}, (table) => ({
  userIdIdx: index('refresh_tokens_user_id_idx').on(table.userId),
  tokenHashIdx: index('refresh_tokens_token_hash_idx').on(table.tokenHash),
}));

// --- PLANES ---
export const plans = pgTable('plans', {
  id: serial('id').primaryKey(), // ID del plan
  name: varchar('name', { length: 255 }).notNull(), // Nombre del plan
  monthlyPrice: decimal('monthly_price', { precision: 10, scale: 2 }).notNull(), // Precio mensual
  yearlyPrice: decimal('yearly_price', { precision: 10, scale: 2 }).notNull(), // Precio anual
  features: text('features').array(), // Características del plan
  order: integer('order').default(0), // Orden del plan
  visible: boolean('visible').default(false).notNull(), // Estado del plan
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(), // Fecha de creación del plan
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(), // Fecha de actualización del plan
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // Fecha de eliminación del plan
});

export const plansRelations = relations(plans, ({ many }) => ({
  tenants: many(tenants),
  subscriptions: many(subscriptions),
}));


// TODO: TENANTS
// --- TENANTS (REGLAS DE NEGOCIO) ---
export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(), // ID del tenant
  slug: varchar('slug', { length: 255 }).notNull().unique(), // URL amigable del tenant
  name: varchar('name', { length: 255 }).notNull(), // Nombre del tenant
  logo: varchar('logo', { length: 255 }), // Logo del tenant
  primaryColor: varchar('primary_color', { length: 255 }).default("#000000"), // Color primario del tenant
  secondaryColor: varchar('secondary_color', { length: 255 }).default("#000000"), // Color secundario del tenant
  accentColor: varchar('accent_color', { length: 255 }).default("#000000"), // Color de acento del tenant
  phone: varchar('phone', { length: 255 }), // Teléfono del tenant
  whatsapp: varchar('whatsapp', { length: 255 }), // WhatsApp del tenant
  email: varchar('email', { length: 255 }), // Email del tenant
  category: varchar('category', { length: 255 }), // Categoría del negocio
  address: jsonb('address').$type<{
    fullAddress: string;
    lat: number;
    lng: number;
  }>(), // Dirección del local
  schedules: jsonb('schedules').$type<{
    day: string;
    startTime: string;
    endTime: string;
    closed: boolean;
  }[]>().default([]), // Horarios de atención

  // Configuración de Atención y Delivery
  hasDelivery: boolean('has_delivery').default(false).notNull(), // Delivery
  hasPickup: boolean('has_pickup').default(false).notNull(), // Recojo
  hasDineIn: boolean('has_dine_in').default(false).notNull(), // Para comer en el local

  // Si tiene delivery activar seguimiento en tiempo real
  hasLiveTracking: boolean('has_live_tracking').default(false).notNull(), // Seguimiento en tiempo real

  minOrderAmount: decimal('min_order_amount', { precision: 10, scale: 2 }).default('0.00'), // Monto mínimo del pedido
  defaultDeliveryFee: decimal('default_delivery_fee', { precision: 10, scale: 2 }).default('0.00'), // Tarifa de envío por defecto
  freeDeliveryThreshold: decimal('free_delivery_threshold', { precision: 10, scale: 2 }), // Umbral de envío gratuito

  // Plan y Estado
  planId: integer('plan_id').references(() => plans.id).notNull(), // ID del plan
  planStartsAt: timestamp('plan_starts_at', { withTimezone: true }).defaultNow(), // Fecha de inicio del plan
  planEndsAt: timestamp('plan_ends_at', { withTimezone: true }), // Fecha de fin del plan
  billingCycle: text('billing_cycle', { enum: ['monthly', 'yearly'] }), // Ciclo de facturación
  status: text('status', { enum: ['active', 'inactive'] }).default('active').notNull(), // Estado del tenant

  // Datos del Propietario / Administrativos
  ownerName: varchar('owner_name', { length: 255 }), // Nombre del propietario
  ownerPhone: varchar('owner_phone', { length: 255 }), // Teléfono del propietario
  fiscalId: varchar('fiscal_id', { length: 255 }), // RUC / DNI
  fiscalName: varchar('fiscal_name', { length: 255 }), // Razón Social
  internalNotes: text('internal_notes'), // Notas para soporte/admin

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(), // Fecha de creación del tenant
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(), // Fecha de actualización del tenant
});

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  plan: one(plans, {
    fields: [tenants.planId],
    references: [plans.id],
  }),
  subscriptions: many(subscriptions),
  banners: many(banners),
  socialLinks: many(socialLinks),
  categories: many(categories),
  products: many(products),
  paymentMethods: many(paymentMethods),
}));

// --- SUSCRIPCIONES ---
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  planId: integer('plan_id').references(() => plans.id).notNull(),
  billingCycle: text('billing_cycle', { enum: ['monthly', 'yearly'] }).notNull(),
  pricePaid: decimal('price_paid', { precision: 10, scale: 2 }).notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).defaultNow().notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  status: text('status', { enum: ['active', 'expired', 'canceled', 'pending_payment'] }).default('active').notNull(),
  paymentStatus: text('payment_status', { enum: ['paid', 'pending', 'failed'] }).default('paid').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdIdx: index('subscriptions_tenant_id_idx').on(table.tenantId),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [subscriptions.tenantId],
    references: [tenants.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

// --- METODOS DE PAGO ---
export const paymentMethods = pgTable('payment_methods', {
  id: serial('id').primaryKey(), // ID del método de pago
  name: varchar('name', { length: 100 }).notNull(), // Nombre del método de pago
  isActive: boolean('is_active').default(true).notNull(), // Estado del método de pago
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(), // Fecha de creación del método de pago
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(), // Fecha de actualización del método de pago
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(), // ID del tenant
}, (table) => ({
  tenantIdIdx: index('payment_methods_tenant_id_idx').on(table.tenantId),
}));

export const paymentMethodsRelations = relations(paymentMethods, ({ one }) => ({
  tenant: one(tenants, {
    fields: [paymentMethods.tenantId],
    references: [tenants.id],
  }),
}));

// --- MESAS ---
export const tables = pgTable('restaurant_tables', {
  id: serial('id').primaryKey(), // ID de la mesa
  name: varchar('name', { length: 50 }).notNull(), // Nombre de la mesa
  slug: varchar('slug', { length: 8 }).notNull().unique(), // URL amigable de la mesa
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(), // Fecha de creación de la mesa
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(), // Fecha de actualización de la mesa
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(), // ID del tenant
}, (table) => ({
  tenantSlugUnique: uniqueIndex('tenant_slug_unique').on(table.tenantId, table.slug),
  tenantIdIdx: index('restaurant_tables_tenant_id_idx').on(table.tenantId),
}));

// --- CATALOGO ---
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  name: varchar('name', { length: 50 }).notNull(),
  order: integer('order').default(0),
  isActive: boolean('is_active').default(true).notNull(),
  startTime: time('start_time'),
  endTime: time('end_time'),
  availableDays: jsonb('available_days').default([0, 1, 2, 3, 4, 5, 6]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdIdx: index('categories_tenant_id_idx').on(table.tenantId),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [categories.tenantId],
    references: [tenants.id],
  }),
  products: many(products),
}));

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 150 }).notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  discountPrice: decimal('discount_price', { precision: 10, scale: 2 }),
  packagingFee: decimal('packaging_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
  image: text('image'),
  order: integer('order').default(0),
  alternatives: jsonb('alternatives').$type<{
    name: string;
    extraPrice: number;
  }[]>().default([]),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  categoryIdIdx: index('products_category_id_idx').on(table.categoryId),
}));

export const productsRelations = relations(products, ({ one }) => ({
  tenant: one(tenants, {
    fields: [products.tenantId],
    references: [tenants.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
}));

// --- ORDENES ---
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  customerName: varchar('customer_name', { length: 100 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
  customerAddress: text('customer_address'),

  deliveryType: text('delivery_type', { enum: ['delivery', 'pickup', 'dine_in'] }).notNull(),
  tableId: integer('table_id').references(() => tables.id),
  tableName: varchar('table_name', { length: 50 }),

  paymentMethod: text('payment_method').notNull(),
  notes: text('notes'), // Nota general

  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  deliveryFee: decimal('delivery_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
  total: decimal('total', { precision: 10, scale: 2 }).notNull(),

  status: text('status', {
    enum: ['pending', 'confirmed', 'preparing', 'dispatched', 'ready_for_pickup', 'completed', 'cancelled']
  }).default('pending').notNull(),

  trackingCode: varchar('tracking_code', { length: 20 }).unique(),
  driverId: integer('driver_id').references(() => users.id),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  productId: integer('product_id').references(() => products.id),
  productName: varchar('product_name', { length: 150 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull(),
  selectedAlternatives: jsonb('selected_alternatives').$type<{ name: string, extraPrice: number }[]>().default([]),
  packagingFee: decimal('packaging_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
  notes: text('notes'), // Nota del plato
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
});

// --- OTROS ---
export const banners = pgTable('banners', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  url: text('url').notNull(),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdIdx: index('banners_tenant_id_idx').on(table.tenantId),
}));

export const bannersRelations = relations(banners, ({ one }) => ({
  tenant: one(tenants, {
    fields: [banners.tenantId],
    references: [tenants.id],
  }),
}));

export const socialLinks = pgTable('social_links', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  platform: text('platform').notNull(),
  url: text('url').notNull(),
  order: integer('order').notNull().default(0),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdIdx: index('social_links_tenant_id_idx').on(table.tenantId),
}));

export const socialLinksRelations = relations(socialLinks, ({ one }) => ({
  tenant: one(tenants, {
    fields: [socialLinks.tenantId],
    references: [tenants.id],
  }),
}));