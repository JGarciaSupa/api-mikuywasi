import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const REASON_TYPES = ['courtesy', 'order_cancel', 'document_void', 'discount'] as const;
export const DISCOUNT_MODES = ['percentage', 'amount', 'manual'] as const;

const baseFields = {
  description: z.string()
    .min(1, 'La descripción es requerida')
    .max(50, 'La descripción no puede exceder los 50 caracteres'),
  longDescription: z.string()
    .max(150, 'La descripción larga no puede exceder los 150 caracteres')
    .optional()
    .nullable(),
  maxAmount: z.number().nonnegative('El tope no puede ser negativo').optional().nullable(),
  isFreeTransfer: z.boolean().optional(),
  discountMode: z.enum(DISCOUNT_MODES).optional().nullable(),
  discountValue: z.number().nonnegative('El valor no puede ser negativo').optional().nullable(),
  isActive: z.boolean().default(true),
};

// Reglas por tipo: cada campo específico solo se acepta en su tipo.
function applyTypeRules(
  data: {
    type?: (typeof REASON_TYPES)[number];
    maxAmount?: number | null;
    isFreeTransfer?: boolean;
    discountMode?: (typeof DISCOUNT_MODES)[number] | null;
    discountValue?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  const { type } = data;
  if (!type) return;

  if (type === 'discount' && !data.discountMode) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountMode'],
      message: 'El tipo de descuento (porcentaje, monto o manual) es requerido',
    });
  }

  if (type !== 'discount' && data.discountMode) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountMode'],
      message: 'El tipo de descuento solo aplica a motivos de descuento',
    });
  }

  // Clave-valor del descuento: porcentaje/monto llevan valor fijo configurado;
  // en 'manual' el valor lo define el usuario en cada pedido, no se guarda acá.
  if (type === 'discount' && (data.discountMode === 'percentage' || data.discountMode === 'amount')) {
    if (data.discountValue == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: data.discountMode === 'percentage'
          ? 'El porcentaje de descuento es requerido'
          : 'El monto de descuento es requerido',
      });
    } else if (data.discountMode === 'percentage' && data.discountValue > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'El porcentaje no puede ser mayor a 100',
      });
    }
  }

  if (data.discountValue != null && (type !== 'discount' || data.discountMode === 'manual')) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountValue'],
      message: data.discountMode === 'manual'
        ? 'En modo manual el valor se define en cada pedido, no se configura acá'
        : 'El valor de descuento solo aplica a motivos de descuento',
    });
  }

  if (type !== 'courtesy' && type !== 'discount' && data.maxAmount != null) {
    ctx.addIssue({
      code: 'custom',
      path: ['maxAmount'],
      message: 'El tope solo aplica a cortesías y descuentos',
    });
  }

  if (type !== 'courtesy' && data.isFreeTransfer) {
    ctx.addIssue({
      code: 'custom',
      path: ['isFreeTransfer'],
      message: 'La transferencia gratuita solo aplica a cortesías',
    });
  }
}

export const createReasonSchema = z.object({
  branchId: z.number({ error: 'La sucursal es requerida' }).int().positive('La sucursal es requerida'),
  type: z.enum(REASON_TYPES, { error: 'El tipo de motivo es requerido' }),
  ...baseFields,
}).superRefine(applyTypeRules);

// En update el tipo no cambia; se envía para poder validar los campos específicos.
export const updateReasonSchema = z.object({
  type: z.enum(REASON_TYPES).optional(),
  description: baseFields.description.optional(),
  longDescription: baseFields.longDescription,
  maxAmount: baseFields.maxAmount,
  isFreeTransfer: baseFields.isFreeTransfer,
  discountMode: baseFields.discountMode,
  discountValue: baseFields.discountValue,
  isActive: z.boolean().optional(),
}).superRefine(applyTypeRules);

export type CreateReasonInput = z.infer<typeof createReasonSchema>;
export type UpdateReasonInput = z.infer<typeof updateReasonSchema>;

export const validateCreateReason = zValidator('json', createReasonSchema);
export const validateUpdateReason = zValidator('json', updateReasonSchema);
