import { Hono } from 'hono';
import { cors } from 'hono/cors';
import routes from './routes';

import { getConnInfo } from 'hono/bun';

const app = new Hono();

// Middleware
app.use('*', cors({
  origin: (origin) => origin,
  credentials: true,
}));

// Routes
app.route('/api', routes);

app.get('/', (c) => {
  // 1. Intentamos obtener la IP real desde los headers de reenvío
  const forwardedFor = c.req.header('x-forwarded-for');
  let ipAddress = '';

  if (forwardedFor) {
    // x-forwarded-for puede ser una lista de IPs si hay varios saltos
    // La primera siempre es la del cliente original
    ipAddress = forwardedFor.split(',')[0].trim();
  } else {
    // 2. Si no hay header, caemos en el método de conexión directa (útil para desarrollo local)
    const rawIp = getConnInfo(c).remote.address || '';
    ipAddress = rawIp.includes('::ffff:') ? rawIp.split('::ffff:')[1] : rawIp;
  }

  return c.json({
    success: true,
    message: "Sistema Pedidos QR API is running!",
    ip: ipAddress
  });
});

const port = process.env.PORT || 3000;

export default {
  port,
  fetch: app.fetch,
};
