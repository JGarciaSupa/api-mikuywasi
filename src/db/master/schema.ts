import { relations } from 'drizzle-orm';
import { pgTable, serial, text, decimal, integer, timestamp, varchar, boolean } from 'drizzle-orm/pg-core';

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
  features: text('features').array(),
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