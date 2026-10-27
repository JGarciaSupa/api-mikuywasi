// Permisos reservados al implementador (rol_admin). El cliente los ve en el catálogo, pero
// no puede asignarlos a roles propios ni como permisos sueltos, y el rol base
// "Administrador del local" (rol_admin_local) los excluye. Los usan el seed RBAC y
// services/admin/users/rbac.service.ts.

export const IMPLEMENTER_ROLE_CODE = 'rol_admin';

export const RESERVED_PERMISSION_CODES: readonly string[] = [
  'menu.importar_productos',
  'menu.gestionar_estaciones',
  'administracion.impresoras',
  'administracion.auditoria',
  'administracion.parametros',
  'administracion.ver_sucursales',
  'administracion.gestionar_sucursales',
  'administracion.canales_venta',
  'administracion.ajustes_sistema',
  'facturacion.gestionar_series',
  'facturacion.gestionar_certificado',
];

export function isReservedPermission(code: string): boolean {
  return RESERVED_PERMISSION_CODES.includes(code);
}
