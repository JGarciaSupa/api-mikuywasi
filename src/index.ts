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
  // Buscamos la IP en orden de importancia
  const rawIp = 
    c.req.header('cf-connecting-ip') || 
    c.req.header('x-forwarded-for')?.split(',')[0] || 
    getConnInfo(c).remote.address || 
    '0.0.0.0'; // Valor por defecto si todo lo demás falla

  // Ahora 'rawIp' siempre es un string, así que podemos usar .includes() sin miedo
  const ipAddress = rawIp.includes('::ffff:') 
    ? rawIp.split('::ffff:')[1] 
    : rawIp;

  return c.json({
    success: true,
    ip: ipAddress
  });
});

const port = process.env.PORT || 3000;

export default {
  port,
  fetch: app.fetch,
};
