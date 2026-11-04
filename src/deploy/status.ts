import { readFile, writeFile } from 'fs/promises';

// Resultado de los pasos de despliegue que corren al arrancar el contenedor (docker/start.sh →
// src/scripts/deploy.ts). Se guarda en un archivo del contenedor para que /health lo informe.

export type DeployStepStatus = 'ok' | 'failed' | 'skipped';

export interface DeployStepResult {
  name: string;
  label: string;
  status: DeployStepStatus;
  durationMs: number;
  /** Últimas líneas de la salida del paso (para diagnosticar sin entrar al contenedor) */
  summary: string[];
}

export interface DeployStatus {
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  /** startup: al arrancar el contenedor; manual: "Reintentar" desde el Super Admin */
  trigger?: 'startup' | 'manual';
  triggeredBy?: string | null;
  steps: DeployStepResult[];
}

export const DEPLOY_STATUS_FILE = process.env.DEPLOY_STATUS_FILE || '/tmp/deploy-status.json';

export async function readDeployStatus(): Promise<DeployStatus | null> {
  try {
    return JSON.parse(await readFile(DEPLOY_STATUS_FILE, 'utf8')) as DeployStatus;
  } catch {
    return null;
  }
}

export async function writeDeployStatus(status: DeployStatus) {
  try {
    await writeFile(DEPLOY_STATUS_FILE, JSON.stringify(status, null, 2));
  } catch (error) {
    console.warn('[deploy] No se pudo guardar el estado del despliegue:', error);
  }
}
