import { and, eq, ne, sql } from 'drizzle-orm';
import * as tenantSchema from '../../../db/tenant/schema';
import { getImageUrl } from '../../../utils/r2';
import { getTenantDatabaseInstance } from './tenants.service';
import type {
  CreateTenantBrandInput,
  UpdateTenantBrandInput,
  CreateTenantBranchInput,
  UpdateTenantBranchInput,
} from '../validations/tenant-structure.validation';

const { brands, branches } = tenantSchema;

function mapBrand(brand: typeof brands.$inferSelect) {
  return { ...brand, logo: getImageUrl(brand.logo) };
}

// ── ESTRUCTURA COMPLETA (MARCAS + SUCURSALES) ────────────────────────────────

export const getTenantStructure = async (tenantId: number) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const [allBrands, allBranches] = await Promise.all([
    db.select().from(brands).orderBy(brands.createdAt),
    db.select().from(branches).orderBy(branches.createdAt),
  ]);

  return allBrands.map((brand) => ({
    ...mapBrand(brand),
    branches: allBranches.filter((branch) => branch.brandId === brand.id),
  }));
};

// ── MARCAS ───────────────────────────────────────────────────────────────────

export const createTenantBrand = async (tenantId: number, data: CreateTenantBrandInput) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const code = data.code.toUpperCase();
  const [existing] = await db.select({ id: brands.id }).from(brands).where(eq(brands.code, code));
  if (existing) throw new Error(`Ya existe una marca con el código "${code}"`);

  const [created] = await db.insert(brands).values({
    name: data.name,
    code,
    email: data.email ?? null,
    category: data.category ?? null,
    primaryColor: data.primaryColor ?? '#000000',
    isActive: data.isActive ?? true,
  }).returning();

  return mapBrand(created);
};

export const updateTenantBrand = async (tenantId: number, brandId: number, data: UpdateTenantBrandInput) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const [existing] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!existing) throw new Error('Marca no encontrada');

  if (data.code) {
    const code = data.code.toUpperCase();
    const [taken] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.code, code), ne(brands.id, brandId)));
    if (taken) throw new Error(`Ya existe una marca con el código "${code}"`);
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code.toUpperCase();
  if (data.email !== undefined) updateData.email = data.email ?? null;
  if (data.category !== undefined) updateData.category = data.category ?? null;
  if (data.primaryColor !== undefined) updateData.primaryColor = data.primaryColor ?? null;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const [updated] = await db.update(brands).set(updateData).where(eq(brands.id, brandId)).returning();
  return mapBrand(updated);
};

export const deleteTenantBrand = async (tenantId: number, brandId: number) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const [existing] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!existing) throw new Error('Marca no encontrada');

  const [{ count: brandCount }] = await db.select({ count: sql<number>`count(*)` }).from(brands);
  if (Number(brandCount) <= 1) {
    throw new Error('No se puede eliminar la única marca del negocio');
  }

  const [{ count: branchCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(branches)
    .where(eq(branches.brandId, brandId));
  if (Number(branchCount) > 0) {
    throw new Error('No se puede eliminar una marca que tiene sucursales. Elimina o reasigna sus sucursales primero.');
  }

  await db.delete(brands).where(eq(brands.id, brandId));
  return { message: 'Marca eliminada correctamente' };
};

// ── SUCURSALES ───────────────────────────────────────────────────────────────

// Convierte strings vacíos a null (PostgreSQL no acepta '' en columnas nullable)
function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  return value;
}

export const createTenantBranch = async (tenantId: number, data: CreateTenantBranchInput) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, data.brandId));
  if (!brand) throw new Error('La marca seleccionada no existe');

  const [existing] = await db.select({ id: branches.id }).from(branches).where(eq(branches.code, data.code));
  if (existing) throw new Error(`Ya existe una sucursal con el código "${data.code}"`);

  // Si es la primera sucursal, hacerla principal automáticamente
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(branches);
  const isMain = Number(countResult?.count || 0) === 0 ? true : (data.isMain ?? false);

  return db.transaction(async (tx) => {
    if (isMain) {
      await tx.update(branches)
        .set({ isMain: false, updatedAt: new Date() })
        .where(eq(branches.isMain, true));
    }

    const [created] = await tx.insert(branches).values({
      brandId: data.brandId,
      name: data.name,
      code: data.code,
      isMain,
      isActive: data.isActive ?? true,
      countryCode: data.countryCode ?? null,
      address: data.address ?? null,
      phone: emptyToNull(data.phone),
      whatsapp: emptyToNull(data.whatsapp),
      email: emptyToNull(data.email),
    }).returning();

    return created;
  });
};

export const updateTenantBranch = async (tenantId: number, branchId: number, data: UpdateTenantBranchInput) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const [existing] = await db.select().from(branches).where(eq(branches.id, branchId));
  if (!existing) throw new Error('Sucursal no encontrada');

  if (data.brandId !== undefined) {
    const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, data.brandId));
    if (!brand) throw new Error('La marca seleccionada no existe');
  }

  if (data.code) {
    const [taken] = await db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.code, data.code), ne(branches.id, branchId)));
    if (taken) throw new Error(`Ya existe una sucursal con el código "${data.code}"`);
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (data.brandId !== undefined) updateData.brandId = data.brandId;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.isMain !== undefined) updateData.isMain = data.isMain;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.address !== undefined) updateData.address = data.address ?? null;
  if (data.countryCode !== undefined) updateData.countryCode = data.countryCode ?? null;
  if (data.phone !== undefined) updateData.phone = emptyToNull(data.phone);
  if (data.whatsapp !== undefined) updateData.whatsapp = emptyToNull(data.whatsapp);
  if (data.email !== undefined) updateData.email = emptyToNull(data.email);

  return db.transaction(async (tx) => {
    if (data.isMain === true) {
      // Solo puede haber una sucursal principal a la vez
      await tx.update(branches)
        .set({ isMain: false, updatedAt: new Date() })
        .where(and(eq(branches.isMain, true), ne(branches.id, branchId)));
    } else if (data.isMain === false && existing.isMain) {
      throw new Error('Debe haber al menos una sucursal principal. Marca otra sucursal como principal para reemplazarla.');
    }

    const [updated] = await tx.update(branches)
      .set(updateData)
      .where(eq(branches.id, branchId))
      .returning();

    return updated;
  });
};

export const deleteTenantBranch = async (tenantId: number, branchId: number) => {
  const db = await getTenantDatabaseInstance(tenantId);

  const [existing] = await db.select().from(branches).where(eq(branches.id, branchId));
  if (!existing) throw new Error('Sucursal no encontrada');
  if (existing.isMain) throw new Error('No se puede eliminar la sucursal principal');

  await db.delete(branches).where(eq(branches.id, branchId));
  return { message: 'Sucursal eliminada correctamente' };
};
