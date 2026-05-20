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
    role: varchar('role', { length: 255, enum: ['admin', 'sales'] }).default('admin').notNull(),
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