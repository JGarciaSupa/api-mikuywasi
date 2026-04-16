import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "./s3";
import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";

const s3Client = getS3Client();
const BUCKET_NAME = process.env.R2_BUCKET!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

/**
 * Procesa una imagen: redimensiona proporcionalmente al máximo indicado y convierte a WebP.
 * Si la imagen ya es menor al máximo, solo convierte a WebP sin agrandarla.
 */
async function processImage(file: File, maxSize: number): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  const photonImage = PhotonImage.new_from_byteslice(new Uint8Array(arrayBuffer));
  
  const width = photonImage.get_width();
  const height = photonImage.get_height();
  
  let processedImage = photonImage;
  
  if (width > maxSize || height > maxSize) {
    const ratio = Math.min(maxSize / width, maxSize / height);
    const newWidth = Math.floor(width * ratio);
    const newHeight = Math.floor(height * ratio);
    processedImage = resize(photonImage, newWidth, newHeight, SamplingFilter.Lanczos3);
    photonImage.free();
  }
  
  const output = Buffer.from(processedImage.get_bytes_webp());
  processedImage.free();
  
  return output;
}

/**
 * Subir archivo a Cloudflare R2.
 * @param file    Archivo a subir
 * @param folder  Carpeta destino en el bucket
 * @param maxSize Si se provee, redimensiona proporcionalmente y convierte a WebP
 */
export async function uploadToR2(file: File, folder: string = "general", maxSize?: number): Promise<string> {
  let body: Buffer | ArrayBuffer;
  let contentType: string;
  let ext: string;

  if (maxSize) {
    body = await processImage(file, maxSize);
    contentType = 'image/webp';
    ext = 'webp';
  } else {
    body = Buffer.from(await file.arrayBuffer());
    contentType = file.type;
    ext = file.name.split('.').pop() || 'bin';
  }

  const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: body as Buffer,
    ContentType: contentType,
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

