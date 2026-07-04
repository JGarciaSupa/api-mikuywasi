import { Hono } from 'hono';
import usersRoutes from './routes/users.routes';
import plansRoutes from './routes/plans.routes';
import dbServersRoutes from './routes/db-servers.routes';
import tenantsRoutes from './routes/tenants.routes';
import subscriptionsRoutes from './routes/subscriptions.routes';
import publicRoutes from './routes/public.routes';
import rbacRoutes from './routes/rbac.routes';
import countriesRoutes from './routes/countries.routes';
import currenciesRoutes from './routes/currencies.routes';
import brandsRoutes from './routes/brands.routes';
import localesRoutes from './routes/locales.routes';

const master = new Hono();

// ── Módulo Master – Control Central SaaS ──────────────────────────────────────
master.route('/users', usersRoutes);           // Super-admins & Auth
master.route('/plans', plansRoutes);           // Planes de suscripción
master.route('/db-servers', dbServersRoutes);  // Infraestructura de servidores
master.route('/tenants', tenantsRoutes);       // Directorio de tenants
master.route('/subscriptions', subscriptionsRoutes); // Historial de facturación
master.route('/rbac', rbacRoutes);             // RBAC: acciones, sub-acciones, roles, grants

// ── SIGG: Corporación (Tenant) > Marca > Local ────────────────────────────────
master.route('/countries', countriesRoutes);   // Catálogo maestro de países (Fase 1.1)
master.route('/currencies', currenciesRoutes); // Catálogo maestro de monedas (US 1.3)
master.route('/brands', brandsRoutes);         // Marcas por corporación (US 1.1)
master.route('/locales', localesRoutes);       // Locales/Sucursales y parámetros fiscales (US 1.2)


// Public routes
master.route('/public', publicRoutes);

export default master;
