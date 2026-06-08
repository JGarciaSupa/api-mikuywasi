import { products, categories } from '@/db/tenant/schema';
import { eq, and, ilike, desc, count, inArray, or, isNull } from 'drizzle-orm';
import { uploadToR2, deleteFromR2, getImageUrl } from '@/utils/r2';
import { getTenantDb, getTenantId } from '@/utils/tenant-context';
import { masterDb } from '@/db';
import { tenants } from '@/db/master/schema';

const MAX_SIZE = 500;

export const getAllProducts = async (
  page: number,
  limit: number,
  filters: { name?: string; categoryId?: number; branchId?: number }
) => {
  const db = getTenantDb();
  const offset = (page - 1) * limit;
  const whereClauses = [];

  if (filters.name) {
    whereClauses.push(ilike(products.name, `%${filters.name}%`));
  }
  if (filters.categoryId) {
    whereClauses.push(eq(products.categoryId, filters.categoryId));
  }
  if (filters.branchId) {
    const branchCategories = await db
      .select({ id: categories.id })
      .from(categories)
      .where(or(eq(categories.branchId, filters.branchId), isNull(categories.branchId)));

    const categoryIds = branchCategories.map(c => c.id);
    if (categoryIds.length > 0) {
      whereClauses.push(
        or(
          inArray(products.categoryId, categoryIds),
          isNull(products.categoryId)
        )
      );
    } else {
      whereClauses.push(isNull(products.categoryId));
    }
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
    data: data.map(product => ({
      ...product,
      image: getImageUrl(product.image)
    })),
    pagination: {
      total: totalResult.count,
      page,
      limit,
      totalPages: Math.ceil(totalResult.count / limit)
    }
  };
};

export const getProductById = async (id: number) => {
  const db = getTenantDb();
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) throw new Error('Producto no encontrado');

  return {
    ...product,
    image: getImageUrl(product.image)
  };
};

export const createProduct = async (data: any, imageFile?: File) => {
  const db = getTenantDb();
  const tenantId = getTenantId();
  // Verificar límite de 150 productos
  const [totalResult] = await db.select({ count: count() })
    .from(products);

  if (totalResult.count >= 150) {
    throw new Error('Solo se permite un máximo de 150 productos por tenant');
  }

  // Obtener el slug del tenant desde la base de datos master
  const tenantMaster = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  const tenantSlug = tenantMaster?.slug || 'general';

  let imageUrl = null;
  if (imageFile) {
    imageUrl = await uploadToR2(imageFile, `${tenantSlug}/productos`, MAX_SIZE);
  }

  const [newProduct] = await db.insert(products).values({
    ...data,
    image: imageUrl,
  }).returning();

  return {
    ...newProduct,
    image: getImageUrl(newProduct.image)
  };
};

export const updateProduct = async (id: number, data: any, imageFile?: File) => {
  const db = getTenantDb();
  const tenantId = getTenantId();
  const [existingProduct] = await db.select().from(products).where(eq(products.id, id));
  if (!existingProduct) throw new Error('Producto no encontrado');

  // Obtener el slug del tenant desde la base de datos master
  const tenantMaster = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  const tenantSlug = tenantMaster?.slug || 'general';

  let imageUrl = existingProduct.image;
  if (imageFile) {
    if (existingProduct.image) {
      await deleteFromR2(existingProduct.image);
    }
    imageUrl = await uploadToR2(imageFile, `${tenantSlug}/productos`, MAX_SIZE);
  }

  const [updatedProduct] = await db.update(products)
    .set({
      ...data,
      image: imageUrl,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning();

  return {
    ...updatedProduct,
    image: getImageUrl(updatedProduct.image)
  };
};

export const deleteProduct = async (id: number) => {
  const db = getTenantDb();
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) throw new Error('Producto no encontrado');

  if (product.image) {
    await deleteFromR2(product.image);
  }

  await db.delete(products).where(eq(products.id, id));
  return { success: true };
};
