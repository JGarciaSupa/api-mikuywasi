import { Hono } from 'hono';
import admin from './admin';
import client from './client';
import master from '../core/master';

const routes = new Hono();

routes.route('/admin', admin);
routes.route('/client', client);
routes.route('/master', master);

export default routes;
