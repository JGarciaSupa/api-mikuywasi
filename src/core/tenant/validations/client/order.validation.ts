import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { classificationCodes } from '../admin/config-local/sales-channel.validation';

export const createOrderSchema = z.object({
  customerId: z.number().int().positive().optional().nullable(),
  customerName: z.string({ error: 'Nombre es requerido' }).min(1, 'El nombre es obligatorio'),
  customerPhone: z.string({ error: 'Teléfono es requerido' }).min(1, 'El teléfono es obligatorio').optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  branchId: z.number().int().positive().optional().nullable(),
  salesChannelId: z.number().int().positive().optional().nullable(),

  deliveryType: z.enum(classificationCodes, { error: 'Tipo de entrega es requerido y debe ser válido' }),
  deliveryInfo: z.object({
    lat: z.number().optional().nullable(),
    lng: z.number().optional().nullable(),
    reference: z.string().optional().nullable(),
  }).optional().nullable(),

  tableId: z.number().optional().nullable(),
  tableName: z.string().optional().nullable(),
  // Mozo asignado al pedido (aplica cuando el canal de venta activa/exige mozo).
  waiterId: z.number().int().positive().optional().nullable(),

  paymentMethod: z.string().optional().nullable(), // interno: se elige al cobrar; web: método previsto
  notes: z.string().max(255, 'La nota debe tener menos de 255 caracteres').optional().nullable(),

  deliveryFee: z.number().min(0).optional().default(0),
  retentionPercentage: z.number().min(0).max(100).optional().default(0),
  retentionAmount: z.number().min(0).optional().default(0),

  items: z.array(z.object({
    productId: z.number().optional().nullable(),
    quantity: z.number({ error: 'Cantidad es requerida' }).min(1),
    selectedAlternatives: z.array(z.object({
      name: z.string(),
      extraPrice: z.number()
    })).default([]),
    extras: z.array(z.object({
      extraId: z.number(),
      qty: z.number().min(1).default(1),
    })).optional(),
    notes: z.string().max(255, 'La nota debe tener menos de 255 caracteres').optional().nullable(),
  })).min(1, 'Debe haber al menos un producto en la orden'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const validateCreateOrder = zValidator('json', createOrderSchema);
export const validateCreateOrderFromToken = zValidator('json', createOrderSchema);
