import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { masterDb } from '@/db';
import { countries, receiptTypes } from '@/db/master/schema';
import { branches } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';

const routes = new Hono();

// GET /receipt-types?branchId=X — tipos de comprobante permitidos según el país
// configurado en la sucursal (branch.countryCode → countries.isoCode → countryId).
routes.get('/', async (c) => {
  try {
    const branchIdStr = c.req.query('branchId');
    const branchId = branchIdStr && !isNaN(Number(branchIdStr)) ? Number(branchIdStr) : undefined;
    if (!branchId) return c.json({ success: false, message: 'Se requiere branchId' }, 400);

    const db = getTenantDb();
    const [branch] = await db
      .select({ countryCode: branches.countryCode })
      .from(branches)
      .where(eq(branches.id, branchId));

    if (!branch?.countryCode) return c.json({ success: true, data: [] });

    const [country] = await masterDb
      .select({ id: countries.id })
      .from(countries)
      .where(eq(countries.isoCode, branch.countryCode));

    if (!country) return c.json({ success: true, data: [] });

    const rows = await masterDb
      .select({ id: receiptTypes.id, code: receiptTypes.code, name: receiptTypes.name })
      .from(receiptTypes)
      .where(and(eq(receiptTypes.countryId, country.id), eq(receiptTypes.isActive, true)))
      .orderBy(receiptTypes.name);

    return c.json({ success: true, data: rows });
  } catch (e) {
    return c.json({ success: false, message: 'Error al obtener tipos de comprobante' }, 500);
  }
});

export default routes;
