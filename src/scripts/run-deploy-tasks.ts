import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { eq } from 'drizzle-orm';
import { masterDb } from '../db';
import { deployTasks } from '../db/master/schema';
import type { DeployTaskContext } from '../deploy/types';

// Ejecuta en orden las tareas de despliegue pendientes de src/deploy-tasks (ver su README):
// una vez por entorno, registradas en master.deploy_tasks. Si una falla, se detiene (las demás
// esperan al siguiente arranque) y sale con código 1.

const TASKS_DIR = path.resolve(process.cwd(), 'src/deploy-tasks');
const TASK_FILE = /^\d{4}_[a-z0-9_-]+\.ts$/i;

async function execute() {
  console.log('\n🧩 [Deploy Tasks] Buscando tareas de despliegue pendientes...');
  try {
    const files = fs.existsSync(TASKS_DIR) ? fs.readdirSync(TASKS_DIR).filter((f) => TASK_FILE.test(f)).sort() : [];
    const done = new Set(
      (await masterDb.select({ name: deployTasks.name, status: deployTasks.status }).from(deployTasks))
        .filter((t) => t.status === 'done')
        .map((t) => t.name),
    );
    const pending = files.filter((f) => !done.has(f));
    if (pending.length === 0) {
      console.log(`✅ Sin tareas pendientes (${files.length} ya ejecutadas).`);
      process.exit(0);
    }

    for (const file of pending) {
      const lines: string[] = [];
      const log = (msg: string) => {
        lines.push(msg);
        console.log(msg);
      };
      console.log(`\n▶ ${file}`);
      const [existing] = await masterDb.select().from(deployTasks).where(eq(deployTasks.name, file)).limit(1);
      try {
        const mod = await import(path.join(TASKS_DIR, file));
        if (typeof mod.default !== 'function') throw new Error('La tarea no exporta una función por defecto');
        await mod.default({ log } satisfies DeployTaskContext);
        const values = { status: 'done', output: lines.join('\n').slice(-4000), finishedAt: new Date() };
        if (existing) await masterDb.update(deployTasks).set({ ...values, attempts: existing.attempts + 1 }).where(eq(deployTasks.id, existing.id));
        else await masterDb.insert(deployTasks).values({ name: file, ...values });
        console.log(`✅ ${file}`);
      } catch (error: any) {
        const message = error?.message || String(error);
        const values = { status: 'failed', output: [...lines, `ERROR: ${message}`].join('\n').slice(-4000), finishedAt: new Date() };
        if (existing) await masterDb.update(deployTasks).set({ ...values, attempts: existing.attempts + 1 }).where(eq(deployTasks.id, existing.id));
        else await masterDb.insert(deployTasks).values({ name: file, ...values });
        console.error(`❌ ${file}: ${message}. Las tareas siguientes esperan al próximo arranque.`);
        process.exit(1);
      }
    }
    console.log(`\n✅ Tareas de despliegue ejecutadas: ${pending.length}.`);
    process.exit(0);
  } catch (error: any) {
    console.error('💥 [Deploy Tasks] Error:', error?.message || error);
    process.exit(1);
  }
}

execute();
