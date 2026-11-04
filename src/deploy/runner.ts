import { readDeployStatus, writeDeployStatus, type DeployStatus, type DeployStepResult } from './status';

// Pasos de despliegue, en orden y sin intervención. Corren al arrancar el contenedor
// (docker/start.sh → src/scripts/deploy.ts) y, a pedido, desde el Super Admin ("Reintentar"):
//   1. migraciones de la BD master        (RUN_MIGRATIONS_ON_START)
//   2. migraciones de todos los tenants   (RUN_MIGRATIONS_ON_START)
//   3. permisos nuevos del seed (RBAC)    (RUN_RBAC_SYNC_ON_START)
//   4. tareas de despliegue pendientes    (RUN_DEPLOY_TASKS_ON_START) → src/deploy-tasks
// Todo es incremental: solo se aplica lo que falta. El resultado queda en /health y, si algo falla
// y está configurado DEPLOY_ALERT_WEBHOOK_URL, se avisa por webhook (Slack, Discord, Google Chat…).
// Cada paso corre en un proceso aparte (bun run <script>) y solo se ejecutan pasos de esta lista:
// nunca comandos arbitrarios.

const SUMMARY_LINES = 12;

export interface Step {
  name: string;
  label: string;
  args: string[];
}

export const flag = (name: string, fallback = true) => (process.env[name] ?? String(fallback)) === 'true';

async function runStep(step: Step): Promise<DeployStepResult> {
  const started = Date.now();
  console.log(`\n[deploy] ▶ ${step.label}`);
  const proc = Bun.spawn([process.execPath, 'run', ...step.args], { stdout: 'pipe', stderr: 'pipe', env: process.env });
  const lines: string[] = [];
  const pump = async (stream: ReadableStream<Uint8Array>, write: (s: string) => void) => {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      write(text);
      for (const line of text.split('\n')) if (line.trim()) lines.push(line.trimEnd());
      if (lines.length > 200) lines.splice(0, lines.length - 200);
    }
  };
  await Promise.all([
    pump(proc.stdout, (s) => process.stdout.write(s)),
    pump(proc.stderr, (s) => process.stderr.write(s)),
  ]);
  const code = await proc.exited;
  return {
    name: step.name,
    label: step.label,
    status: code === 0 ? 'ok' : 'failed',
    durationMs: Date.now() - started,
    summary: lines.slice(-SUMMARY_LINES),
  };
}

/** Líneas de error del paso (las marcadas con ❌ o "Error"); si no hay, las últimas */
const errorLines = (summary: string[]) => {
  const errors = summary.filter((l) => /❌|error/i.test(l));
  return (errors.length ? errors : summary).slice(-3).map((l) => l.slice(0, 200)).join(' | ');
};

async function notify(status: DeployStatus) {
  const url = process.env.DEPLOY_ALERT_WEBHOOK_URL;
  if (!url) return;
  if (status.ok && !flag('DEPLOY_ALERT_ON_SUCCESS', false)) return;
  const env = process.env.DEPLOY_ENV_NAME || process.env.NODE_ENV || 'api';
  const failed = status.steps.filter((s) => s.status === 'failed');
  const text = status.ok
    ? `✅ [${env}] Despliegue OK: ${status.steps.map((s) => `${s.label} ${s.status}`).join(' · ')}`
    : `❌ [${env}] Falló el despliegue: ${failed.map((s) => `${s.label} → ${errorLines(s.summary)}`).join(' || ')}. Revisa /health y los logs.`;
  try {
    // Slack/Google Chat leen `text`; Discord, `content`
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, content: text }) });
  } catch (error) {
    console.warn('[deploy] No se pudo enviar el aviso al webhook:', error);
  }
}

export const DEPLOY_STEPS = [
  { name: 'master-migrations', label: 'Migraciones master', args: ['src/scripts/migrate-master.ts'], envFlag: 'RUN_MIGRATIONS_ON_START' },
  { name: 'tenant-migrations', label: 'Migraciones de tenants', args: ['src/scripts/migrate-tenants.ts'], envFlag: 'RUN_MIGRATIONS_ON_START' },
  { name: 'rbac', label: 'Permisos nuevos (RBAC)', args: ['src/scripts/rbac-add-missing.ts', '--apply'], envFlag: 'RUN_RBAC_SYNC_ON_START', dependsOnMaster: true },
  { name: 'deploy-tasks', label: 'Tareas de despliegue', args: ['src/scripts/run-deploy-tasks.ts'], envFlag: 'RUN_DEPLOY_TASKS_ON_START', dependsOnMaster: true },
] as const;

export type DeployStepName = (typeof DEPLOY_STEPS)[number]['name'];

/**
 * Ejecuta los pasos de despliegue. `only`: solo esos pasos (reintento desde el Super Admin); sin él,
 * todos los habilitados por variables de entorno (arranque). `trigger` queda en el estado para /health.
 */
export async function runDeploy(options: { only?: DeployStepName[]; trigger: 'startup' | 'manual'; triggeredBy?: string | null }) {
  const previous = options.trigger === 'manual' ? await readDeployStatus() : null;
  const status: DeployStatus = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ok: true,
    trigger: options.trigger,
    triggeredBy: options.triggeredBy ?? null,
    steps: [],
  };
  await writeDeployStatus(status);

  let masterFailed = false;
  for (const def of DEPLOY_STEPS) {
    const selected = options.only ? options.only.includes(def.name) : flag(def.envFlag);
    if (!selected) {
      // En un reintento parcial se conserva el último resultado de los pasos no reintentados
      const kept = previous?.steps.find((s) => s.name === def.name);
      status.steps.push(kept ?? { name: def.name, label: def.label, status: 'skipped', durationMs: 0, summary: ['Desactivado por variable de entorno'] });
      continue;
    }
    if ('dependsOnMaster' in def && def.dependsOnMaster && masterFailed) {
      status.steps.push({ name: def.name, label: def.label, status: 'skipped', durationMs: 0, summary: ['Omitido: falló la migración master'] });
      continue;
    }
    const result = await runStep({ name: def.name, label: def.label, args: [...def.args] });
    status.steps.push(result);
    if (def.name === 'master-migrations' && result.status === 'failed') masterFailed = true;
    await writeDeployStatus(status);
  }

  status.finishedAt = new Date().toISOString();
  status.ok = status.steps.every((s) => s.status !== 'failed');
  await writeDeployStatus(status);
  console.log(`\n[deploy] ${status.ok ? '✅ Despliegue completo' : '⚠️ Despliegue con fallos'}: ${status.steps.map((s) => `${s.label}=${s.status}`).join(', ')}`);
  await notify(status);
  return status;
}
