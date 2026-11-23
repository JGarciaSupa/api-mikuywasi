import { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import { getAuditActor } from '@/utils/helpers';
import { MailError } from '@/utils/mailer';
import * as mailSettingsService from '../../../services/admin/config-local/mail-settings.service';

export async function getMailSettingsController(c: Context) {
  try {
    const data = await mailSettingsService.getMailSettings();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener el correo de envío') }, 500);
  }
}

export async function saveMailSettingsController(c: Context) {
  try {
    const body = await c.req.valid('json' as never);
    const data = await mailSettingsService.saveMailSettings(body, getAuditActor(c));
    c.set('auditLogged', true);
    return c.json({ success: true, message: 'Correo de envío guardado', data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al guardar el correo de envío') }, 400);
  }
}

export async function testMailController(c: Context) {
  try {
    const { to } = await c.req.valid('json' as never) as { to: string };
    const data = await mailSettingsService.sendTestMail(to);
    return c.json({ success: true, message: `Correo de prueba enviado a ${data.to}`, data });
  } catch (error: any) {
    const known = error instanceof MailError || error?.message === mailSettingsService.MAIL_NOT_CONFIGURED
      || /contraseña del correo de envío/.test(error?.message ?? '');
    return c.json({ success: false, message: known ? error.message : safeMessage(error, 'Error al enviar el correo de prueba') }, known ? 422 : 500);
  }
}
