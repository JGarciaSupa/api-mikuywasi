import { relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, timestamp, varchar, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

// ==========================================
// 🌐 CONTROL CENTRAL DEL SAAS (SUPER ADMINS)
// ==========================================

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  userName: varchar('user_name', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).unique(),
  password: varchar('password', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  image: text('image'),
  role: varchar('role', { length: 255, enum: ['admin', 'agent'] }).default('admin').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ==========================================
// 💳 PLANES Y MONETIZACIÓN GLOBAL
// ==========================================

export const plans = pgTable('plans', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  monthlyPrice: decimal('monthly_price', { precision: 10, scale: 2 }).notNull(),
  yearlyPrice: decimal('yearly_price', { precision: 10, scale: 2 }).notNull(),
  features: jsonb('features').$type<Record<string, any>>(),
  visible: boolean('visible').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const plansRelations = relations(plans, ({ many }) => ({
  tenants: many(tenants),
  subscriptions: many(subscriptions),
}));

// ==========================================
// 🖥️ INFRAESTRUCTURA DE SERVIDORES (NUEVA)
// ==========================================

export const dbServers = pgTable('db_servers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(), // Ej: 'Servidor A', 'Servidor B' o 'Hetzner-Node-01'
  dbHost: varchar('db_host', { length: 255 }).notNull(),     // IP Privada, VPC o VPN del servidor específico
  dbPort: integer('db_port').default(5432).notNull(),         // 5432 o 6432 (si usa PgBouncer ese server)
  dbUser: varchar('db_user', { length: 255 }).notNull(),     // Usuario administrador que creará las BDs en ese nodo
  dbPassword: text('db_password').notNull(),                 // Encriptado. Contraseña maestra de ese server
  isActive: boolean('is_active').default(true).notNull(),     // Para saber si puedes seguir asignando nuevos tenants aquí

  // 📊 CONTROL DE CAPACIDAD Y SHARDING
  maxTenants: integer('max_tenants').default(100).notNull(),      // 🌟 Límite máximo de BDs que deseas meter en este VPS
  currentTenants: integer('current_tenants').default(0).notNull(), // 🌟 Contador actual. Sube +1 al crear un tenant

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const dbServersRelations = relations(dbServers, ({ many }) => ({
  tenants: many(tenants),
}));

// ==========================================
// 🔌 DIRECTORIO DE TENANTS (MAPA DE SHARDING)
// ==========================================

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  status: text('status', { enum: ['active', 'inactive'] }).default('active').notNull(),

  // 🗄️ REFERENCIA AL SERVIDOR ASIGNADO
  serverId: integer('server_id').references(() => dbServers.id).notNull(), // 🌟 Vinculación al Servidor A, B, etc.
  dbName: varchar('db_name', { length: 255 }).notNull().unique(),         // Cada tenant sigue teniendo su base de datos única en ese servidor

  // Estado del Plan Actual
  planId: integer('plan_id').references(() => plans.id).notNull(),
  planStartsAt: timestamp('plan_starts_at', { withTimezone: true }).defaultNow(),
  planEndsAt: timestamp('plan_ends_at', { withTimezone: true }),
  billingCycle: text('billing_cycle', { enum: ['monthly', 'yearly'] }),

  // Datos de Contacto y Administrativos
  ownerName: varchar('owner_name', { length: 255 }),
  ownerPhone: varchar('owner_phone', { length: 255 }),
  internalNotes: text('internal_notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  server: one(dbServers, {
    fields: [tenants.serverId],
    references: [dbServers.id],
  }),
  plan: one(plans, {
    fields: [tenants.planId],
    references: [plans.id],
  }),
  subscriptions: many(subscriptions),
}));

// ==========================================
// 🧾 HISTORIAL DE FACTURACIÓN (SUBSCRIPTIONS)
// ==========================================

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  planId: integer('plan_id').references(() => plans.id).notNull(),
  billingCycle: text('billing_cycle', { enum: ['monthly', 'yearly'] }).notNull(),

  pricePaid: decimal('price_paid', { precision: 10, scale: 2 }).notNull(),

  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),

  status: text('status', { enum: ['active', 'expired', 'canceled', 'pending_payment'] }).default('active').notNull(),
  paymentStatus: text('payment_status', { enum: ['paid', 'pending', 'failed'] }).default('paid').notNull(),

  notes: text('notes'),
  gatewayName: varchar('gateway_name', { length: 50 }),
  gatewayInvoiceId: varchar('gateway_invoice_id', { length: 255 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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

// ==========================================
// 🎫 SISTEMA DE SOPORTE Y TICKETS (NUEVA)
// ==========================================

export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  // 🏢 Saber qué cliente (tenant) está experimentando el problema
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),

  // 👤 Agente asignado del staff (opcional si aún no se toma el ticket)
  assignedToId: integer('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),

  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),

  // 📊 Control de estados y prioridades comunes en Soporte
  status: text('status', { enum: ['open', 'in_progress', 'resolved', 'closed'] }).default('open').notNull(),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'critical'] }).default('medium').notNull(),
  category: varchar('category', { length: 100 }).default('general').notNull(), // Ej: 'billing', 'bug', 'server', 'account'

  // 🕒 Trazabilidad
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const ticketsRelations = relations(tickets, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tickets.tenantId],
    references: [tenants.id],
  }),
  assignedTo: one(users, {
    fields: [tickets.assignedToId],
    references: [users.id],
  }),
}));

// ==========================================
// 🛡️ HISTÓRICO DE AUDITORÍA Y LOGS (NUEVA)
// ==========================================

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),

  // 🏢 Vinculación opcional: permite filtrar rápidamente los cambios de un cliente específico
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  // 👤 Quién ejecutó la acción (si es null, puede ser una acción automática del sistema/cron)
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),

  // 📝 Detalles del evento
  action: varchar('action', { length: 100 }).notNull(),     // Ej: 'INSERT', 'UPDATE', 'DELETE', 'LOGIN_FAILED'
  tableName: varchar('table_name', { length: 100 }),         // Ej: 'tenants', 'subscriptions', 'db_servers'
  rowId: integer('row_id'),                                  // El ID del registro afectado

  // 🔄 Captura del estado de los datos (Estructuras JSON guardadas como texto)
  oldValues: text('old_values'),                             // Estado anterior (útil en UPDATES)
  newValues: text('new_values'),                             // Estado nuevo o datos insertados

  // 🌐 Datos de contexto para seguridad
  ipAddress: varchar('ip_address', { length: 45 }),          // Soporta IPv4 e IPv6
  userAgent: text('user_agent'),                             // Navegador o cliente API que originó la petición

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditLogs.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// ==========================================
// 🔑 SESIONES Y REFRESH TOKENS (NUEVA)
// ==========================================

export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

// ==========================================
// 🛡️ RBAC — CATÁLOGO GLOBAL
// ==========================================

// Módulos del sistema (ej: "Ventas", "Almacén", "Caja")
export const actions = pgTable('actions', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),      // 'ventas'
  name: varchar('name', { length: 100 }).notNull(),              // 'Ventas'
  description: varchar('description', { length: 255 }),
  icon: varchar('icon', { length: 50 }),                         // nombre del icono para el frontend
  order: integer('order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Operaciones bajo cada módulo (ej: "ventas.crear_factura")
export const subActions = pgTable('sub_actions', {
  id: serial('id').primaryKey(),
  actionId: integer('action_id').notNull().references(() => actions.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 100 }).notNull().unique(),     // 'ventas.crear_factura'
  name: varchar('name', { length: 100 }).notNull(),              // 'Crear Factura'
  description: varchar('description', { length: 255 }),
  order: integer('order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  actionIdx: index('sub_actions_action_idx').on(table.actionId),
}));

// Roles Plantilla globales (ej: "Administrador", "Cajero", "Mozo")
export const baseRoles = pgTable('base_roles', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),      // 'admin', 'cashier'
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Qué sub-acciones incluye cada Rol Plantilla
export const baseRolePermissions = pgTable('base_role_permissions', {
  id: serial('id').primaryKey(),
  baseRoleId: integer('base_role_id').notNull().references(() => baseRoles.id, { onDelete: 'cascade' }),
  subActionId: integer('sub_action_id').notNull().references(() => subActions.id, { onDelete: 'cascade' }),
}, (table) => ({
  unique: uniqueIndex('base_role_perms_unique_idx').on(table.baseRoleId, table.subActionId),
  roleIdx: index('base_role_perms_role_idx').on(table.baseRoleId),
}));

// Control por Tenant: qué sub-acciones están habilitadas (según plan)
export const tenantFeatureGrants = pgTable('tenant_feature_grants', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  subActionId: integer('sub_action_id').notNull().references(() => subActions.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow(),
  grantedBy: integer('granted_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  unique: uniqueIndex('tenant_feature_grants_unique_idx').on(table.tenantId, table.subActionId),
  tenantIdx: index('tenant_feature_grants_tenant_idx').on(table.tenantId),
}));

// Control por Tenant: qué roles plantilla están disponibles para clonar
export const tenantRoleGrants = pgTable('tenant_role_grants', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  baseRoleId: integer('base_role_id').notNull().references(() => baseRoles.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow(),
  grantedBy: integer('granted_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  unique: uniqueIndex('tenant_role_grants_unique_idx').on(table.tenantId, table.baseRoleId),
  tenantIdx: index('tenant_role_grants_tenant_idx').on(table.tenantId),
}));

// ── Relations RBAC Master ────────────────────────────────────────────────────

export const actionsRelations = relations(actions, ({ many }) => ({
  subActions: many(subActions),
}));

export const subActionsRelations = relations(subActions, ({ one, many }) => ({
  action: one(actions, { fields: [subActions.actionId], references: [actions.id] }),
  baseRolePermissions: many(baseRolePermissions),
  tenantFeatureGrants: many(tenantFeatureGrants),
}));

export const baseRolesRelations = relations(baseRoles, ({ many }) => ({
  permissions: many(baseRolePermissions),
  tenantRoleGrants: many(tenantRoleGrants),
}));

export const baseRolePermissionsRelations = relations(baseRolePermissions, ({ one }) => ({
  baseRole: one(baseRoles, { fields: [baseRolePermissions.baseRoleId], references: [baseRoles.id] }),
  subAction: one(subActions, { fields: [baseRolePermissions.subActionId], references: [subActions.id] }),
}));

export const tenantFeatureGrantsRelations = relations(tenantFeatureGrants, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantFeatureGrants.tenantId], references: [tenants.id] }),
  subAction: one(subActions, { fields: [tenantFeatureGrants.subActionId], references: [subActions.id] }),
  grantedByUser: one(users, { fields: [tenantFeatureGrants.grantedBy], references: [users.id] }),
}));

export const tenantRoleGrantsRelations = relations(tenantRoleGrants, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantRoleGrants.tenantId], references: [tenants.id] }),
  baseRole: one(baseRoles, { fields: [tenantRoleGrants.baseRoleId], references: [baseRoles.id] }),
  grantedByUser: one(users, { fields: [tenantRoleGrants.grantedBy], references: [users.id] }),
<<<<<<< HEAD
}));

// ==========================================
// 🌎 CATÁLOGO MAESTRO: PAÍSES (SIGG — Fase 1.1)
// ==========================================

export const countries = pgTable('countries', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  isoCode: varchar('iso_code', { length: 3 }).notNull().unique(), // ISO 3166-1 alpha-2/3, ej. 'PE'
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const countriesRelations = relations(countries, ({ many }) => ({
  locales: many(locales),
}));

// ==========================================
// 💱 CATÁLOGO MAESTRO: TIPOS DE MONEDA (SIGG US 1.3)
// ==========================================

export const currencies = pgTable('currencies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  isoCode: varchar('iso_code', { length: 3 }).notNull().unique(), // ISO 4217, ej. 'PEN', 'USD'
  symbol: varchar('symbol', { length: 5 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const currenciesRelations = relations(currencies, ({ many }) => ({
  localesAsBase: many(locales, { relationName: 'localeBaseCurrency' }),
  localesAsForeign: many(locales, { relationName: 'localeForeignCurrency' }),
}));

// ==========================================
// 🏷️ SIGG — MARCAS (US 1.1, anidadas bajo Corporación/Tenant)
// ==========================================

export const brands = pgTable('brands', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),

  name: varchar('name', { length: 255 }).notNull(),
  logoUrl: text('logo_url'),
  primaryColor: varchar('primary_color', { length: 7 }), // Ej: '#FF5733'
  isActive: boolean('is_active').default(true).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdx: index('brands_tenant_idx').on(table.tenantId),
}));

export const brandsRelations = relations(brands, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [brands.tenantId],
    references: [tenants.id],
  }),
  locales: many(locales),
}));

// ==========================================
// 🏬 SIGG US 1.2 — LOCALES (SUCURSALES) Y PARÁMETROS FISCALES
// ==========================================

export const locales = pgTable('locales', {
  id: serial('id').primaryKey(),
  brandId: integer('brand_id').references(() => brands.id, { onDelete: 'cascade' }).notNull(),

  // Tab 1: Datos Generales
  name: varchar('name', { length: 255 }).notNull(),
  address: varchar('address', { length: 500 }),
  phone: varchar('phone', { length: 30 }),
  countryId: integer('country_id').references(() => countries.id).notNull(),

  // Tab 2: Configuración Tributaria
  ruc: varchar('ruc', { length: 20 }).notNull(),
  sunatAnexoCode: varchar('sunat_anexo_code', { length: 10 }).default('0000').notNull(),
  appliesTax1: boolean('applies_tax_1').default(true).notNull(),  // IGV
  appliesTax2: boolean('applies_tax_2').default(false).notNull(),
  appliesTax3: boolean('applies_tax_3').default(false).notNull(),
  appliesIcbper: boolean('applies_icbper').default(false).notNull(),

  // Tab 3: Finanzas
  baseCurrencyId: integer('base_currency_id').references(() => currencies.id).notNull(),
  foreignCurrencyId: integer('foreign_currency_id').references(() => currencies.id),

  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  brandIdx: index('locales_brand_idx').on(table.brandId),
}));

export const localesRelations = relations(locales, ({ one }) => ({
  brand: one(brands, {
    fields: [locales.brandId],
    references: [brands.id],
  }),
  country: one(countries, {
    fields: [locales.countryId],
    references: [countries.id],
  }),
  baseCurrency: one(currencies, {
    fields: [locales.baseCurrencyId],
    references: [currencies.id],
    relationName: 'localeBaseCurrency',
  }),
  foreignCurrency: one(currencies, {
    fields: [locales.foreignCurrencyId],
    references: [currencies.id],
    relationName: 'localeForeignCurrency',
  }),
}));
=======
}));
>>>>>>> parent of 54348cb (US 1.2: Gestión de Locales (Sucursales) y Parámetros Fiscales)
