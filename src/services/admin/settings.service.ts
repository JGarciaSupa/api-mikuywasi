import { db } from '../../db';
import { tenants, plans } from '../../db/schema';
import { eq } from 'drizzle-orm';
import type { UpdateSettingsInput } from '../../validations/admin/settings.validation';
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from '../../utils/s3';

const s3Client = getS3Client();
const BUCKET_NAME = process.env.R2_BUCKET!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

async function uploadToR2(file: File): Promise<string> {
  const fileExtension = file.name.split('.').pop();
  const fileName = `logos/${crypto.randomUUID()}.${fileExtension}`;
  const arrayBuffer = await file.arrayBuffer();

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: Buffer.from(arrayBuffer),
    ContentType: file.type,
  });

  await s3Client.send(command);
  return `${PUBLIC_URL}/${fileName}`;
}

async function deleteFromR2(url: string) {
  try {
    const key = url.replace(`${PUBLIC_URL}/`, '');
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error('Error deleting logo from R2:', error);
  }
}

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
  return tenant;
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
  return updatedTenant;
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
  if (tenant.logo && tenant.logo.includes(PUBLIC_URL)) {
    await deleteFromR2(tenant.logo);
  }

  const logoUrl = await uploadToR2(file);

  const [updatedTenant] = await db.update(tenants)
    .set({
      logo: logoUrl,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))
    .returning();

  return updatedTenant;
}
