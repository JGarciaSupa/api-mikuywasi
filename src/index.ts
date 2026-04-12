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
  // Cloudflare usa 'cf-connecting-ip' por defecto. 
  // Es el estándar de oro si usas su proxy.
  const rawIp = 
    c.req.header('cf-connecting-ip') || 
    c.req.header('x-forwarded-for')?.split(',')[0] || 
    getConnInfo(c).remote.address || 
    '0.0.0.0';

  const ipAddress = rawIp.includes('::ffff:') 
    ? rawIp.split('::ffff:')[1] 
    : rawIp;

  console.log("IP: ", ipAddress);

  return c.json({ ip: ipAddress });
});

const port = process.env.PORT || 3000;

export default {
  port,
  fetch: app.fetch,
};
