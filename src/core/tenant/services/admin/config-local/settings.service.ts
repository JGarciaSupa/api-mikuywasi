import { tenantConfigs } from '@/db/tenant/schema';
import { eq } from 'drizzle-orm';
import { uploadToR2, deleteFromR2, getImageUrl } from '@/utils/r2';
import { getTenantDb } from '@/utils/tenant-context';
import { UpdateSettingsInput } from '@/core/tenant/validations/admin/config-local/settings.validation';

export async function getSettings() {
  const db = getTenantDb();
  let [config] = await db.select().from(tenantConfigs);
  if (!config) {
    [config] = await db.insert(tenantConfigs).values({}).returning();
  }
  return {
    ...config,
    logo: getImageUrl(config.logo),
  };
}

export async function updateSettings(data: UpdateSettingsInput) {
  const db = getTenantDb();
  let [existing] = await db.select().from(tenantConfigs);
  if (!existing) {
    [existing] = await db.insert(tenantConfigs).values({}).returning();
  }

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
  let [existing] = await db.select().from(tenantConfigs);
  if (!existing) {
    [existing] = await db.insert(tenantConfigs).values({}).returning();
  }

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
  let [existing] = await db.select().from(tenantConfigs);
  if (!existing) {
    [existing] = await db.insert(tenantConfigs).values({}).returning();
  }

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
