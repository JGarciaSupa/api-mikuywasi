import { createTransport } from 'nodemailer';

// Envío de correos por SMTP con la cuenta propia de cada restaurante (tabla mail_settings).
// No hay cuenta global del sistema: si el restaurante no configuró su correo, no se envía.

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName?: string | null;
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface MailInput {
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

// Mensaje claro para el cliente según el fallo de nodemailer (sin exponer detalles internos)
export class MailError extends Error {}

function toMailError(err: unknown): MailError {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'EAUTH') {
    return new MailError('El servidor de correo rechazó el usuario o la contraseña. En Gmail usa una contraseña de aplicación (no la de tu cuenta).');
  }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(code)) {
    return new MailError('No se pudo conectar con el servidor de correo. Revisa el servidor y el puerto (Gmail: smtp.gmail.com, 465).');
  }
  if (code === 'EENVELOPE') return new MailError('Algún correo de destino no es válido.');
  return new MailError('No se pudo enviar el correo. Revisa la configuración del correo de envío.');
}

function buildTransport(cfg: SmtpConfig) {
  return createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // 465 = SSL directo; 587 = STARTTLS
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
}

export async function sendMail(cfg: SmtpConfig, input: MailInput): Promise<void> {
  try {
    await buildTransport(cfg).sendMail({
      from: cfg.fromName ? { name: cfg.fromName, address: cfg.user } : cfg.user,
      to: input.to.join(', '),
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
    });
  } catch (err) {
    throw toMailError(err);
  }
}
