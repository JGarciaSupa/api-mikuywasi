import { and, eq, ilike, inArray, sql } from 'drizzle-orm';
import type { DeployTaskContext } from '../deploy/types';
import { forEachTenant } from '../deploy/tenants';
import { paymentMethods, branches } from '../db/tenant/schema';

// QAS · Wine Spirit - Golf Asia (04/11/2026): corrige los métodos de pago que distorsionan el arqueo.
//   - "Efectivo" de Sede Principal estaba como NO efectivo → efectivo (sus cobros no sumaban en caja).
//   - "Yape" estaba como efectivo → no efectivo (llega al celular/banco, no al cajón).
//   - "Mastecard" → "Mastercard".
// Solo en QAS (PRD_SYNC_ENABLED=true); en PRD lo corrige el administrador del restaurante desde el admin
// (Sucursales → Métodos de pago). Solo afecta a los cobros nuevos: cada cobro guarda si fue efectivo.

const TENANT_SLUG = 'wine-spirit-golf-asia';

export default async function run({ log }: DeployTaskContext) {
  if (process.env.PRD_SYNC_ENABLED !== 'true') {
    log('Omitida: solo aplica en QAS.');
    return;
  }

  await forEachTenant(async (db, tenant) => {
    if (tenant.slug !== TENANT_SLUG) return;

    const sede = await db.select({ id: branches.id }).from(branches).where(eq(branches.name, 'Sede Principal'));
    const sedeIds = sede.map((b) => b.id);

    const efectivo = sedeIds.length
      ? await db.update(paymentMethods)
        .set({ isCash: true, updatedAt: new Date() })
        .where(and(eq(paymentMethods.name, 'Efectivo'), inArray(paymentMethods.branchId, sedeIds), eq(paymentMethods.isCash, false)))
        .returning({ id: paymentMethods.id })
      : [];
    const yape = await db.update(paymentMethods)
      .set({ isCash: false, updatedAt: new Date() })
      .where(and(ilike(paymentMethods.name, 'yape'), eq(paymentMethods.isCash, true)))
      .returning({ id: paymentMethods.id });
    const mastercard = await db.update(paymentMethods)
      .set({ name: 'Mastercard', updatedAt: new Date() })
      .where(sql`${paymentMethods.name} = 'Mastecard'`)
      .returning({ id: paymentMethods.id });

    log(`   ${tenant.name}: Efectivo (Sede Principal) → efectivo: ${efectivo.length} · Yape → no efectivo: ${yape.length} · Mastecard → Mastercard: ${mastercard.length}`);
  }, log);
}
