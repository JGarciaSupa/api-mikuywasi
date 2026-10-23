import type { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

// Tope de mesas por sucursal (createTable): un archivo nunca necesita más filas.
export const MAX_TABLE_IMPORT_ROWS = 50;

/**
 * Una fila del archivo: salón, mesa y pax (capacidad). Se valida en el service con
 * safeParse para reportar la fila como fallida sin rechazar el lote.
 */
export const tableImportRowSchema = z.object({
  row: z.coerce.number().int().positive(),
  salon: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim() : val),
    z.string({ error: 'El salón es requerido' }).min(1, 'El salón es requerido').max(100, 'El salón no puede exceder los 100 caracteres')
  ),
  table: z.preprocess(
    (val) => (typeof val === 'number' ? String(val) : typeof val === 'string' ? val.trim() : val),
    z.string({ error: 'La mesa es requerida' }).min(1, 'La mesa es requerida').max(50, 'La mesa no puede exceder los 50 caracteres')
  ),
  pax: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce.number({ error: 'Pax inválido' }).int('Pax debe ser un número entero').min(1, 'Pax mínimo 1').max(99, 'Pax máximo 99').optional()
  ),
  shape: z.preprocess(
    (val) => {
      if (typeof val !== 'string' || !val.trim()) return undefined;
      const v = val.trim().toLowerCase();
      if (['redonda', 'round', 'circular'].includes(v)) return 'round';
      if (['cuadrada', 'square', 'rectangular'].includes(v)) return 'square';
      return v;
    },
    z.enum(['square', 'round'], { error: 'Forma inválida (use cuadrada o redonda)' }).optional()
  ),
});

export type TableImportRow = z.infer<typeof tableImportRowSchema>;

export const tableImportSchema = z.object({
  branchId: z.coerce.number({ error: 'La sucursal es requerida' }).int().positive('La sucursal es requerida'),
  items: z.array(z.record(z.string(), z.unknown()))
    .min(1, 'El archivo no contiene filas para importar')
    .max(MAX_TABLE_IMPORT_ROWS, `Solo se permiten ${MAX_TABLE_IMPORT_ROWS} mesas por sucursal`),
});

export type TableImportInput = z.infer<typeof tableImportSchema>;

// Mismo contrato de error que la importación de productos: { success: false, message }.
const importValidationHook = (
  result: { success: true } | { success: false; error: { issues: { message: string }[] } },
  c: Context,
): Response | void => {
  if (!result.success) {
    return c.json({ success: false, message: result.error.issues[0]?.message ?? 'Datos de importación inválidos' }, 400);
  }
};

export const validateImportTables = zValidator('json', tableImportSchema, importValidationHook);
