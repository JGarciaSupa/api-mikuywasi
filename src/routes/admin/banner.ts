import { Hono } from "hono";
import { db } from "../../db";
import { adminAuthMiddleware } from "../../middleware/auth";
import { eq, and, asc } from "drizzle-orm";
import { banners } from "../../db/schema";
import { uploadToR2, deleteFromR2 } from "../../utils/s3";
import { Buffer } from 'node:buffer'; // Required for converting File to Buffer

const routes = new Hono<{ Variables: { tenantId: number } }>();

routes.use('*', adminAuthMiddleware);

// Helper function to handle R2 upload and UUID generation
async function processBannerUpload(file: File) {
  try {
    const ext = file.name.split('.').pop() || 'png';
    const uuid = crypto.randomUUID();
    const finalFileName = `${uuid}.${ext}`;
    const key = `banners/${finalFileName}`;
    
    console.log("Banners: Generando buffer para archivo:", file.name);
    // Convert File to Buffer for R2 upload (Bun version)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log("Banners: Subiendo a R2 con key:", key);
    const publicUrl = await uploadToR2(key, buffer, file.type);
    
    return { finalFileName, publicUrl };
  } catch (err) {
    console.error("Error en processBannerUpload:", err);
    throw err;
  }
}

// Get all banners for the tenant
routes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  const tenantBanners = await db.query.banners.findMany({
    where: eq(banners.tenantId, tenantId),
    orderBy: [asc(banners.order)],
  });

  // Construct full public URL for each banner
  const publicUrlBase = process.env.R2_PUBLIC_URL;
  const mappedBanners = tenantBanners.map(b => ({
    ...b,
    url: `${publicUrlBase}/banners/${b.url}`
  }));

  return c.json(mappedBanners);
});

// Create a new banner using multipart/form-data
routes.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  console.log("Iniciando POST / con tenantId:", tenantId);
  
  try {
    const body = await c.req.parseBody();
    console.log("Body parseado:", Object.keys(body));
    
    const file = body.file as unknown as File;
    const order = parseInt(body.order as string) || 0;

    if (!file) {
      console.log("Error: Archivo no proporcionado");
      return c.json({ error: "Archivo no proporcionado" }, 400);
    }

    // Validation: Max 3 banners per tenant
    const existingBanners = await db.query.banners.findMany({
      where: eq(banners.tenantId, tenantId),
    });

    if (existingBanners.length >= 3) {
      console.log("Error: Límite de 3 banners alcanzado");
      return c.json({ error: "Límite de 3 banners alcanzado" }, 400);
    }

    console.log("Procesando upload a R2...");
    const { finalFileName, publicUrl } = await processBannerUpload(file);
    console.log("Upload exitoso a R2. Key:", finalFileName);
    
    const [newBanner] = await db.insert(banners).values({
      tenantId,
      url: finalFileName,
      order,
    }).returning();

    return c.json({
      ...newBanner,
      url: publicUrl
    }, 201);
  } catch (error) {
    console.error("Error crítico en POST /banner:", error);
    return c.json({ 
      error: "Error interno del servidor", 
      details: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

// Reorder banners
routes.put('/reorder', async (c) => {
  const tenantId = c.get('tenantId');

  const body = await c.req.json<{ items: { id: number; order: number }[] }>();
  const { items } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: "items requerido" }, 400);
  }

  const OFFSET = 100; // Temporary offset to avoid unique constraint collisions

  await db.transaction(async (tx) => {
    // Pass 1: set temporary high values to free up the slots
    for (const item of items) {
      await tx.update(banners)
        .set({ order: item.order + OFFSET })
        .where(and(eq(banners.id, item.id), eq(banners.tenantId, tenantId)));
    }
    // Pass 2: set the final values
    for (const item of items) {
      await tx.update(banners)
        .set({ order: item.order })
        .where(and(eq(banners.id, item.id), eq(banners.tenantId, tenantId)));
    }
  });

  return c.json({ success: true });
});

routes.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = parseInt(c.req.param('id'));
  const body = await c.req.parseBody();
  const file = body.file as unknown as File;
  const order = body.order ? parseInt(body.order as string) : undefined;

  // Fetch existing banner to get the old filename
  const existing = await db.query.banners.findFirst({
    where: and(eq(banners.id, id), eq(banners.tenantId, tenantId)),
  });

  if (!existing) {
    return c.json({ error: "Banner no encontrado" }, 404);
  }

  let finalFileName: string | undefined;
  let publicUrl: string | undefined;

  if (file) {
    // Delete old file from R2 before uploading new one
    try {
      await deleteFromR2(`banners/${existing.url}`);
      console.log("Banners: Imagen anterior eliminada de R2:", existing.url);
    } catch (err) {
      console.warn("Banners: No se pudo eliminar imagen anterior de R2:", err);
    }

    const upload = await processBannerUpload(file);
    finalFileName = upload.finalFileName;
    publicUrl = upload.publicUrl;
  }

  const [updatedBanner] = await db.update(banners)
    .set({ 
      ...(finalFileName && { url: finalFileName }), 
      ...(order !== undefined && { order }) 
    })
    .where(and(eq(banners.id, id), eq(banners.tenantId, tenantId)))
    .returning();

  return c.json({
    ...updatedBanner,
    url: publicUrl || `${process.env.R2_PUBLIC_URL}/banners/${updatedBanner.url}`
  });
});

// Delete a banner
routes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = parseInt(c.req.param('id'));

  const [deletedBanner] = await db.delete(banners)
    .where(and(eq(banners.id, id), eq(banners.tenantId, tenantId)))
    .returning();

  if (!deletedBanner) {
    return c.json({ error: "Banner not found" }, 404);
  }

  // Delete file from R2
  try {
    await deleteFromR2(`banners/${deletedBanner.url}`);
    console.log("Banners: Imagen eliminada de R2:", deletedBanner.url);
  } catch (err) {
    console.warn("Banners: No se pudo eliminar imagen de R2:", err);
  }

  return c.json({ success: true });
});

export default routes;
