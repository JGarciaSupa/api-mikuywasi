import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "./s3";

const s3Client = getS3Client();
const BUCKET_NAME = process.env.R2_BUCKET!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

/**
 * Subir archivo a Cloudflare R2
 */
export async function uploadToR2(file: File, folder: string = "general"): Promise<string> {
  const fileExtension = file.name.split('.').pop() || 'png';
  const fileName = `${folder}/${crypto.randomUUID()}.${fileExtension}`;
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

/**
 * Eliminar archivo de Cloudflare R2
 */
export async function deleteFromR2(url: string) {
  if (!url || !url.startsWith(PUBLIC_URL)) return;
  
  try {
    const key = url.replace(`${PUBLIC_URL}/`, '');
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error('Error deleting from R2:', error);
  }
}
