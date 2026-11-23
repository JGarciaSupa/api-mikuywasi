import { eq } from 'drizzle-orm';
import { cashSessions, cashRegisters, branches, users } from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';
import { sendMail, type MailAttachment } from '../../../../../utils/mailer';
import { getSmtpConfig } from '../config-local/mail-settings.service';
import { writeAuditLog } from '../warehouse/shared/audit.service';
import type { AuditActor } from '../warehouse/types';

// Correo del cierre de turno: el admin genera los PDF (liquidación, paloteo, anulaciones, los
// mismos que imprime) y la API los envía a los correos configurados en la caja. Los destinatarios
// salen siempre de la caja, nunca del request.

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const money = (v: string | null | undefined) => `S/ ${Number(v ?? 0).toFixed(2)}`;
const limaDate = (d: Date | null) => d
  ? d.toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '-';
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export async function sendCloseReportEmail(
  sessionId: number,
  attachments: MailAttachment[],
  actor?: AuditActor,
): Promise<{ sentTo: string[] }> {
  const db = getTenantDb();
  const [row] = await db
    .select({ session: cashSessions, registerName: cashRegisters.name, reportEmails: cashRegisters.reportEmails, branchName: branches.name })
    .from(cashSessions)
    .innerJoin(cashRegisters, eq(cashRegisters.id, cashSessions.registerId))
    .innerJoin(branches, eq(branches.id, cashSessions.branchId))
    .where(eq(cashSessions.id, sessionId))
    .limit(1);
  if (!row) throw new Error('Turno no encontrado');
  if (row.session.status !== 'closed') throw new Error('El turno aún no está cerrado');

  const to = row.reportEmails ?? [];
  if (to.length === 0) throw new Error('La caja no tiene correos configurados para los reportes del cierre');

  if (attachments.length === 0) throw new Error('No se recibieron los reportes del cierre');
  if (attachments.length > MAX_ATTACHMENTS) throw new Error(`Máximo ${MAX_ATTACHMENTS} archivos`);
  for (const a of attachments) {
    if (a.content.length > MAX_ATTACHMENT_BYTES) throw new Error(`El archivo ${a.filename} supera 5 MB`);
    if (a.content.subarray(0, 4).toString() !== '%PDF') throw new Error(`El archivo ${a.filename} no es un PDF`);
  }

  const s = row.session;
  const [cashier] = s.userId != null
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, s.userId)).limit(1)
    : [];

  const lines: [string, string][] = [
    ['Sucursal', row.branchName],
    ['Caja', row.registerName],
    ['Turno', s.code ?? String(s.id)],
    ['Cajero', cashier?.name ?? '-'],
    ['Apertura', limaDate(s.openedAt)],
    ['Cierre', limaDate(s.closedAt)],
    ['Fondo inicial', money(s.openingBalance)],
    ['Total ingresos', money(s.totalIncome)],
    ['Total egresos', money(s.totalExpense)],
    ['Efectivo esperado', money(s.expectedBalance)],
    ['Efectivo contado', money(s.closingBalance)],
    ['Diferencia', money(s.difference)],
  ];

  const subject = `Cierre de turno ${s.code ?? s.id} — ${row.registerName} (${row.branchName})`;
  const text = `${subject}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nSe adjuntan la liquidación del cajero, el paloteo de producción y las anulaciones del turno.`;
  const html = `<p><b>${escapeHtml(subject)}</b></p>
<table cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
${lines.map(([k, v]) => `<tr><td style="color:#5b6670">${escapeHtml(k)}</td><td><b>${escapeHtml(v)}</b></td></tr>`).join('\n')}
</table>
<p style="font-family:Arial,sans-serif;font-size:13px;color:#5b6670">Se adjuntan la liquidación del cajero, el paloteo de producción y las anulaciones del turno.</p>`;

  await sendMail(await getSmtpConfig(), { to, subject, text, html, attachments });

  await writeAuditLog({
    tableName: 'cash_sessions',
    operation: 'UPDATE',
    recordId: s.id,
    afterData: { reportEmailSentTo: to, attachments: attachments.map((a) => a.filename) },
    userId: actor?.userId,
    userName: actor?.userName,
    module: 'caja',
    description: `Reportes del cierre del turno ${s.code ?? s.id} enviados a ${to.join(', ')}`,
  });

  return { sentTo: to };
}
