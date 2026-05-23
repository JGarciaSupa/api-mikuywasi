import { Hono } from 'hono';
import usersRoutes from './routes/users.routes';
import plansRoutes from './routes/plans.routes';
import dbServersRoutes from './routes/db-servers.routes';
import tenantsRoutes from './routes/tenants.routes';
import subscriptionsRoutes from './routes/subscriptions.routes';
import rbacRoutes from './routes/rbac.routes';

const master = new Hono();

// ── Módulo Master – Control Central SaaS ──────────────────────────────────────
master.route('/users', usersRoutes);           // Super-admins & Auth
master.route('/plans', plansRoutes);           // Planes de suscripción
master.route('/db-servers', dbServersRoutes);  // Infraestructura de servidores
master.route('/tenants', tenantsRoutes);       // Directorio de tenants
master.route('/subscriptions', subscriptionsRoutes); // Historial de facturación
master.route('/rbac', rbacRoutes);             // RBAC: acciones, sub-acciones, roles, grants

export default master;
