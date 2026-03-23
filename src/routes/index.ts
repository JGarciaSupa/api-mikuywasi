import { Hono } from 'hono';
import admin from './admin';
import superAdmin from './super-admin';
import cliente from './cliente';

const routes = new Hono();

routes.route('/admin', admin);
routes.route('/super-admin', superAdmin);
routes.route('/cliente', cliente);

export default routes;
