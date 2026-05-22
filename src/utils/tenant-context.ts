import { AsyncLocalStorage } from 'async_hooks';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as tenantSchema from '../db/tenant/schema';

export type TenantDb = NodePgDatabase<typeof tenantSchema>;

interface TenantContext {
  tenantId: number;
  tenantDb: TenantDb;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext {
  const context = tenantStorage.getStore();
  if (!context) {
    throw new Error('Tenant context no está disponible. Asegúrate de que el middleware de contexto esté configurado.');
  }
  return context;
}

export function getTenantDb() {
  return getTenantContext().tenantDb;
}

export function getTenantId() {
  return getTenantContext().tenantId;
}

export function runWithTenantContext<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(context, fn);
}
