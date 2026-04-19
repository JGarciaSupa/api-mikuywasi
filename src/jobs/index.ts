import { startCleanupJob } from './cleanup-tokens';

/**
 * Inicializa todas las tareas en segundo plano (jobs).
 * Este es el punto central para registrar nuevos jobs en el futuro.
 */
export const initJobs = () => {
  console.log('[Jobs] Inicializando tareas en segundo plano...');
  
  // Registrar el job de limpieza de tokens
  startCleanupJob();
  
  // Aquí se pueden agregar más jobs en el futuro
  // Example: startAnotherJob();
};
