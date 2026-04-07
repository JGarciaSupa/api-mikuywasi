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

  const rawIp = getConnInfo(c).remote.address || '';
  // Si la IP incluye el prefijo de mapeo, lo eliminamos
  const ipAddress = rawIp.includes('::ffff:')
    ? rawIp.split('::ffff:')[1]
    : rawIp;

  return c.json({
    success: true,
    message: "Sistema Pedidos QR API is running!",
    ip: ipAddress
  })
});

const port = process.env.PORT || 3000;

export default {
  port,
  fetch: app.fetch,
};
