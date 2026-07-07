import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { masterDb } from '@/db';
import { countries } from '@/db/master/schema';

const routes = new Hono();

// GET /countries — lista los países activos del catálogo maestro
routes.get('/', async (c) => {
  try {
    const rows = await masterDb
      .select({ id: countries.id, name: countries.name, isoCode: countries.isoCode })
      .from(countries)
      .where(eq(countries.isActive, true))
      .orderBy(countries.name);
    return c.json({ success: true, data: rows });
  } catch (e) {
    return c.json({ success: false, message: 'Error al obtener países' }, 500);
  }
});

export default routes;
