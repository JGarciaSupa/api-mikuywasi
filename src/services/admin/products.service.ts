import { db } from '../../db';
import { products } from '../../db/schema';
import { eq, and, ilike, desc, count } from 'drizzle-orm';
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from '../../utils/s3';
// import * as sharpLib from 'sharp';
// const sharp = (sharpLib as any).default ?? sharpLib;

const s3Client = getS3Client();

const BUCKET_NAME = process.env.R2_BUCKET!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

const MAX_SIZE = 500;

// async function processImage(file: File): Promise<Buffer> {
//   const arrayBuffer = await file.arrayBuffer();
//   const inputBuffer = Buffer.from(arrayBuffer);
// 
//   return sharp(inputBuffer)
//     .resize(MAX_SIZE, MAX_SIZE, {
//       fit: 'inside',        // mantiene proporción, nunca supera 500 en ninguna dimensión
//       withoutEnlargement: true, // si ya es menor a 500x500, no la agranda
//     })
//     .webp({ quality: 85 })
//     .toBuffer();
// }

async function uploadToR2(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin';
  const fileName = `products/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: buffer,
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
    console.error('Error deleting from R2:', error);
  }
}

export const getAllProducts = async (
  page: number, 
  limit: number, 
  filters: { name?: string; categoryId?: number; tenantId?: number }
) => {
  const offset = (page - 1) * limit;
  const whereClauses = [];

  if (filters.tenantId) {
    whereClauses.push(eq(products.tenantId, filters.tenantId));
  }
  if (filters.name) {
    whereClauses.push(ilike(products.name, `%${filters.name}%`));
  }
  if (filters.categoryId) {
    whereClauses.push(eq(products.categoryId, filters.categoryId));
  }

  const where = whereClauses.length > 0 ? and(...whereClauses) : undefined;

  const [totalResult] = await db.select({ count: count() }).from(products).where(where);
  const data = await db.select()
    .from(products)
    .where(where)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(products.createdAt));

  return {
    data,
    pagination: {
      total: totalResult.count,
      page,
      limit,
      totalPages: Math.ceil(totalResult.count / limit)
    }
  };
};

export const getProductById = async (id: number) => {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) throw new Error('Producto no encontrado');
  return product;
};

export const createProduct = async (data: any, imageFile?: File) => {
  // Verificar límite de 150 productos
  const [totalResult] = await db.select({ count: count() })
    .from(products)
    .where(eq(products.tenantId, data.tenantId));

  if (totalResult.count >= 150) {
    throw new Error('Solo se permite un máximo de 150 productos por tenant');
  }

  let imageUrl = null;
  if (imageFile) {
    imageUrl = await uploadToR2(imageFile);
  }

  const [newProduct] = await db.insert(products).values({
    ...data,
    image: imageUrl,
  }).returning();

  return newProduct;
};

export const updateProduct = async (id: number, data: any, imageFile?: File) => {
  const [existingProduct] = await db.select().from(products).where(eq(products.id, id));
  if (!existingProduct) throw new Error('Producto no encontrado');

  let imageUrl = existingProduct.image;
  if (imageFile) {
    if (existingProduct.image) {
      await deleteFromR2(existingProduct.image);
    }
    imageUrl = await uploadToR2(imageFile);
  }

  const [updatedProduct] = await db.update(products)
    .set({
      ...data,
      image: imageUrl,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning();

  return updatedProduct;
};

export const deleteProduct = async (id: number) => {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) throw new Error('Producto no encontrado');

  if (product.image) {
    await deleteFromR2(product.image);
  }

  await db.delete(products).where(eq(products.id, id));
  return { success: true };
};
