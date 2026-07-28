import { Hono } from 'hono';
import usersRoutes from './routes/users.routes';
import plansRoutes from './routes/plans.routes';
import dbServersRoutes from './routes/db-servers.routes';
import tenantsRoutes from './routes/tenants.routes';
import subscriptionsRoutes from './routes/subscriptions.routes';
import publicRoutes from './routes/public.routes';
import rbacRoutes from './routes/rbac.routes';
import currenciesRoutes from './routes/currencies.routes';
import countriesRoutes from './routes/countries.routes';
import identityDocumentTypesRoutes from './routes/identity-document-types.routes';
import receiptTypesRoutes from './routes/receipt-types.routes';
import salesChannelClassificationsRoutes from './routes/sales-channel-classifications.routes';
import activationsRoutes from './routes/activations.routes';
import tableStatusesRoutes from './routes/table-statuses.routes';

const master = new Hono();

// ── Módulo Master – Control Central SaaS ──────────────────────────────────────
master.route('/users', usersRoutes);           // Super-admins & Auth
master.route('/plans', plansRoutes);           // Planes de suscripción
master.route('/db-servers', dbServersRoutes);  // Infraestructura de servidores
master.route('/tenants', tenantsRoutes);       // Directorio de tenants
master.route('/subscriptions', subscriptionsRoutes); // Historial de facturación
master.route('/rbac', rbacRoutes);             // RBAC: acciones, sub-acciones, roles, grants
master.route('/currencies', currenciesRoutes); // Monedas globales
master.route('/countries', countriesRoutes);   // Países globales
master.route('/identity-document-types', identityDocumentTypesRoutes);
master.route('/receipt-types', receiptTypesRoutes);
master.route('/sales-channel-classifications', salesChannelClassificationsRoutes);
master.route('/activations', activationsRoutes); // Catálogo global de activaciones (interruptores)
master.route('/table-statuses', tableStatusesRoutes); // Catálogo global de estados de mesas



// Public routes
master.route('/public', publicRoutes);

export default master;
