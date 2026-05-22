import { Hono } from 'hono';
import admin from './admin';
import client from './client';
import master from '../../master';

const routes = new Hono();

routes.route('/admin', admin);
routes.route('/client', client);
routes.route('/master', master);

export default routes;
