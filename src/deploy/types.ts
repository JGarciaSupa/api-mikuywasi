/** Contexto que recibe cada tarea de src/deploy-tasks. */
export interface DeployTaskContext {
  /** Escribe en el log del despliegue y en el registro de la tarea (master.deploy_tasks.output) */
  log: (msg: string) => void;
}
