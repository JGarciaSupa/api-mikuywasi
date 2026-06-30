import { brands } from '@/db/tenant/schema';
import { eq } from 'drizzle-orm';
import { uploadToR2, deleteFromR2, getImageUrl } from '@/utils/r2';
import { getTenantDb, getTenantId } from '@/utils/tenant-context';
import type { UpdateSettingsInput } from '@/core/tenant/validations/admin/config-local/settings.validation';
import { masterDb } from '@/db';
import { tenants } from '@/db/master/schema';
import { redis } from '@/utils/redis';

async function getFirstBrand(db: ReturnType<typeof getTenantDb>) {
  const [brand] = await db.select().from(brands).limit(1);
  if (!brand) throw new Error('No hay marca configurada para este tenant');
  return brand;
}

export async function getSettings() {
  const db = getTenantDb();
  const tenantId = getTenantId();

  const config = await getFirstBrand(db);

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

  const existing = await getFirstBrand(db);

  const { ownerName, ownerPhone, name, internalNotes, ...brandData } = data as any;

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

    if (name !== undefined) {
      const tenantMaster = await masterDb.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });
      if (tenantMaster?.slug) {
        await redis.del(`tenant:${tenantMaster.slug}`);
      }
    }
  }

  // Solo actualizar campos que existen en brands
  const brandUpdateFields: Record<string, any> = {};
  if (brandData.email !== undefined) brandUpdateFields.email = brandData.email;
  if (brandData.category !== undefined) brandUpdateFields.category = brandData.category;
  if (brandData.primaryColor !== undefined) brandUpdateFields.primaryColor = brandData.primaryColor;

  let updated = existing;
  if (Object.keys(brandUpdateFields).length > 0) {
    const [newUpdated] = await db
      .update(brands)
      .set({ ...brandUpdateFields, updatedAt: new Date() })
      .where(eq(brands.id, existing.id))
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
  const tenantId = getTenantId();

  const tenantMaster = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  const slug = tenantMaster?.slug!;
  const existing = await getFirstBrand(db);
  const oldLogo = existing.logo;

  const logoKey = await uploadToR2(file, `${slug}/logos`, 256);

  try {
    const [updated] = await db
      .update(brands)
      .set({ logo: logoKey, updatedAt: new Date() })
      .where(eq(brands.id, existing.id))
      .returning();

    if (oldLogo) {
      await deleteFromR2(oldLogo);
    }

    return { ...updated, logo: getImageUrl(updated.logo) };
  } catch (error) {
    await deleteFromR2(logoKey);
    throw error;
  }
}

export async function deleteLogo() {
  const db = getTenantDb();
  const existing = await getFirstBrand(db);
  const oldLogo = existing.logo;

  const [updated] = await db
    .update(brands)
    .set({ logo: null, updatedAt: new Date() })
    .where(eq(brands.id, existing.id))
    .returning();

  if (oldLogo) {
    await deleteFromR2(oldLogo);
  }

  return { ...updated, logo: getImageUrl(updated.logo) };
}
