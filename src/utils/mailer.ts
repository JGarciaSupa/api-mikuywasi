import { createTransport, type Transporter } from 'nodemailer';

// Envío de correos por SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).
// Sin SMTP_HOST el envío está desactivado: sendMail lanza un error claro y nada más se ve afectado.

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

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return !!process.env.SMTP_HOST?.trim();
}

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL directo; 587 = STARTTLS
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export async function sendMail(input: MailInput): Promise<void> {
  if (!isMailConfigured()) {
    throw new Error('El envío de correos no está configurado en el servidor (SMTP)');
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: input.to.join(', '),
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: input.attachments,
  });
}
