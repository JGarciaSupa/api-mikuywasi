import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { masterDb } from '../db';
import {
  actions,
  subActions,
  baseRoles,
  baseRolePermissions,
} from '../db/master/schema';

type SeedAction = {
  code: string;
  name: string;
  description: string;
  icon: string;
  order: number;
  subActions: Array<{
    code: string;
    name: string;
    description: string;
    order: number;
  }>;
};

type SeedRole = {
  code: string;
  name: string;
  description: string;
  subActionCodes: string[];
};

const RBAC_ACTIONS: SeedAction[] = [
  {
    code: 'dashboard',
    name: 'Dashboard',
    description: 'Panel principal y métricas de operación.',
    icon: 'LayoutDashboard',
    order: 1,
    subActions: [
      { code: 'dashboard.ver', name: 'Ver dashboard', description: 'Acceder al panel principal.', order: 1 },
      { code: 'dashboard.metricas', name: 'Ver métricas', description: 'Visualizar métricas y KPIs.', order: 2 },
    ],
  },
  {
    code: 'ordenes',
    name: 'Órdenes',
    description: 'Gestión del ciclo de órdenes.',
    icon: 'ReceiptText',
    order: 2,
    subActions: [
      { code: 'ordenes.ver', name: 'Ver órdenes', description: 'Listar órdenes del sistema.', order: 1 },
      { code: 'ordenes.crear', name: 'Crear orden', description: 'Registrar nuevas órdenes.', order: 2 },
      { code: 'ordenes.actualizar_estado', name: 'Actualizar estado', description: 'Cambiar estado de una orden.', order: 3 },
      { code: 'ordenes.anular', name: 'Anular orden', description: 'Anular/cancelar órdenes.', order: 4 },
    ],
  },
  {
    code: 'productos',
    name: 'Productos',
    description: 'Catálogo de productos y precios.',
    icon: 'Package',
    order: 3,
    subActions: [
      { code: 'productos.ver', name: 'Ver productos', description: 'Listar catálogo de productos.', order: 1 },
      { code: 'productos.crear', name: 'Crear producto', description: 'Registrar nuevos productos.', order: 2 },
      { code: 'productos.editar', name: 'Editar producto', description: 'Modificar productos existentes.', order: 3 },
      { code: 'productos.eliminar', name: 'Eliminar producto', description: 'Eliminar productos.', order: 4 },
    ],
  },
  {
    code: 'usuarios_staff',
    name: 'Usuarios y Staff',
    description: 'Gestión de usuarios internos y personal.',
    icon: 'Users',
    order: 4,
    subActions: [
      { code: 'usuarios_staff.ver', name: 'Ver usuarios', description: 'Listar usuarios del tenant.', order: 1 },
      { code: 'usuarios_staff.crear', name: 'Crear usuario', description: 'Crear usuarios internos.', order: 2 },
      { code: 'usuarios_staff.editar', name: 'Editar usuario', description: 'Editar información de usuarios.', order: 3 },
      { code: 'usuarios_staff.eliminar', name: 'Eliminar usuario', description: 'Eliminar usuarios internos.', order: 4 },
    ],
  },
  {
    code: 'rbac',
    name: 'RBAC',
    description: 'Roles y permisos por tenant.',
    icon: 'ShieldCheck',
    order: 5,
    subActions: [
      { code: 'rbac.catalogo.ver', name: 'Ver catálogo RBAC', description: 'Ver catálogo de permisos disponible.', order: 1 },
      { code: 'rbac.roles.ver', name: 'Ver roles', description: 'Listar roles del tenant.', order: 2 },
      { code: 'rbac.roles.crear', name: 'Crear rol', description: 'Crear roles personalizados.', order: 3 },
      { code: 'rbac.roles.editar', name: 'Editar rol', description: 'Modificar permisos de roles.', order: 4 },
      { code: 'rbac.roles.eliminar', name: 'Eliminar rol', description: 'Eliminar roles no requeridos.', order: 5 },
      { code: 'rbac.asignar', name: 'Asignar roles', description: 'Asignar roles a usuarios.', order: 6 },
      { code: 'rbac.overrides', name: 'Gestionar overrides', description: 'Configurar grant/deny por usuario.', order: 7 },
    ],
  },
  {
    code: 'almacen',
    name: 'Almacén',
    description: 'Inventario, movimientos y ajustes.',
    icon: 'Warehouse',
    order: 6,
    subActions: [
      { code: 'almacen.ver', name: 'Ver almacén', description: 'Visualizar inventario y stock.', order: 1 },
      { code: 'almacen.movimientos', name: 'Registrar movimientos', description: 'Entradas/salidas/transferencias.', order: 2 },
      { code: 'almacen.ajustes', name: 'Ajustar stock', description: 'Realizar ajustes de inventario.', order: 3 },
    ],
  },
];

const RBAC_ROLES: SeedRole[] = [
  {
    code: 'rol_admin_tenant',
    name: 'Administrador de Tenant',
    description: 'Gestión operativa completa del tenant.',
    subActionCodes: RBAC_ACTIONS.flatMap((a) => a.subActions.map((s) => s.code)),
  },
  {
    code: 'rol_operaciones',
    name: 'Operaciones',
    description: 'Opera órdenes, productos y dashboard.',
    subActionCodes: [
      'dashboard.ver',
      'dashboard.metricas',
      'ordenes.ver',
      'ordenes.crear',
      'ordenes.actualizar_estado',
      'productos.ver',
      'productos.crear',
      'productos.editar',
      'almacen.ver',
      'almacen.movimientos',
    ],
  },
  {
    code: 'rol_lector',
    name: 'Lector',
    description: 'Solo lectura de módulos clave.',
    subActionCodes: [
      'dashboard.ver',
      'dashboard.metricas',
      'ordenes.ver',
      'productos.ver',
      'usuarios_staff.ver',
      'rbac.catalogo.ver',
      'rbac.roles.ver',
      'almacen.ver',
    ],
  },
];

async function upsertActionsAndSubActions() {
  const subActionIdByCode = new Map<string, number>();
  let actionsCreated = 0;
  let subActionsCreated = 0;

  for (const actionSeed of RBAC_ACTIONS) {
    const existingAction = await masterDb.query.actions.findFirst({
      where: eq(actions.code, actionSeed.code),
    });

    let actionId = existingAction?.id;
    if (!actionId) {
      const [created] = await masterDb.insert(actions).values({
        code: actionSeed.code,
        name: actionSeed.name,
        description: actionSeed.description,
        icon: actionSeed.icon,
        order: actionSeed.order,
        isActive: true,
      }).returning();
      actionId = created.id;
      actionsCreated++;
    }

    for (const subSeed of actionSeed.subActions) {
      const existingSubAction = await masterDb.query.subActions.findFirst({
        where: eq(subActions.code, subSeed.code),
      });

      let subActionId = existingSubAction?.id;
      if (!subActionId) {
        const [created] = await masterDb.insert(subActions).values({
          actionId,
          code: subSeed.code,
          name: subSeed.name,
          description: subSeed.description,
          order: subSeed.order,
          isActive: true,
        }).returning();
        subActionId = created.id;
        subActionsCreated++;
      }

      subActionIdByCode.set(subSeed.code, subActionId);
    }
  }

  return { subActionIdByCode, actionsCreated, subActionsCreated };
}

async function upsertRolesAndPermissions(subActionIdByCode: Map<string, number>) {
  let rolesCreated = 0;
  let rolePermsCreated = 0;

  for (const roleSeed of RBAC_ROLES) {
    const existingRole = await masterDb.query.baseRoles.findFirst({
      where: eq(baseRoles.code, roleSeed.code),
    });

    let roleId = existingRole?.id;
    if (!roleId) {
      const [created] = await masterDb.insert(baseRoles).values({
        code: roleSeed.code,
        name: roleSeed.name,
        description: roleSeed.description,
        isActive: true,
      }).returning();
      roleId = created.id;
      rolesCreated++;
    }

    for (const subActionCode of roleSeed.subActionCodes) {
      const subActionId = subActionIdByCode.get(subActionCode);
      if (!subActionId) continue;

      const existingLink = await masterDb.query.baseRolePermissions.findFirst({
        where: and(
          eq(baseRolePermissions.baseRoleId, roleId),
          eq(baseRolePermissions.subActionId, subActionId),
        ),
      });

      if (!existingLink) {
        await masterDb.insert(baseRolePermissions).values({
          baseRoleId: roleId,
          subActionId,
        });
        rolePermsCreated++;
      }
    }
  }

  return { rolesCreated, rolePermsCreated };
}

async function run() {
  console.log('\n🚀 [SCRIPT] Seed RBAC Master iniciado...\n');

  try {
    const { subActionIdByCode, actionsCreated, subActionsCreated } = await upsertActionsAndSubActions();
    const { rolesCreated, rolePermsCreated } = await upsertRolesAndPermissions(subActionIdByCode);

    console.log('✅ Seed RBAC completado');
    console.log(`   - Acciones creadas: ${actionsCreated}`);
    console.log(`   - Sub-acciones creadas: ${subActionsCreated}`);
    console.log(`   - Roles base creados: ${rolesCreated}`);
    console.log(`   - Permisos de rol creados: ${rolePermsCreated}`);
    console.log('\nℹ️ Script idempotente: puedes ejecutarlo varias veces sin duplicar datos.\n');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error al ejecutar seed RBAC master:', error?.message || error);
    process.exit(1);
  }
}

run();

