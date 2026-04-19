import { db } from '../db';
import { refreshTokens } from '../db/schema';
import { or, eq, lt } from 'drizzle-orm';

/**
 * Elimina los refresh tokens que han sido revocados o que han expirado.
 */
export const cleanupRefreshTokens = async () => {
  const now = new Date();
  console.log(`[${now.toISOString()}] [Cleanup Job] Iniciando limpieza de tokens...`);
  
  try {
    const result = await db.delete(refreshTokens)
      .where(
        or(
          eq(refreshTokens.isRevoked, true),
          lt(refreshTokens.expiresAt, now)
        )
      );
    
    console.log(`[${new Date().toISOString()}] [Cleanup Job] Limpieza completada con éxito.`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [Cleanup Job] Error durante la limpieza:`, error);
  }
};

/**
 * Inicia el intervalo de limpieza cada 24 horas.
 */
export const startCleanupJob = () => {
  // Ejecutar una vez al iniciar el servidor
  cleanupRefreshTokens();

  // Programar para ejecutarse cada 24 horas
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(cleanupRefreshTokens, TWENTY_FOUR_HOURS);
  
  console.log('[Cleanup Job] Tarea de limpieza programada cada 24 horas.');
};
