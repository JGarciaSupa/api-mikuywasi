import { getS3Client } from "./s3";
import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";

const s3Client = getS3Client();
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

/**
 * Construye la URL pública de una imagen.
 * Si ya es una URL completa (empieza por http), la devuelve tal cual.
 * De lo contrario, le añade el prefijo de la URL pública.
 */
export function getImageUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.startsWith('http')) return key;
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Procesa una imagen: redimensiona proporcionalmente al máximo indicado y convierte a WebP.
 * Si la imagen ya es menor al máximo, solo convierte a WebP sin agrandarla.
 */
async function processImage(file: File, maxSize: number): Promise<Buffer> {
  /*
  // NOTA: Se comenta el uso de Bun.Image debido a que el VPS no cuenta con soporte AVX en su CPU
  // y Bun.Image lanza un crash (Segmentation fault).
  // Se mantiene esta implementación comentada como referencia para cuando el VPS sea actualizado o soporte AVX.
  const image = new Bun.Image(file);
  const metadata = await image.metadata();

  console.log(`[processImage] Original dimensions: ${metadata.width}x${metadata.height}, maxSize: ${maxSize}`);

  let pipeline = image;

  if (metadata.width > maxSize || metadata.height > maxSize) {
    console.log(`[processImage] Resizing to fit inside: ${maxSize}x${maxSize}`);
    pipeline = pipeline.resize(maxSize, maxSize, { fit: "inside" });
  }

  const output = await pipeline.webp({ quality: 80 }).buffer();
  console.log(`[processImage] WebP conversion complete. Output size: ${output.length} bytes`);

  return output;
  */

  // Implementación alternativa usando @cf-wasm/photon (basado en WebAssembly, compatible con CPU sin AVX)
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const inputImage = PhotonImage.new_from_byteslice(bytes);
  const width = inputImage.get_width();
  const height = inputImage.get_height();

  console.log(`[processImage] [WASM] Original dimensions: ${width}x${height}, maxSize: ${maxSize}`);

  let outputImage = inputImage;

  if (width > maxSize || height > maxSize) {
    let newWidth = width;
    let newHeight = height;

    if (width > height) {
      newWidth = maxSize;
      newHeight = Math.round((height * maxSize) / width);
    } else {
      newHeight = maxSize;
      newWidth = Math.round((width * maxSize) / height);
    }

    console.log(`[processImage] [WASM] Resizing to: ${newWidth}x${newHeight}`);
    outputImage = resize(inputImage, newWidth, newHeight, SamplingFilter.Lanczos3);
  }

  const outputBytes = outputImage.get_bytes_webp();
  console.log(`[processImage] [WASM] WebP conversion complete. Output size: ${outputBytes.length} bytes`);

  // Liberar memoria WASM para evitar fugas de memoria (Memory Leaks)
  if (outputImage !== inputImage) {
    outputImage.free();
  }
  inputImage.free();

  return Buffer.from(outputBytes);
}

/**
 * Subir archivo a Cloudflare R2.
 * @param file    Archivo a subir
 * @param folder  Carpeta destino en el bucket
 * @param maxSize Si se provee, redimensiona proporcionalmente y convierte a WebP
 * @returns       El path (key) del archivo en el bucket
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

  await s3Client.write(fileName, body, { type: contentType });
  return fileName;
}

/**
 * Eliminar archivo de Cloudflare R2.
 * Acepta tanto el key como la URL completa.
 */
export async function deleteFromR2(keyOrUrl: string | null | undefined) {
  if (!keyOrUrl) return;

  try {
    const key = keyOrUrl.startsWith('http')
      ? keyOrUrl.replace(`${PUBLIC_URL}/`, '')
      : keyOrUrl;

    await s3Client.delete(key);
  } catch (error) {
    console.error('Error deleting from R2:', error);
  }
}

