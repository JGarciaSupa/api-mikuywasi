import type { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const MAX_IMPORT_ROWS = 1000;

const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

// Celdas vacías del archivo llegan como '' o null: se normalizan a undefined.
const emptyToUndefined = (val: unknown) =>
  val === '' || val === null || val === undefined ? undefined : val;

const optionalText = (max: number, label: string) =>
  z.preprocess(
    (val) => {
      const v = emptyToUndefined(val);
      return typeof v === 'string' ? v.trim() || undefined : v;
    },
    z.string().max(max, `${label} no puede exceder los ${max} caracteres`).optional()
  );

const optionalMoney = (label: string) =>
  z.preprocess(
    (val) => emptyToUndefined(typeof val === 'number' ? String(val) : val),
    z.string().regex(MONEY_REGEX, `${label} inválido (use números con hasta 2 decimales)`).optional()
  );

const optionalBoolean = z.preprocess(
  (val) => {
    const v = emptyToUndefined(val);
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (['si', 'sí', 'true', '1', 'x', 'yes'].includes(s)) return true;
      if (['no', 'false', '0', 'n'].includes(s)) return false;
    }
    return v;
  },
  z.boolean({ error: 'Use SI o NO' }).optional()
);

/**
 * Esquema estricto de UNA fila. Se aplica en el service con safeParse para que una fila
 * inválida se reporte como fallida sin rechazar el lote completo.
 * Los límites replican productSchema (products.validation.ts) y el modal del admin.
 */
export const productImportRowSchema = z.object({
  row: z.coerce.number().int().positive(),
  name: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim() : val),
    z.string({ error: 'El nombre es requerido' })
      .min(1, 'El nombre es requerido')
      .max(150, 'El nombre no puede exceder los 150 caracteres')
  ),
  shortName: optionalText(35, 'El nombre corto'),
  description: optionalText(2000, 'La descripción'),
  price: z.preprocess(
    (val) => (typeof val === 'number' ? String(val) : typeof val === 'string' ? val.trim() : val),
    z.string({ error: 'El precio es requerido' })
      .min(1, 'El precio es requerido')
      .regex(MONEY_REGEX, 'Precio inválido (use números con hasta 2 decimales)')
  ),
  discountPrice: optionalMoney('Precio con descuento'),
  packagingFee: optionalMoney('Tarifa de empaque'),
  categoryName: optionalText(50, 'La categoría'),
  subcategoryName: optionalText(50, 'La subcategoría'),
  // Área de producción (estación de cocina) por nombre o código; varias separadas por coma o "|".
  areaName: optionalText(200, 'El área'),
  stock: z.preprocess(
    emptyToUndefined,
    z.coerce.number({ error: 'Stock inválido' })
      .int('El stock debe ser un número entero')
      .min(0, 'El stock no puede ser negativo')
      .optional()
  ),
  allowSellWithoutStock: optionalBoolean,
  isActive: optionalBoolean,
  order: z.preprocess(
    emptyToUndefined,
    z.coerce.number({ error: 'Orden inválido' }).int('El orden debe ser un número entero').min(0).optional()
  ),
});

export type ProductImportRow = z.infer<typeof productImportRowSchema>;

// Contenedor del lote: las filas se validan individualmente en el service.
export const productImportSchema = z.object({
  branchId: z.coerce.number({ error: 'La sucursal es requerida' }).int().positive('La sucursal es requerida'),
  createMissingCategories: z.boolean().optional().default(false),
  createMissingAreas: z.boolean().optional().default(false),
  defaultCategoryId: z.coerce.number().int().positive().optional().nullable(),
  activate: z.boolean().optional().default(true),
  items: z.array(z.record(z.string(), z.unknown()))
    .min(1, 'El archivo no contiene filas para importar')
    .max(MAX_IMPORT_ROWS, `Solo se permiten ${MAX_IMPORT_ROWS} filas por importación`),
});

export type ProductImportInput = z.infer<typeof productImportSchema>;

// Hook propio de este módulo: responde con el contrato estándar { success: false, message }.
// (El validationHook compartido usa `status` y lo consumen otros módulos; no se modifica.)
const importValidationHook = (
  result: { success: true } | { success: false; error: { issues: { message: string }[] } },
  c: Context,
): Response | void => {
  if (!result.success) {
    return c.json({ success: false, message: result.error.issues[0]?.message ?? 'Datos de importación inválidos' }, 400);
  }
};

export const validateProductImport = zValidator('json', productImportSchema, importValidationHook);
