import { relations } from 'drizzle-orm';
import { pgTable, serial, integer, timestamp, index, varchar, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { users, branches } from './core';

// 🛡️ RBAC — CONTROL DE ACCESO LOCAL
// ==========================================

// Copia local del catálogo de sub-acciones habilitadas por el Superadmin para este tenant.
// masterSubActionId es la FK conceptual hacia sub_actions.id en la BD Master.
// No hay FK física entre bases de datos; la sincronización la hace el servicio de sync.
export const permissionsCatalog = pgTable('permissions_catalog', {
	id: serial('id').primaryKey(),
	masterSubActionId: integer('master_sub_action_id').notNull().unique(), // ref conceptual → BD Master sub_actions.id
	actionCode: varchar('action_code', { length: 50 }).notNull(),          // 'ventas'
	actionName: varchar('action_name', { length: 100 }).notNull(),         // 'Ventas'
	subActionCode: varchar('sub_action_code', { length: 100 }).notNull(),  // 'ventas.crear_factura'
	subActionName: varchar('sub_action_name', { length: 100 }).notNull(),  // 'Crear Factura'
	order: integer('order').default(0).notNull(),
	syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	actionCodeIdx: index('perm_catalog_action_idx').on(table.actionCode),
}));

// Roles del tenant: pueden ser clones de un Rol Base (masterRoleId ≠ null)
// o roles completamente personalizados (isCustom = true, masterRoleId = null).
export const roles = pgTable('roles', {
	id: serial('id').primaryKey(),
	masterRoleId: integer('master_role_id'),                      // ref conceptual → BD Master base_roles.id
	code: varchar('code', { length: 50 }).notNull().unique(),
	name: varchar('name', { length: 100 }).notNull(),
	description: varchar('description', { length: 255 }),
	isCustom: boolean('is_custom').default(false).notNull(),       // true = creado por el admin del tenant
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Qué permisos (del catálogo local) tiene asignados cada rol del tenant
export const rolePermissions = pgTable('role_permissions', {
	id: serial('id').primaryKey(),
	roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
	permCatalogId: integer('perm_catalog_id').notNull().references(() => permissionsCatalog.id, { onDelete: 'cascade' }),
}, (table) => ({
	unique: uniqueIndex('role_permissions_unique_idx').on(table.roleId, table.permCatalogId),
	roleIdx: index('role_permissions_role_idx').on(table.roleId),
}));

// Asignación de rol a usuario (1 usuario → 1 rol).
// branchId permite que un usuario tenga distintos roles en distintas sucursales.
// null = rol global (admin central sin restricción de sede).
export const userRoles = pgTable('user_roles', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
	roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'restrict' }),
	branchId: integer('branch_id').references(() => branches.id, { onDelete: 'cascade' }), // null = rol global
	assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
	assignedBy: integer('assigned_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
	roleIdx: index('user_roles_role_idx').on(table.roleId),
	branchIdx: index('user_roles_branch_idx').on(table.branchId),
}));

// ── Relations RBAC Tenant ────────────────────────────────────────────────────

export const permissionsCatalogRelations = relations(permissionsCatalog, ({ many }) => ({
	rolePermissions: many(rolePermissions),
	userOverrides: many(userPermissionOverrides),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
	permissions: many(rolePermissions),
	userRoles: many(userRoles),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
	role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
	permCatalog: one(permissionsCatalog, { fields: [rolePermissions.permCatalogId], references: [permissionsCatalog.id] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
	user: one(users, { fields: [userRoles.userId], references: [users.id] }),
	role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
	assignedByUser: one(users, {
		fields: [userRoles.assignedBy],
		references: [users.id],
		relationName: 'assignedByUser',
	}),
}));

// Permisos individuales por usuario: grant amplía lo del rol, deny restringe (incluso lo del rol)
// effective = (role_perms ∪ grants) − denies
// branchId: null = override global; con valor = override solo en esa sede
export const userPermissionOverrides = pgTable('user_permission_overrides', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	permCatalogId: integer('perm_catalog_id').notNull().references(() => permissionsCatalog.id, { onDelete: 'cascade' }),
	branchId: integer('branch_id').references(() => branches.id, { onDelete: 'cascade' }), // null = override global
	type: varchar('type', { length: 10, enum: ['grant', 'deny'] as const }).notNull().default('grant'),
	grantedBy: integer('granted_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	unique: uniqueIndex('user_perm_overrides_unique_idx').on(table.userId, table.permCatalogId),
	userIdx: index('user_perm_overrides_user_idx').on(table.userId),
	branchIdx: index('user_perm_overrides_branch_idx').on(table.branchId),
}));

export const userPermissionOverridesRelations = relations(userPermissionOverrides, ({ one }) => ({
	user: one(users, { fields: [userPermissionOverrides.userId], references: [users.id] }),
	permCatalog: one(permissionsCatalog, { fields: [userPermissionOverrides.permCatalogId], references: [permissionsCatalog.id] }),
	grantedByUser: one(users, {
		fields: [userPermissionOverrides.grantedBy],
		references: [users.id],
		relationName: 'grantedByUser',
	}),
}));

// ==========================================
