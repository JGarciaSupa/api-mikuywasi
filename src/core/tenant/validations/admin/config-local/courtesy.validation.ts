import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const courtesySchema = z.object({
  reasonId: z.number().int().positive('Selecciona un motivo de cortesía'),
  // Contraseña de un supervisor (seguridad.autorizar_cortesia); no la necesita quien puede dar cortesías sin ella
  password: z.string().max(255).optional(),
  // Código de 6 dígitos aprobado por WhatsApp (alternativa a la contraseña)
  authCode: z.string().max(10).optional(),
});

export type CourtesyBody = z.infer<typeof courtesySchema>;

export const validateCourtesy = zValidator('json', courtesySchema, (result, c) => {
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Datos inválidos';
    return c.json({ success: false, message }, 400);
  }
});
