import { db } from '../../db';
import { tenants } from '../../db/schema';
import { eq } from 'drizzle-orm';
import type { UpdateSettingsInput } from '../../validations/admin/settings.validation';
import { uploadToR2, deleteFromR2, getImageUrl } from '../../utils/r2';

/**
 * Obtener configuración del tenant
 */
export async function getSettings(tenantId: number) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    with: {
      plan: true,
    }
  });

  if (!tenant) throw new Error('Tenant no encontrado');
  
  return {
    ...tenant,
    logo: getImageUrl(tenant.logo)
  };
}

/**
 * Actualizar configuración del tenant
 */
export async function updateSettings(tenantId: number, data: UpdateSettingsInput) {
  const [updatedTenant] = await db.update(tenants)
    .set({
      ...data,
      updatedAt: new Date(),
    } as any)
    .where(eq(tenants.id, tenantId))
    .returning();

  if (!updatedTenant) throw new Error('Tenant no encontrado');
  
  return {
    ...updatedTenant,
    logo: getImageUrl(updatedTenant.logo)
  };
}

/**
 * Actualizar logo del tenant
 */
export async function updateLogo(tenantId: number, file: File) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId)
  });

  if (!tenant) throw new Error('Tenant no encontrado');

  // Si ya tiene un logo, lo eliminamos de R2
  if (tenant.logo) {
    await deleteFromR2(tenant.logo);
  }

  const logoKey = await uploadToR2(file, "logos", 256);

  const [updatedTenant] = await db.update(tenants)
    .set({
      logo: logoKey,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))
    .returning();

  return {
    ...updatedTenant,
    logo: getImageUrl(updatedTenant.logo)
  };
}

/**
 * Eliminar logo del tenant
 */
export async function deleteLogo(tenantId: number) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId)
  });

  if (!tenant) throw new Error('Tenant no encontrado');

  if (tenant.logo) {
    await deleteFromR2(tenant.logo);
  }

  const [updatedTenant] = await db.update(tenants)
    .set({
      logo: null,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))
    .returning();

  return {
    ...updatedTenant,
    logo: getImageUrl(updatedTenant.logo)
  };
}
