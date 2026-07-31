import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { masterDb } from '../db';
import {
  actions,
  subActions,
  baseRoles,
  baseRolePermissions,
  tenantFeatureGrants,
  tenantRoleGrants,
  tenants,
} from '../db/master/schema';
import * as tenantSchema from '../db/tenant/schema';
import { fullSyncTenant } from '../core/master/services/rbac-sync.service';

// ─────────────────────────────────────────────────────────────
// DATOS RBAC — definición completa del sistema Mikuywasi
// ─────────────────────────────────────────────────────────────

type SeedAction = {
  code: string;
  name: string;
  description: string;
  icon: string;
  order: number;
  subActions: Array<{ code: string; name: string; description: string; order: number }>;
};

type SeedRole = {
  code: string;
  name: string;
  description: string;
  subActionCodes: string[];
};

const RBAC_ACTIONS: SeedAction[] = [
  {
    code: 'pedidos',
    name: 'Pedidos',
    description: 'Gestión de órdenes del restaurante.',
    icon: 'ReceiptText',
    order: 1,
    subActions: [
      { code: 'pedidos.ver_lista', name: 'Ver listado de pedidos', description: 'Acceder al listado de pedidos.', order: 1 },
      { code: 'pedidos.ver_detalle', name: 'Ver detalle de pedido', description: 'Ver el detalle de un pedido específico.', order: 2 },
      { code: 'pedidos.cambiar_estado', name: 'Cambiar estado', description: 'Actualizar el estado de un pedido.', order: 3 },
      { code: 'pedidos.cambiar_estado_pago', name: 'Cambiar estado de pago', description: 'Actualizar el estado de pago del pedido.', order: 4 },
      { code: 'pedidos.crear', name: 'Crear pedidos', description: 'Crear un nuevo pedido.', order: 5 },
      { code: 'pedidos.transferir', name: 'Transferir pedidos', description: 'Transferir un pedido generado a la caja para cobrarlo (bloquea la edición) y regresarlo.', order: 6 },
    ],
  },
  {
    code: 'cocina',
    name: 'Cocina',
    description: 'Display y estado de órdenes en cocina.',
    icon: 'ChefHat',
    order: 2,
    subActions: [
      { code: 'cocina.ver_ordenes', name: 'Ver órdenes de cocina', description: 'Ver el panel de cocina con órdenes activas.', order: 1 },
      { code: 'cocina.actualizar_estado', name: 'Actualizar estado de orden', description: 'Marcar una orden como en preparación o lista.', order: 2 },
    ],
  },
  {
    code: 'menu',
    name: 'Menú',
    description: 'Gestión de productos, categorías, mesas y extras.',
    icon: 'UtensilsCrossed',
    order: 3,
    subActions: [
      { code: 'menu.ver_productos', name: 'Ver productos', description: 'Listar el catálogo de productos.', order: 1 },
      { code: 'menu.gestionar_productos', name: 'Gestionar productos', description: 'Crear, editar y eliminar productos.', order: 2 },
      { code: 'menu.ver_categorias', name: 'Ver categorías', description: 'Listar categorías del menú.', order: 3 },
      { code: 'menu.gestionar_categorias', name: 'Gestionar categorías', description: 'Crear, editar y eliminar categorías.', order: 4 },
      { code: 'menu.ver_mesas', name: 'Ver mesas', description: 'Ver las mesas del restaurante.', order: 5 },
      { code: 'menu.gestionar_mesas', name: 'Gestionar mesas', description: 'Crear, editar y eliminar mesas.', order: 6 },
      { code: 'menu.gestionar_extras', name: 'Gestionar extras', description: 'Administrar grupos de extras y modificadores.', order: 7 },
      { code: 'menu.gestionar_estaciones', name: 'Gestionar estaciones de cocina', description: 'Administrar el catálogo de estaciones de cocina y su ruteo por producto.', order: 8 },
    ],
  },
  {
    code: 'caja',
    name: 'Caja',
    description: 'Sesiones de caja y movimientos de efectivo.',
    icon: 'Landmark',
    order: 4,
    subActions: [
      { code: 'caja.ver_sesiones', name: 'Ver sesiones de caja', description: 'Listar sesiones y su historial.', order: 1 },
      { code: 'caja.abrir_sesion', name: 'Abrir sesión de caja', description: 'Iniciar una nueva sesión de caja.', order: 2 },
      { code: 'caja.cerrar_sesion', name: 'Cerrar sesión de caja', description: 'Cerrar y cuadrar la sesión activa.', order: 3 },
      { code: 'caja.registrar_movimiento', name: 'Registrar movimiento', description: 'Registrar entrada o salida de dinero.', order: 4 },
      { code: 'caja.gestionar_cajas', name: 'Gestionar cajas', description: 'Crear y editar cajas registradoras.', order: 5 },
      { code: 'caja.ver_contabilidad', name: 'Ver datos contables', description: 'Ver totales, saldos, movimientos y arqueo de caja.', order: 6 },
      { code: 'caja.configurar_tipo_cambio', name: 'Configurar tipo de cambio', description: 'Administrar el tipo de cambio de las divisas.', order: 7 },
      { code: 'caja.ver_todos_turnos', name: 'Ver todos los turnos', description: 'Ver los turnos generados', order: 8 },
    ],
  },
  {
    code: 'facturacion',
    name: 'Facturación',
    description: 'Emisión y gestión de comprobantes electrónicos.',
    icon: 'FileText',
    order: 5,
    subActions: [
      { code: 'facturacion.ver_documentos', name: 'Ver documentos', description: 'Listar facturas y boletas emitidas.', order: 1 },
      { code: 'facturacion.emitir', name: 'Emitir comprobante', description: 'Generar una factura o boleta electrónica.', order: 2 },
      { code: 'facturacion.anular', name: 'Anular comprobante', description: 'Anular un documento emitido.', order: 3 },
      { code: 'facturacion.ver_pdf', name: 'Ver / descargar PDF', description: 'Descargar o visualizar el PDF del comprobante.', order: 4 },
      { code: 'facturacion.gestionar_series', name: 'Gestionar series', description: 'Administrar series de numeración.', order: 5 },
      { code: 'facturacion.gestionar_certificado', name: 'Gestionar certificado', description: 'Subir y gestionar el certificado digital.', order: 6 },
    ],
  },
  {
    code: 'almacen',
    name: 'Almacén',
    description: 'Inventario, compras, traslados, recetas y reportes.',
    icon: 'Warehouse',
    order: 6,
    subActions: [
      { code: 'almacen.ver_insumos', name: 'Ver insumos', description: 'Ver el catálogo de insumos y su stock.', order: 1 },
      { code: 'almacen.gestionar_insumos', name: 'Gestionar insumos', description: 'Crear y editar insumos.', order: 2 },
      { code: 'almacen.gestionar_categorias', name: 'Gestionar categorías', description: 'Administrar categorías y subcategorías de almacén.', order: 3 },
      { code: 'almacen.gestionar_unidades', name: 'Gestionar unidades', description: 'Administrar unidades de medida.', order: 4 },
      { code: 'almacen.ver_proveedores', name: 'Ver proveedores', description: 'Listar proveedores.', order: 5 },
      { code: 'almacen.gestionar_proveedores', name: 'Gestionar proveedores', description: 'Crear y editar proveedores.', order: 6 },
      { code: 'almacen.compras', name: 'Compras', description: 'Crear, procesar y anular documentos de compra.', order: 7 },
      { code: 'almacen.requerimientos', name: 'Requerimientos', description: 'Gestionar requerimientos internos.', order: 8 },
      { code: 'almacen.traslados', name: 'Traslados', description: 'Traslados de stock entre áreas o sucursales.', order: 9 },
      { code: 'almacen.salidas', name: 'Salidas de stock', description: 'Registrar salidas manuales de stock.', order: 10 },
      { code: 'almacen.porcionamientos', name: 'Porcionamientos', description: 'Gestionar porcionamientos de insumos.', order: 11 },
      { code: 'almacen.ajustes_inventario', name: 'Ajustes de inventario', description: 'Abrir, editar y cerrar ajustes de inventario.', order: 12 },
      { code: 'almacen.recetas', name: 'Recetas', description: 'Ver y editar recetas vinculadas a productos.', order: 13 },
      { code: 'almacen.kardex', name: 'Kardex', description: 'Ver kardex y movimientos por insumo.', order: 14 },
      { code: 'almacen.descargas_venta', name: 'Descargas por venta', description: 'Ver y procesar descargas automáticas por venta.', order: 15 },
      { code: 'almacen.configuracion', name: 'Configuración de almacén', description: 'Administrar configuración interna del almacén.', order: 16 },
    ],
  },
  {
    code: 'administracion',
    name: 'Administración',
    description: 'Sucursales, personal, configuración y permisos.',
    icon: 'Settings',
    order: 7,
    subActions: [
      { code: 'administracion.ver_sucursales', name: 'Ver sucursales', description: 'Listar sucursales del negocio.', order: 1 },
      { code: 'administracion.gestionar_sucursales', name: 'Gestionar sucursales', description: 'Crear y editar sucursales.', order: 2 },
      { code: 'administracion.ver_personal', name: 'Ver personal', description: 'Listar el personal (staff).', order: 3 },
      { code: 'administracion.gestionar_personal', name: 'Gestionar personal', description: 'Crear, editar y eliminar personal.', order: 4 },
      { code: 'administracion.configuracion', name: 'Configuración general', description: 'Configuración general del negocio.', order: 5 },
      { code: 'administracion.metodos_pago', name: 'Métodos de pago', description: 'Administrar métodos de pago aceptados.', order: 6 },
      { code: 'administracion.banners', name: 'Banners', description: 'Gestionar banners publicitarios.', order: 7 },
      { code: 'administracion.redes_sociales', name: 'Redes sociales', description: 'Administrar redes sociales del negocio.', order: 8 },
      { code: 'administracion.rbac', name: 'Roles y permisos', description: 'Gestionar roles y permisos de usuarios.', order: 9 },
      { code: 'administracion.canales_venta', name: 'Canales de venta', description: 'Administrar el catálogo de canales de venta (Salón, Delivery Propio, Rappi, etc).', order: 10 },
      { code: 'administracion.ver_todos_los_pedidos', name: 'Ver todos los pedidos', description: 'Ver todos los pedidos de la sucursal, no solo los generados/cobrados por el usuario.', order: 11 },
    ],
  },
  {
    code: 'mozo',
    name: 'Mozo',
    description: 'Operaciones del mesero desde la vista operativa.',
    icon: 'ClipboardList',
    order: 8,
    subActions: [
      { code: 'mozo.ver_menu', name: 'Ver menú operativo', description: 'Acceder al menú desde la vista de mozo.', order: 1 },
      { code: 'mozo.ver_mesas', name: 'Ver estado de mesas', description: 'Ver el mapa de mesas y su ocupación.', order: 2 },
      { code: 'mozo.crear_pedido', name: 'Crear pedido', description: 'Tomar un pedido desde la mesa.', order: 3 },
      { code: 'mozo.gestionar_pedido', name: 'Gestionar pedido', description: 'Editar ítems, estado y pago de un pedido activo.', order: 4 },
      { code: 'mozo.cancelar_pedido', name: 'Cancelar pedido', description: 'Cancelar un pedido activo.', order: 5 },
    ],
  },
];

const RBAC_ROLES: SeedRole[] = [
  {
    code: 'rol_admin',
    name: 'Administrador',
    description: 'Acceso completo a todos los módulos del tenant.',
    subActionCodes: RBAC_ACTIONS.flatMap((a) => a.subActions.map((s) => s.code)),
  },
  {
    code: 'rol_cajero',
    name: 'Cajero',
    description: 'Atiende la caja, ve pedidos y emite comprobantes.',
    subActionCodes: [
      'pedidos.ver_lista',
      'pedidos.ver_detalle',
      'pedidos.cambiar_estado_pago',
      'pedidos.transferir',
      'caja.ver_sesiones',
      'caja.abrir_sesion',
      'caja.cerrar_sesion',
      'caja.registrar_movimiento',
      'caja.ver_contabilidad',
      'facturacion.ver_documentos',
      'facturacion.emitir',
      'facturacion.ver_pdf',
    ],
  },
  {
    code: 'rol_cocinero',
    name: 'Cocinero',
    description: 'Solo ve y actualiza el estado de las órdenes en cocina.',
    subActionCodes: [
      'cocina.ver_ordenes',
      'cocina.actualizar_estado',
    ],
  },
  {
    code: 'rol_mozo',
    name: 'Mozo',
    description: 'Opera desde la vista de mesero: toma pedidos y gestiona mesas.',
    subActionCodes: [
      'mozo.ver_menu',
      'mozo.ver_mesas',
      'mozo.crear_pedido',
      'mozo.gestionar_pedido',
      'mozo.cancelar_pedido',
      'pedidos.ver_lista',
      'pedidos.ver_detalle',
      // Caja: el mozo puede abrir/cerrar su propio turno (obligatorio para crear pedidos).
      // Sin caja.ver_contabilidad: no ve saldos, totales ni movimientos.
      'caja.ver_sesiones',
      'caja.abrir_sesion',
      'caja.cerrar_sesion',
    ],
  },
  {
    code: 'rol_almacenero',
    name: 'Almacenero',
    description: 'Gestiona insumos, compras, movimientos y kardex.',
    subActionCodes: [
      'almacen.ver_insumos',
      'almacen.gestionar_insumos',
      'almacen.ver_proveedores',
      'almacen.gestionar_proveedores',
      'almacen.compras',
      'almacen.requerimientos',
      'almacen.traslados',
      'almacen.salidas',
      'almacen.porcionamientos',
      'almacen.ajustes_inventario',
      'almacen.kardex',
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// FASE 1: Limpiar tablas RBAC de cada tenant
// ─────────────────────────────────────────────────────────────

async function cleanTenantRbac(tenant: { dbName: string; server: { dbHost: string; dbPort: number; dbUser: string; dbPassword: string } }) {
  const host = process.env.DB_HOST_OVERRIDE || tenant.server.dbHost;
  const connStr = `postgres://${encodeURIComponent(tenant.server.dbUser)}:${encodeURIComponent(tenant.server.dbPassword)}@${host}:${tenant.server.dbPort}/${tenant.dbName}`;
  const pool = new Pool({ connectionString: connStr, max: 1 });
  const db = drizzle(pool, { schema: tenantSchema });

  try {
    // Orden respeta FKs: overrides y userRoles antes de roles y catalog
    await db.delete(tenantSchema.userPermissionOverrides);
    await db.delete(tenantSchema.userRoles);
    await db.delete(tenantSchema.rolePermissions);
    await db.delete(tenantSchema.roles);
    await db.delete(tenantSchema.permissionsCatalog);
    console.log(`   ✓ ${tenant.dbName} — tablas RBAC limpias`);
  } finally {
    await pool.end();
  }
}

// ─────────────────────────────────────────────────────────────
// FASE 2: Limpiar tablas RBAC del master
// ─────────────────────────────────────────────────────────────

async function cleanMasterRbac() {
  // Orden respeta FKs
  await masterDb.delete(tenantFeatureGrants);
  await masterDb.delete(tenantRoleGrants);
  await masterDb.delete(baseRolePermissions);
  await masterDb.delete(baseRoles);
  await masterDb.delete(subActions);
  await masterDb.delete(actions);
  console.log('   ✓ Tablas RBAC del master limpias');
}

// ─────────────────────────────────────────────────────────────
// FASE 3: Insertar nuevos datos RBAC en master
// ─────────────────────────────────────────────────────────────

async function seedRbacData(): Promise<{ subActionIdByCode: Map<string, number>; roleIdByCode: Map<string, number> }> {
  const subActionIdByCode = new Map<string, number>();
  const roleIdByCode = new Map<string, number>();

  // Actions + sub-actions
  for (const actionSeed of RBAC_ACTIONS) {
    const [createdAction] = await masterDb
      .insert(actions)
      .values({
        code: actionSeed.code,
        name: actionSeed.name,
        description: actionSeed.description,
        icon: actionSeed.icon,
        order: actionSeed.order,
        isActive: true,
      })
      .returning();

    for (const subSeed of actionSeed.subActions) {
      const [createdSub] = await masterDb
        .insert(subActions)
        .values({
          actionId: createdAction.id,
          code: subSeed.code,
          name: subSeed.name,
          description: subSeed.description,
          order: subSeed.order,
          isActive: true,
        })
        .returning();

      subActionIdByCode.set(subSeed.code, createdSub.id);
    }
  }

  console.log(`   ✓ ${RBAC_ACTIONS.length} acciones y ${subActionIdByCode.size} sub-acciones creadas`);

  // Base roles + permisos
  for (const roleSeed of RBAC_ROLES) {
    const [createdRole] = await masterDb
      .insert(baseRoles)
      .values({
        code: roleSeed.code,
        name: roleSeed.name,
        description: roleSeed.description,
        isActive: true,
      })
      .returning();

    roleIdByCode.set(roleSeed.code, createdRole.id);

    const permRows = roleSeed.subActionCodes
      .map((code) => subActionIdByCode.get(code))
      .filter((id): id is number => id !== undefined)
      .map((subActionId) => ({ baseRoleId: createdRole.id, subActionId }));

    if (permRows.length > 0) {
      await masterDb.insert(baseRolePermissions).values(permRows);
    }
  }

  console.log(`   ✓ ${RBAC_ROLES.length} roles base creados`);

  return { subActionIdByCode, roleIdByCode };
}

// ─────────────────────────────────────────────────────────────
// FASE 4: Otorgar todo a los tenants existentes + sync
// ─────────────────────────────────────────────────────────────

async function grantAndSyncAllTenants() {
  const allTenants = await masterDb.select({ id: tenants.id, name: tenants.name }).from(tenants);

  if (allTenants.length === 0) {
    console.log('   ℹ️  No hay tenants registrados — grants omitidos');
    return;
  }

  const allSubActions = await masterDb.select({ id: subActions.id }).from(subActions);
  const allBaseRoles = await masterDb.select({ id: baseRoles.id }).from(baseRoles);

  for (const tenant of allTenants) {
    // Feature grants (todas las sub-acciones)
    if (allSubActions.length > 0) {
      await masterDb
        .insert(tenantFeatureGrants)
        .values(allSubActions.map((sa) => ({ tenantId: tenant.id, subActionId: sa.id })))
        .onConflictDoNothing();
    }

    // Role grants (todos los roles base)
    if (allBaseRoles.length > 0) {
      await masterDb
        .insert(tenantRoleGrants)
        .values(allBaseRoles.map((br) => ({ tenantId: tenant.id, baseRoleId: br.id })))
        .onConflictDoNothing();
    }

    // Sync hacia la BD del tenant
    await fullSyncTenant(tenant.id);
    console.log(`   ✓ Tenant "${tenant.name}" — grants y sync completados`);
  }
}

// ─────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🚀 [RBAC SEED] Iniciando migración completa de RBAC...\n');

  try {
    // FASE 1
    console.log('📦 Fase 1 — Limpiando tablas RBAC de tenants...');
    const allTenants = await masterDb.query.tenants.findMany({ with: { server: true } });
    for (const tenant of allTenants) {
      await cleanTenantRbac(tenant as any);
    }
    console.log(`   Total tenants limpiados: ${allTenants.length}\n`);

    // FASE 2
    console.log('🗑️  Fase 2 — Limpiando tablas RBAC del master...');
    await cleanMasterRbac();
    console.log();

    // FASE 3
    console.log('✍️  Fase 3 — Insertando nuevos datos RBAC...');
    await seedRbacData();
    console.log();

    // FASE 4
    console.log('🔗 Fase 4 — Otorgando grants y sincronizando tenants...');
    await grantAndSyncAllTenants();
    console.log();

    console.log('✅ [RBAC SEED] Migración completada con éxito.');
    console.log('   Los tenants nuevos recibirán todos los grants automáticamente al crearse.\n');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ [RBAC SEED] Error:', error?.message || error);
    process.exit(1);
  }
}

run();
