import { masterDb } from '../../../db';
import { dbServers } from '../../../db/master/schema';
import { eq } from 'drizzle-orm';
import type { CreateDbServerInput, UpdateDbServerInput } from '../validations/db-servers.validation';

export const getAllDbServers = async () => {
  return masterDb.query.dbServers.findMany({
    orderBy: (s, { asc }) => [asc(s.name)],
  });
};

export const getDbServerById = async (id: number) => {
  const server = await masterDb.query.dbServers.findFirst({
    where: eq(dbServers.id, id),
    with: { tenants: true },
  });
  if (!server) throw new Error('Servidor no encontrado');
  return server;
};

export const createDbServer = async (data: CreateDbServerInput) => {
  const existing = await masterDb.query.dbServers.findFirst({
    where: eq(dbServers.name, data.name),
  });
  if (existing) throw new Error('Ya existe un servidor con ese nombre');

  const [newServer] = await masterDb.insert(dbServers).values({
    ...data,
    currentTenants: 0,
    updatedAt: new Date(),
  }).returning();

  return newServer;
};

export const updateDbServer = async (id: number, data: UpdateDbServerInput) => {
  const [updated] = await masterDb.update(dbServers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(dbServers.id, id))
    .returning();

  if (!updated) throw new Error('Servidor no encontrado');
  return updated;
};

export const deleteDbServer = async (id: number) => {
  const server = await masterDb.query.dbServers.findFirst({
    where: eq(dbServers.id, id),
    with: { tenants: true },
  });

  if (!server) throw new Error('Servidor no encontrado');
  if (server.tenants.length > 0) {
    throw new Error(`No se puede eliminar: el servidor tiene ${server.tenants.length} tenant(s) asignado(s)`);
  }

  const [deleted] = await masterDb.delete(dbServers)
    .where(eq(dbServers.id, id))
    .returning();

  return { message: 'Servidor eliminado correctamente' };
};
