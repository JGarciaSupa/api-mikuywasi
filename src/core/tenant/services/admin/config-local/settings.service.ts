import { tenantConfigs } from '@/db/tenant/schema';
import { eq } from 'drizzle-orm';
import { uploadToR2, deleteFromR2, getImageUrl } from '@/utils/r2';
import { getTenantDb, getTenantId } from '@/utils/tenant-context';
import { UpdateSettingsInput } from '@/core/tenant/validations/admin/config-local/settings.validation';
import { masterDb } from '@/db';
import { tenants } from '@/db/master/schema';
import { redis } from '@/utils/redis';

export async function getSettings() {
  const db = getTenantDb();
  const tenantId = getTenantId();

  let [config] = await db.select().from(tenantConfigs);
  if (!config) {
    [config] = await db.insert(tenantConfigs).values({}).returning();
  }

  const tenantMaster = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    with: { plan: true },
  });

  return {
    ...config,
    logo: getImageUrl(config.logo),
    slug: tenantMaster?.slug || "",
    name: tenantMaster?.name || "",
    status: tenantMaster?.status || "active",
    planStartsAt: tenantMaster?.planStartsAt ? tenantMaster.planStartsAt.toISOString() : null,
    planEndsAt: tenantMaster?.planEndsAt ? tenantMaster.planEndsAt.toISOString() : null,
    billingCycle: tenantMaster?.billingCycle || null,
    ownerName: tenantMaster?.ownerName || "",
    ownerPhone: tenantMaster?.ownerPhone || "",
    internalNotes: tenantMaster?.internalNotes || "",
    planId: tenantMaster?.planId || null,
    plan: tenantMaster?.plan ? { id: tenantMaster.plan.id, name: tenantMaster.plan.name } : undefined,
  };
}

export async function updateSettings(data: UpdateSettingsInput) {
  const db = getTenantDb();
  const tenantId = getTenantId();

  let [existing] = await db.select().from(tenantConfigs);
  if (!existing) {
    [existing] = await db.insert(tenantConfigs).values({}).returning();
  }

  const { ownerName, ownerPhone, name, internalNotes, ...tenantConfigData } = data as any;

  // Actualizar Master DB si corresponde
  const masterUpdateData: any = {};
  if (ownerName !== undefined) masterUpdateData.ownerName = ownerName;
  if (ownerPhone !== undefined) masterUpdateData.ownerPhone = ownerPhone;
  if (name !== undefined) masterUpdateData.name = name;
  if (internalNotes !== undefined) masterUpdateData.internalNotes = internalNotes;

  if (Object.keys(masterUpdateData).length > 0) {
    await masterDb
      .update(tenants)
      .set({ ...masterUpdateData, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));

    // Si se actualizó el nombre, invalidar el cache en Redis
    if (name !== undefined) {
      const tenantMaster = await masterDb.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });
      if (tenantMaster?.slug) {
        await redis.del(`tenant:${tenantMaster.slug}`);
      }
    }
  }

  // Actualizar Tenant DB (tenantConfigs) con el resto de campos si los hay
  let updated = existing;
  if (Object.keys(tenantConfigData).length > 0) {
    const [newUpdated] = await db
      .update(tenantConfigs)
      .set({ ...tenantConfigData, updatedAt: new Date() })
      .where(eq(tenantConfigs.id, existing.id))
      .returning();
    updated = newUpdated;
  }

  const tenantMaster = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    with: { plan: true },
  });

  return {
    ...updated,
    logo: getImageUrl(updated.logo),
    slug: tenantMaster?.slug || "",
    name: tenantMaster?.name || "",
    status: tenantMaster?.status || "active",
    planStartsAt: tenantMaster?.planStartsAt ? tenantMaster.planStartsAt.toISOString() : null,
    planEndsAt: tenantMaster?.planEndsAt ? tenantMaster.planEndsAt.toISOString() : null,
    billingCycle: tenantMaster?.billingCycle || null,
    ownerName: tenantMaster?.ownerName || "",
    ownerPhone: tenantMaster?.ownerPhone || "",
    internalNotes: tenantMaster?.internalNotes || "",
    planId: tenantMaster?.planId || null,
    plan: tenantMaster?.plan ? { id: tenantMaster.plan.id, name: tenantMaster.plan.name } : undefined,
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
