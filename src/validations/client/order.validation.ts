import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const createOrderSchema = z.object({
  tenantId: z.number({ error: 'Tenant ID es requerido' }),
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
  
  paymentMethod: z.string({ error: 'Método de pago es requerido' }),
  notes: z.string().max(255, 'La nota debe tener menos de 255 caracteres').optional().nullable(),
  
  subtotal: z.number({ error: 'Subtotal es requerido' }),
  deliveryFee: z.number().default(0),
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
    packagingFee: z.number().default(0),
    notes: z.string().max(255, 'La nota debe tener menos de 255 caracteres').optional().nullable(),
    totalPrice: z.number({ error: 'Total por item es requerido' }),
  })).min(1, 'Debe haber al menos un producto en la orden'),
});

export const validateCreateOrder = zValidator('json', createOrderSchema);
export const validateCreateOrderFromToken = zValidator('json', createOrderSchema.omit({ tenantId: true }));
