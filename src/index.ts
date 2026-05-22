import { Hono } from 'hono';
import { cors } from 'hono/cors';
// import routes from './routes';

import masterRoutes from '@/core/master';

import { getClientIp } from './utils/ip';
// import { initJobs } from './jobs';

// Initialize background jobs
// initJobs();

const app = new Hono();

// Middleware
app.use('*', cors({
  origin: (origin) => origin,
  credentials: true,
}));

// Routes
// app.route('/api', routes);

app.route('/api/master', masterRoutes);

app.get('/', (c) => {
  const ipAddress = getClientIp(c);

  console.log("IP: ", ipAddress);

  return c.json({
    ip: ipAddress,
    version: '2.0.1'
  });
});

const port = process.env.PORT || 3000;

export default {
  port,
  fetch: app.fetch,
};
