import * as fs from 'fs';
import * as path from 'path';
import { desc } from 'drizzle-orm';
import { masterDb } from '../../../db';
import { deployTasks, auditLogs } from '../../../db/master/schema';
import { getHealthReport } from '../../../deploy/health';
import { readDeployStatus } from '../../../deploy/status';
import { DEPLOY_STEPS, runDeploy, type DeployStepName } from '../../../deploy/runner';

// Estado del despliegue para el Super Admin y "Reintentar". Solo se ejecutan los pasos conocidos
// (src/deploy/runner.ts), nunca comandos libres; uno a la vez y en segundo plano (la migración de
// muchos tenants puede tardar más que una petición HTTP). Cada reintento queda en audit_logs.

const TASKS_DIR = path.resolve(process.cwd(), 'src/deploy-tasks');
const TASK_FILE = /^\d{4}_[a-z0-9_-]+\.ts$/i;

let running: { startedAt: string; triggeredBy: string | null; steps: DeployStepName[] } | null = null;

export interface DeployActor {
  userId: number | null;
  userName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export async function getDeployOverview() {
  const [{ body: health }, tasks] = await Promise.all([
    getHealthReport(),
    masterDb.select().from(deployTasks).orderBy(desc(deployTasks.name)).catch(() => []),
  ]);
  const doneNames = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.name));
  const files = fs.existsSync(TASKS_DIR) ? fs.readdirSync(TASKS_DIR).filter((f) => TASK_FILE.test(f)).sort() : [];

  return {
    health,
    running,
    steps: DEPLOY_STEPS.map((s) => ({ name: s.name, label: s.label })),
    tasks: tasks.map((t) => ({
      name: t.name,
      status: t.status,
      attempts: t.attempts,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
      output: t.output ? t.output.slice(-2000) : null,
    })),
    pendingTasks: files.filter((f) => !doneNames.has(f)),
  };
}

/** mode 'failed': solo los pasos que fallaron en el último despliegue; 'all': los 4 pasos. */
export async function startDeployRetry(mode: 'failed' | 'all', actor: DeployActor) {
  if (running) throw new Error('Ya hay una ejecución en curso. Espera a que termine');

  let only: DeployStepName[];
  if (mode === 'all') {
    only = DEPLOY_STEPS.map((s) => s.name);
  } else {
    const last = await readDeployStatus();
    only = (last?.steps ?? []).filter((s) => s.status === 'failed').map((s) => s.name as DeployStepName);
    if (only.length === 0) throw new Error('No hay pasos fallidos para reintentar');
    // Si falló la master, los pasos que dependen de ella también se reintentan
    if (only.includes('master-migrations')) only = [...new Set<DeployStepName>([...only, 'rbac', 'deploy-tasks'])];
  }

  running = { startedAt: new Date().toISOString(), triggeredBy: actor.userName, steps: only };
  runDeploy({ only, trigger: 'manual', triggeredBy: actor.userName })
    .then(async (status) => {
      await masterDb.insert(auditLogs).values({
        userId: actor.userId,
        action: 'DEPLOY_RETRY',
        tableName: 'deploy_tasks',
        newValues: JSON.stringify({ mode, steps: only, ok: status.ok, results: status.steps.map((s) => ({ name: s.name, status: s.status })) }),
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      }).catch((error) => console.warn('[deploy] No se pudo auditar el reintento:', error));
    })
    .catch((error) => console.error('[deploy] Falló el reintento:', error))
    .finally(() => {
      running = null;
    });

  return running;
}
