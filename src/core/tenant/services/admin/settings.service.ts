import { tenantConfigs } from '../../../../db/tenant/schema';
import { eq } from 'drizzle-orm';
import type { UpdateSettingsInput } from '../../validations/admin/settings.validation';
import { uploadToR2, deleteFromR2, getImageUrl } from '../../../../utils/r2';
import { getTenantDb } from '../../../../utils/tenant-context';

export async function getSettings() {
  const db = getTenantDb();
  const [config] = await db.select().from(tenantConfigs);
  if (!config) throw new Error('Configuración no encontrada');

  return {
    ...config,
    logo: getImageUrl(config.logo)
  };
}

export async function updateSettings(data: UpdateSettingsInput) {
  const db = getTenantDb();
  const [existing] = await db.select().from(tenantConfigs);
  if (!existing) throw new Error('Configuración no encontrada');

  const [updated] = await db
    .update(tenantConfigs)
    .set({ ...data as any, updatedAt: new Date() })
    .where(eq(tenantConfigs.id, existing.id))
    .returning();

  return {
    ...updated,
    logo: getImageUrl(updated.logo)
  };
}

export async function updateLogo(file: File) {
  const db = getTenantDb();
  const [existing] = await db.select().from(tenantConfigs);
  if (!existing) throw new Error('Configuración no encontrada');

  if (existing.logo) {
    await deleteFromR2(existing.logo);
  }

  const logoKey = await uploadToR2(file, 'logos', 256);

  const [updated] = await db
    .update(tenantConfigs)
    .set({ logo: logoKey, updatedAt: new Date() })
    .where(eq(tenantConfigs.id, existing.id))
    .returning();

  return {
    ...updated,
    logo: getImageUrl(updated.logo)
  };
}

export async function deleteLogo() {
  const db = getTenantDb();
  const [existing] = await db.select().from(tenantConfigs);
  if (!existing) throw new Error('Configuración no encontrada');

  if (existing.logo) {
    await deleteFromR2(existing.logo);
  }

  const [updated] = await db
    .update(tenantConfigs)
    .set({ logo: null, updatedAt: new Date() })
    .where(eq(tenantConfigs.id, existing.id))
    .returning();

  return {
    ...updated,
    logo: getImageUrl(updated.logo)
  };
}
