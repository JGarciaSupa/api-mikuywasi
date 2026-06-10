import type { Context } from 'hono';
import type { AuditActor } from '../core/tenant/services/admin/warehouse/types';

export function getAuditActor(c: Context): AuditActor {
  const payload = c.get('jwtPayload');
  return {
    userId: payload?.userId,
    ip: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
  };
}

export function parseIdParam(c: Context, param = 'id'): number {
  const raw = c.req.param(param);
  if (raw === undefined || raw === '') {
    throw new Error(`Parámetro "${param}" requerido`);
  }
  const id = parseInt(raw, 10);
  if (isNaN(id)) throw new Error(`ID inválido: ${raw}`);
  return id;
}

/**
 * Convierte errores de Postgres (y errores de negocio) a mensajes amigables en español.
 * Nunca expone el mensaje crudo de la base de datos al cliente.
 */
export function parseDbError(error: unknown): { message: string; status: number } {
  // Errores de negocio propios (ya son mensajes amigables)
  if (error instanceof Error) {
    const msg = error.message;

    // Detectar error de Postgres por código (node-postgres / pg expone error.code)
    const pgCode = (error as any).code as string | undefined;

    if (pgCode) {
      switch (pgCode) {
        case '23505': {
          // Unique violation — intentar extraer el campo del constraint name
          const constraint = (error as any).constraint as string | undefined;
          const fieldHint = constraint
            ? inferFieldFromConstraint(constraint)
            : null;
          return {
            message: fieldHint
              ? `Ya existe un registro con ese ${fieldHint}`
              : 'Ya existe un registro con ese valor (código duplicado)',
            status: 409,
          };
        }
        case '23503':
          return {
            message: 'No se puede eliminar: el registro tiene datos relacionados',
            status: 409,
          };
        case '23502':
          return {
            message: 'Falta un campo requerido en la solicitud',
            status: 400,
          };
        case '22001':
          return {
            message: 'El valor ingresado es demasiado largo para el campo',
            status: 400,
          };
        case '22P02':
          return { message: 'Formato de dato inválido', status: 400 };
        default:
          // Otros errores de BD — no exponer el mensaje crudo
          return { message: 'Error interno del servidor', status: 500 };
      }
    }

    // Errores de negocio con mensajes ya localizados
    if (
      msg.includes('no encontrad') ||
      msg.includes('no existe') ||
      msg.includes('not found')
    ) {
      return { message: msg, status: 404 };
    }
    if (
      msg.includes('inválid') ||
      msg.includes('incorrect') ||
      msg.includes('GENERADO') ||
      msg.includes('draft') ||
      msg.includes('insuficiente') ||
      msg.includes('requerido') ||
      msg.includes('debe ser') ||
      msg.includes('no puede') ||
      msg.includes('ya fue') ||
      msg.includes('ya exist')
    ) {
      return { message: msg, status: 400 };
    }

    // Error genérico con mensaje de negocio
    return { message: msg, status: 500 };
  }

  return { message: 'Error interno del servidor', status: 500 };
}

function inferFieldFromConstraint(constraint: string): string | null {
  // Mapeo de nombres de constraint a descripciones amigables
  const map: Record<string, string> = {
    series_sequential: 'serie y número de secuencia',
    series_sequential_supplier: 'serie y número de secuencia',
    code: 'código',
    tax_id: 'RUC/DNI',
    taxid: 'RUC/DNI',
    email: 'correo electrónico',
    tracking_code: 'código de seguimiento',
    order_id: 'pedido',
  };
  const lower = constraint.toLowerCase();
  for (const [key, label] of Object.entries(map)) {
    if (lower.includes(key)) return label;
  }
  return null;
}

export function jsonError(c: Context, error: unknown, fallback: string) {
  const { message, status } = parseDbError(error);
  const finalMessage = message === 'Error interno del servidor' && !(error instanceof Error)
    ? fallback
    : message;
  return c.json({ success: false, message: finalMessage }, status as any);
}
