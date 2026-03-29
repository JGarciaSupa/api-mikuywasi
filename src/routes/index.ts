import { Hono } from 'hono';
import admin from './admin';
import client from './client';

const routes = new Hono();

routes.route('/admin', admin);
routes.route('/client', client);

export default routes;
