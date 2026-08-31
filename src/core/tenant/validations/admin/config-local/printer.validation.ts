import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validationHook } from '../../hook';

export const createPrinterSchema = z.object({
  branchId: z.coerce.number().int().positive('La sucursal es requerida'),
  name: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  connectionType: z.enum(['network', 'usb', 'bluetooth_serial']),
  target: z.string().min(1, 'El destino / IP / puerto es requerido').max(255),
  paperColumns: z.coerce.number().int().min(20).max(80).default(48),
  enableBeep: z.boolean().optional().default(false),
  cutPaper: z.boolean().optional().default(true),
  openDrawer: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

export const updatePrinterSchema = createPrinterSchema.partial();

export const validateCreatePrinter = zValidator('json', createPrinterSchema, validationHook);
export const validateUpdatePrinter = zValidator('json', updatePrinterSchema, validationHook);
