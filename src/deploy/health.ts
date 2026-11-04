import type { Context } from 'hono';
import { sql } from 'drizzle-orm';
import { masterDb } from '../db';
import { redis } from '../utils/redis';
import { readDeployStatus } from './status';

// GET /health (público, sin datos sensibles): estado de la API y del último despliegue.
//   ok       → todo bien
//   degraded → la API atiende, pero falló algún paso del despliegue o Redis (ver `deploy` y `checks`)
//   down     → no hay conexión con la BD master (503: el contenedor se marca como no saludable)

const startedAt = new Date().toISOString();

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** Estado de la API y del último despliegue; lo usan /health y el Super Admin. */
export async function getHealthReport() {
  const [masterOk, redisOk, deploy] = await Promise.all([
    withTimeout(masterDb.execute(sql`select 1`), 3000).then(() => true).catch(() => false),
    withTimeout(redis.send('PING', []), 2000).then(() => true).catch(() => false),
    readDeployStatus(),
  ]);

  const deployFailed = deploy?.steps.some((s) => s.status === 'failed') ?? false;
  const status = !masterOk ? 'down' : deployFailed || !redisOk ? 'degraded' : 'ok';

  return {
    httpStatus: masterOk ? 200 : 503,
    body: {
      status,
      version: process.env.APP_VERSION || process.env.SOURCE_COMMIT || null,
      startedAt,
      checks: { masterDb: masterOk ? 'ok' : 'failed', redis: redisOk ? 'ok' : 'failed' },
      deploy: deploy
        ? {
          ok: deploy.ok,
          trigger: deploy.trigger ?? 'startup',
          triggeredBy: deploy.triggeredBy ?? null,
          startedAt: deploy.startedAt,
          finishedAt: deploy.finishedAt,
          steps: deploy.steps.map((s) => ({
            name: s.name,
            label: s.label,
            status: s.status,
            durationMs: s.durationMs,
            // Solo el detalle de lo que falló, para diagnosticar sin entrar al contenedor
            ...(s.status === 'failed' ? { summary: s.summary } : {}),
          })),
        }
        : null,
    },
  };
}

export async function healthHandler(c: Context) {
  const { body, httpStatus } = await getHealthReport();
  return c.json(body, httpStatus as 200 | 503);
}
