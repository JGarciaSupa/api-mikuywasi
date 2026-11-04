# Tareas de despliegue

Si tu cambio necesita **ejecutar algo una vez** en cada entorno (corregir datos, completar un catálogo,
sembrar valores por defecto en los tenants…), **no pidas que alguien lo corra a mano**: crea aquí una tarea.
Al arrancar la API (QAS y PRD), `src/scripts/run-deploy-tasks.ts` ejecuta las tareas pendientes **en orden**,
una sola vez por entorno, y lo registra en la tabla master `deploy_tasks`.

Lo que ya es automático y **no** necesita tarea:
- migraciones de la BD master (`drizzle/master`) y de los tenants (`drizzle/tenant`),
- permisos nuevos de `seed-master-rbac.ts` (`rbac-add-missing --apply`).

## Cómo crear una tarea

Archivo `NNNN_descripcion.ts` (número siguiente, 4 dígitos), con un `run` por defecto:

```ts
import type { DeployTaskContext } from '../deploy/types';
import { forEachTenant } from '../deploy/tenants';

// Qué hace y por qué (en español)
export default async function run({ log }: DeployTaskContext) {
  await forEachTenant(async (db) => {
    // ... idempotente: si se corre dos veces, el resultado es el mismo
  }, log);
}
```

Reglas:
- **Idempotente**: puede reintentarse (si falla, se vuelve a ejecutar en el siguiente arranque).
- **Nunca** borrar ni reescribir datos de negocio sin aprobación; nada de `DROP`/`TRUNCATE`.
- No renombrar ni borrar tareas ya subidas: el nombre del archivo es su identificador.
- Si una tarea falla, las siguientes no corren hasta que se corrija (se respeta el orden); la API arranca igual
  y `/health` lo muestra.
