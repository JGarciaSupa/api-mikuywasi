import { Hono } from 'hono';
import { cors } from 'hono/cors';
import routes from './routes';

const app = new Hono();

// Middleware
app.use('*', cors({
  origin: (origin) => origin,
  credentials: true,
}));

// Routes
app.route('/api', routes);

app.get('/', (c) => {
  return c.json({
    success: true,
    message: "Sistema Pedidos QR API is running!"
  })
});

const port = process.env.PORT || 3000;

export default {
  port,
  fetch: app.fetch,
};
