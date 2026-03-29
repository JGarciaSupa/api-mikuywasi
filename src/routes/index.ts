import { Hono } from 'hono';
import admin from './admin';
import superAdmin from './super-admin/super-admin';
import client from './client';

const routes = new Hono();

routes.route('/admin', admin);
routes.route('/super-admin', superAdmin);
routes.route('/client', client);

export default routes;
