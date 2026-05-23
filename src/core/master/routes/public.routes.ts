import { Hono } from 'hono';
import { getTenantBySlug } from '../controllers/public.controller';

const router = new Hono();

router.get('/slug/:slug', getTenantBySlug);

export default router;
