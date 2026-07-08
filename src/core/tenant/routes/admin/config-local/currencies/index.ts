import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { masterDb } from '@/db';
import { currencies } from '@/db/master/schema';

const routes = new Hono();

// GET /currencies — lista las monedas activas del catálogo maestro (ISO 4217)
routes.get('/', async (c) => {
  try {
    const rows = await masterDb
      .select({ id: currencies.id, name: currencies.name, isoCode: currencies.isoCode, symbol: currencies.symbol })
      .from(currencies)
      .where(eq(currencies.isActive, true))
      .orderBy(currencies.name);
    return c.json({ success: true, data: rows });
  } catch (e) {
    return c.json({ success: false, message: 'Error al obtener monedas' }, 500);
  }
});

export default routes;
