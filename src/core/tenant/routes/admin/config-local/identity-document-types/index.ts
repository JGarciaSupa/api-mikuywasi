import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { masterDb } from '@/db';
import { countries, identityDocumentTypes } from '@/db/master/schema';
import { branches } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';

const routes = new Hono();

// GET /identity-document-types?branchId=X — tipos de documento de identidad
// permitidos según el país configurado en la sucursal (branch.countryCode →
// countries.isoCode → countryId → identityDocumentTypes).
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
      .select({
        id: identityDocumentTypes.id,
        code: identityDocumentTypes.code,
        name: identityDocumentTypes.name,
        validationType: identityDocumentTypes.validationType,
        docLength: identityDocumentTypes.docLength,
        docPattern: identityDocumentTypes.docPattern,
      })
      .from(identityDocumentTypes)
      .where(and(eq(identityDocumentTypes.countryId, country.id), eq(identityDocumentTypes.isActive, true)))
      .orderBy(identityDocumentTypes.name);

    return c.json({ success: true, data: rows });
  } catch (e) {
    return c.json({ success: false, message: 'Error al obtener tipos de documento' }, 500);
  }
});

export default routes;
