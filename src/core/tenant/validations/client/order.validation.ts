import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createOrderSchema = z.object({
  customerName: z.string({ error: 'Nombre es requerido' }).min(1, 'El nombre es obligatorio'),
  customerPhone: z.string({ error: 'Teléfono es requerido' }).min(1, 'El teléfono es obligatorio').optional().nullable(),
  customerAddress: z.string().optional().nullable(),

  deliveryType: z.enum(['delivery', 'pickup', 'dine_in'], { error: 'Tipo de entrega es requerido' }),
  deliveryInfo: z.object({
    lat: z.number().optional().nullable(),
    lng: z.number().optional().nullable(),
    reference: z.string().optional().nullable(),
  }).optional().nullable(),

  tableId: z.number().optional().nullable(),
  tableName: z.string().optional().nullable(),

  paymentMethod: z.string().optional().nullable(), // interno: se elige al cobrar; web: método previsto
  notes: z.string().max(255, 'La nota debe tener menos de 255 caracteres').optional().nullable(),

  subtotal: z.number({ error: 'Subtotal es requerido' }),
  deliveryFee: z.number().default(0),
  retentionPercentage: z.number().min(0).max(100).default(0),
  retentionAmount: z.number().min(0).default(0),
  total: z.number({ error: 'Total es requerido' }),

  items: z.array(z.object({
    productId: z.number().optional().nullable(),
    productName: z.string({ error: 'Nombre del producto es requerido' }),
    unitPrice: z.number({ error: 'Precio unitario es requerido' }),
    quantity: z.number({ error: 'Cantidad es requerida' }).min(1),
    selectedAlternatives: z.array(z.object({
      name: z.string(),
      extraPrice: z.number()
    })).default([]),
    extras: z.array(z.object({
      extraId: z.number(),
      qty: z.number().min(1).default(1),
    })).optional(),
    properties: z.array(z.object({
      propertyId: z.number(),
    })).optional(),
    packagingFee: z.number().default(0),
    notes: z.string().max(255, 'La nota debe tener menos de 255 caracteres').optional().nullable(),
    totalPrice: z.number({ error: 'Total por item es requerido' }),
  })).min(1, 'Debe haber al menos un producto en la orden'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const validateCreateOrder = zValidator('json', createOrderSchema);
export const validateCreateOrderFromToken = zValidator('json', createOrderSchema);
