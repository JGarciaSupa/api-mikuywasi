import { eq } from 'drizzle-orm';
import { mailSettings } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { encryptSecret, decryptSecret } from '../../../../../utils/secret-crypto';
import { sendMail, type SmtpConfig } from '../../../../../utils/mailer';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import type { AuditActor } from '../warehouse/types';

// Correo de envío del restaurante (una fila por tenant). La contraseña nunca sale de la API.

export interface MailSettingsInput {
  host: string;
  port: number;
  username: string;
  password?: string;
  fromName?: string | null;
  isActive?: boolean;
}

export const MAIL_NOT_CONFIGURED = 'Configura el correo de envío del restaurante (Configuraciones › Correo de envío)';

async function getRow() {
  const db = getTenantDb();
  const [row] = await db.select().from(mailSettings).where(eq(mailSettings.singleton, true)).limit(1);
  return row ?? null;
}

// Vista pública: sin la contraseña, solo si está guardada
export async function getMailSettings() {
  const row = await getRow();
  if (!row) return null;
  return {
    host: row.host,
    port: row.port,
    username: row.username,
    fromName: row.fromName,
    isActive: row.isActive,
    hasPassword: !!row.passwordEncrypted,
    updatedAt: row.updatedAt,
  };
}

export async function saveMailSettings(input: MailSettingsInput, actor?: AuditActor) {
  const db = getTenantDb();
  const current = await getRow();
  const password = input.password?.replace(/\s+/g, '') || '';
  if (!current && !password) throw new Error('La contraseña de aplicación es obligatoria');

  const values = {
    host: input.host.trim(),
    port: input.port,
    username: input.username.trim(),
    fromName: input.fromName?.trim() || null,
    isActive: input.isActive ?? true,
    updatedBy: actor?.userId ?? null,
    updatedAt: new Date(),
    ...(password ? { passwordEncrypted: encryptSecret(password) } : {}),
  };

  if (current) {
    await db.update(mailSettings).set(values).where(eq(mailSettings.id, current.id));
  } else {
    await db.insert(mailSettings).values({ ...values, passwordEncrypted: encryptSecret(password) });
  }

  // Auditoría sin la contraseña (ni cifrada)
  const safe = { host: values.host, port: values.port, username: values.username, fromName: values.fromName, isActive: values.isActive };
  await writeAuditLog({
    tableName: 'mail_settings',
    operation: current ? 'UPDATE' : 'INSERT',
    recordId: current?.id ?? null,
    afterData: { ...safe, passwordChanged: !!password },
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'configuracion',
    description: `Correo de envío ${current ? 'actualizado' : 'configurado'}: ${values.username}`,
  });

  return getMailSettings();
}

// Cuenta SMTP lista para enviar, o error claro si no está configurada o está desactivada
export async function getSmtpConfig(): Promise<SmtpConfig> {
  const row = await getRow();
  if (!row || !row.isActive) throw new Error(MAIL_NOT_CONFIGURED);
  let pass: string;
  try {
    pass = decryptSecret(row.passwordEncrypted);
  } catch {
    throw new Error('No se pudo leer la contraseña del correo de envío: vuelve a guardarla');
  }
  return { host: row.host, port: row.port, user: row.username, pass, fromName: row.fromName };
}

export async function sendTestMail(to: string) {
  const cfg = await getSmtpConfig();
  await sendMail(cfg, {
    to: [to],
    subject: 'Correo de prueba — GastroPro 360',
    text: `Este es un correo de prueba enviado desde ${cfg.user}. Si lo recibes, el correo de envío del restaurante está bien configurado.`,
    html: `<p>Este es un correo de prueba enviado desde <b>${cfg.user}</b>.</p><p>Si lo recibes, el correo de envío del restaurante está bien configurado.</p>`,
  });
  return { from: cfg.user, to };
}
