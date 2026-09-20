// Utilidades de manejo de errores.
//
// Objetivo: evitar filtrar detalles internos (consultas SQL, esquema de la BD,
// mensajes del driver de Postgres) al cliente. Los servicios lanzan Errors con
// mensajes en español pensados para el usuario final ("Ya existe un rol...",
// "Categoría no encontrada", etc.) y esos SÍ se deben mostrar. En cambio, los
// errores del driver (pg) o de Drizzle ("Failed query: insert into ...") deben
// ocultarse detrás de un mensaje genérico y registrarse solo en el servidor.

/**
 * Error semántico "la entidad está en uso": se lanza cuando un borrado se bloquea
 * porque hay referencias (ej. una mesa/método/canal usado en pedidos). El
 * controller lo traduce a HTTP 409 con `requiresConfirmation` para que el front
 * pida confirmación y reintente con `?force=true`.
 */
export class InUseError extends Error {
  constructor(message: string, public references: number) {
    super(message);
    this.name = 'InUseError';
  }
}

// SQLSTATE de Postgres: 5 caracteres alfanuméricos (ej. '23503', '23505', '42P01').
const PG_SQLSTATE = /^[0-9A-Z]{5}$/;

// Fragmentos que delatan un error interno de base de datos / driver.
const INTERNAL_ERROR_PATTERNS: RegExp[] = [
  /failed query/i,
  /duplicate key value/i,
  /violates (foreign key|not-null|unique|check) constraint/i,
  /syntax error at or near/i,
  /(column|relation|table) .* does not exist/i,
  /invalid input syntax/i,
  /could not connect|connection terminated|timeout expired/i,
];

/**
 * Determina si un error proviene de la capa de base de datos / driver y por lo
 * tanto NO debe exponerse tal cual al cliente.
 */
export function isInternalError(e: unknown): boolean {
  if (!e) return false;
  const anyE = e as any;

  // Los errores del driver de Postgres traen un SQLSTATE en `.code` y campos
  // como `.severity` / `.routine`. Drizzle re-lanza con esos campos intactos.
  if (typeof anyE.code === 'string' && PG_SQLSTATE.test(anyE.code)) return true;
  if (anyE.severity && anyE.routine) return true;

  const msg = typeof anyE.message === 'string' ? anyE.message : '';
  return INTERNAL_ERROR_PATTERNS.some((re) => re.test(msg));
}

/**
 * Devuelve un mensaje seguro para enviar al cliente:
 * - Si el error es interno (BD/driver), registra el detalle completo en el
 *   servidor y devuelve el `fallback` genérico.
 * - Si es un Error de aplicación con mensaje propio, devuelve ese mensaje.
 * - En cualquier otro caso, devuelve el `fallback`.
 */
export function safeMessage(e: unknown, fallback: string): string {
  if (isInternalError(e)) {
    console.error('[internal error]', e);
    return fallback;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
