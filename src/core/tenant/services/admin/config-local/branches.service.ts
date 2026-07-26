import { branches, userBranches, salesChannels } from '@/db/tenant/schema';
import { eq, sql, and, or, isNull } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';

type BranchTaxConfig = {
  key: string;
  label: string;
  rate: number;
  defaultActive: boolean;
  isActive: boolean;
};

const DEFAULT_BRANCH_TAXES: BranchTaxConfig[] = [
  { key: 'impuesto_1', label: 'Aplica Impuesto 1', rate: 18, defaultActive: true, isActive: true },
  { key: 'impuesto_2', label: 'Aplica Impuesto 2', rate: 0, defaultActive: false, isActive: false },
  { key: 'impuesto_3', label: 'Aplica Impuesto 3', rate: 0, defaultActive: false, isActive: false },
  { key: 'icbper', label: 'Aplica ICBPER', rate: 0.5, defaultActive: false, isActive: false },
];

// ────────────────────────────────────────────
// CANALES DE VENTA ACTIVOS DE UNA SUCURSAL
// ────────────────────────────────────────────
// Trae el catálogo completo del tenant, marcando cuáles están activos en esta sede.
// Reemplaza los booleanos fijos hasDineIn/hasDelivery/hasPickup del formulario viejo.

// Canales visibles en esta sucursal: los propios de la sede (branchId = id) más los
// globales del catálogo corporativo (branchId null). Presencia en la lista = activo.
async function getBranchChannels(branchId: number) {
  const db = getTenantDb();

  return db
    .select()
    .from(salesChannels)
    .where(and(
      or(eq(salesChannels.branchId, branchId), isNull(salesChannels.branchId)),
      eq(salesChannels.isActive, true),
    ))
    .orderBy(salesChannels.name);
}

function normalizeBranchTaxes(taxes?: BranchTaxConfig[]) {
  const source = taxes?.length ? taxes : DEFAULT_BRANCH_TAXES;
  const byKey = new Map(source.map((tax) => [tax.key, tax]));
  return DEFAULT_BRANCH_TAXES.map((base) => {
    const tax = byKey.get(base.key);
    if (!tax) return base;
    return {
      key: tax.key || base.key,
      label: tax.label || base.label,
      rate: Number.isFinite(Number(tax.rate)) ? Number(tax.rate) : base.rate,
      defaultActive: tax.defaultActive ?? base.defaultActive,
      isActive: tax.isActive ?? tax.defaultActive ?? base.isActive,
    };
  });
}

// ────────────────────────────────────────────
// LISTAR SUCURSALES
// ────────────────────────────────────────────

export async function getAllBranches() {
  const db = getTenantDb();
  return db.select().from(branches).orderBy(branches.createdAt);
}

// ────────────────────────────────────────────
// OBTENER SUCURSAL POR ID
// ────────────────────────────────────────────

export async function getBranchById(id: number) {
  const db = getTenantDb();
  const [branch] = await db.select().from(branches).where(eq(branches.id, id));
  if (!branch) return branch;

  const channels = await getBranchChannels(id);
  return {
    ...branch,
    taxes: normalizeBranchTaxes((branch as any).taxes ?? undefined),
    channels,
  };
}

// ────────────────────────────────────────────
// CREAR SUCURSAL
// ────────────────────────────────────────────

export interface CreateBranchInput {
  brandId: number;
  name: string;
  code: string;
  countryCode?: string | null;
  baseCurrency?: string | null;
  foreignCurrency?: string | null;
  isMain?: boolean;
  isActive?: boolean;
  address?: {
    fullAddress: string;
    lat: number;
    lng: number;
  } | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  hasDelivery?: boolean;
  hasPickup?: boolean;
  hasDineIn?: boolean;
  hasLiveTracking?: boolean;
  minOrderAmount?: string;
  defaultDeliveryFee?: string;
  freeDeliveryThreshold?: string | null;
  fiscalId?: string | null;
  fiscalName?: string | null;
  taxes?: BranchTaxConfig[];
  sunatAnexo?: string | null;
  schedules?: {
    day: string;
    startTime: string;
    endTime: string;
    closed: boolean;
  }[];
  deliveryZone?: {
    type: 'Polygon';
    coordinates: number[][][];
  } | null;
  allowSellWithoutStock?: boolean;
}

// Helper: convierte strings vacíos a null (PostgreSQL no acepta '' en columnas decimal/varchar nullable)
function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  return value;
}

export async function createBranch(data: CreateBranchInput) {
  const db = getTenantDb();

  // Verificar código único
  const existing = await db.select({ id: branches.id })
    .from(branches)
    .where(eq(branches.code, data.code));

  if (existing.length > 0) {
    throw new Error(`Ya existe una sucursal con el código "${data.code}"`);
  }

  // Si es la primera sucursal, hacerla principal automáticamente
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(branches);
  const isFirstBranch = Number(countResult?.count || 0) === 0;
  const isMain = isFirstBranch ? true : (data.isMain ?? false);

  return await db.transaction(async (tx) => {
    // Si esta va a ser la principal, quitar el flag de principal a todas las demás
    if (isMain) {
      await tx.update(branches)
        .set({ isMain: false, updatedAt: new Date() })
        .where(eq(branches.isMain, true));
    }

    const [newBranch] = await tx.insert(branches).values({
      brandId: data.brandId,
      name: data.name,
      code: data.code,
      countryCode: data.countryCode ?? null,
      baseCurrency: data.baseCurrency ?? null,
      foreignCurrency: data.foreignCurrency ?? null,
      isMain: isMain,
      address: data.address ?? null,
      phone: emptyToNull(data.phone),
      whatsapp: emptyToNull(data.whatsapp),
      email: emptyToNull(data.email),
      hasDelivery: data.hasDelivery ?? false,
      hasPickup: data.hasPickup ?? false,
      hasDineIn: data.hasDineIn ?? false,
      hasLiveTracking: data.hasLiveTracking ?? false,
      minOrderAmount: emptyToNull(data.minOrderAmount) ?? '0.00',
      defaultDeliveryFee: emptyToNull(data.defaultDeliveryFee) ?? '0.00',
      freeDeliveryThreshold: emptyToNull(data.freeDeliveryThreshold),
      fiscalId: emptyToNull(data.fiscalId),
      fiscalName: emptyToNull(data.fiscalName),
      taxes: normalizeBranchTaxes(data.taxes),
      sunatAnexo: emptyToNull(data.sunatAnexo),
      schedules: data.schedules ?? [],
      deliveryZone: data.deliveryZone ?? null,
      allowSellWithoutStock: data.allowSellWithoutStock ?? false,
    }).returning();

    return newBranch;
  });
}

// ────────────────────────────────────────────
// ACTUALIZAR SUCURSAL
// ────────────────────────────────────────────

export async function updateBranch(id: number, data: Partial<CreateBranchInput>) {
  const db = getTenantDb();

  // Si se cambia el código, verificar unicidad
  if (data.code) {
    const existing = await db.select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.code, data.code)));

    if (existing.length > 0 && existing[0].id !== id) {
      throw new Error(`Ya existe una sucursal con el código "${data.code}"`);
    }
  }

  // Sanitizar campos para evitar '' en columnas decimal/nullable
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.countryCode !== undefined) updateData.countryCode = data.countryCode;
  if (data.baseCurrency !== undefined) updateData.baseCurrency = data.baseCurrency;
  if (data.foreignCurrency !== undefined) updateData.foreignCurrency = data.foreignCurrency;
  if (data.isMain !== undefined) updateData.isMain = data.isMain;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.address !== undefined) updateData.address = data.address ?? null;
  if (data.phone !== undefined) updateData.phone = emptyToNull(data.phone);
  if (data.whatsapp !== undefined) updateData.whatsapp = emptyToNull(data.whatsapp);
  if (data.email !== undefined) updateData.email = emptyToNull(data.email);
  if (data.hasDelivery !== undefined) updateData.hasDelivery = data.hasDelivery;
  if (data.hasPickup !== undefined) updateData.hasPickup = data.hasPickup;
  if (data.hasDineIn !== undefined) updateData.hasDineIn = data.hasDineIn;
  if (data.hasLiveTracking !== undefined) updateData.hasLiveTracking = data.hasLiveTracking;
  if (data.minOrderAmount !== undefined) updateData.minOrderAmount = emptyToNull(data.minOrderAmount) ?? '0.00';
  if (data.defaultDeliveryFee !== undefined) updateData.defaultDeliveryFee = emptyToNull(data.defaultDeliveryFee) ?? '0.00';
  if (data.freeDeliveryThreshold !== undefined) updateData.freeDeliveryThreshold = emptyToNull(data.freeDeliveryThreshold);
  if (data.fiscalId !== undefined) updateData.fiscalId = emptyToNull(data.fiscalId);
  if (data.fiscalName !== undefined) updateData.fiscalName = emptyToNull(data.fiscalName);
  if (data.taxes !== undefined) updateData.taxes = normalizeBranchTaxes(data.taxes);
  if (data.sunatAnexo !== undefined) updateData.sunatAnexo = emptyToNull(data.sunatAnexo);
  if (data.schedules !== undefined) updateData.schedules = data.schedules ?? [];
  if (data.deliveryZone !== undefined) updateData.deliveryZone = data.deliveryZone ?? null;
  if (data.allowSellWithoutStock !== undefined) updateData.allowSellWithoutStock = data.allowSellWithoutStock;

  return await db.transaction(async (tx) => {
    // Si estamos marcando esta sucursal como principal (isMain: true)
    if (data.isMain === true) {
      // Primero quitamos el flag de principal de cualquier otra sucursal
      await tx.update(branches)
        .set({ isMain: false, updatedAt: new Date() })
        .where(and(eq(branches.isMain, true), sql`${branches.id} != ${id}`));
    } else if (data.isMain === false) {
      // Si intentan cambiar isMain de true a false, verificar si era la principal actual
      const [currentBranch] = await tx
        .select({ isMain: branches.isMain })
        .from(branches)
        .where(eq(branches.id, id));

      if (currentBranch && currentBranch.isMain) {
        throw new Error('Debe haber al menos una sucursal principal. Para cambiar la sucursal principal, marque otra sucursal como principal.');
      }
    }

    const [updated] = await tx.update(branches)
      .set(updateData)
      .where(eq(branches.id, id))
      .returning();

    return updated;
  });
}

// ────────────────────────────────────────────
// ELIMINAR SUCURSAL
// ────────────────────────────────────────────

export async function deleteBranch(id: number) {
  const db = getTenantDb();

  // No permitir eliminar la sucursal principal
  const branch = await getBranchById(id);
  if (!branch) throw new Error('Sucursal no encontrada');
  if (branch.isMain) throw new Error('No se puede eliminar la sucursal principal');

  const [deleted] = await db.delete(branches)
    .where(eq(branches.id, id))
    .returning();
  return deleted;
}

// ────────────────────────────────────────────
// MIS SUCURSALES (para un usuario)
// ────────────────────────────────────────────

export async function getMyBranches(userId: number) {
  const db = getTenantDb();
  const results = await db
    .select({
      id: branches.id,
      name: branches.name,
      code: branches.code,
      isMain: branches.isMain,
      isActive: branches.isActive,
      isDefault: userBranches.isDefault,
      taxes: branches.taxes,
    })
    .from(userBranches)
    .innerJoin(branches, eq(userBranches.branchId, branches.id))
    .where(eq(userBranches.userId, userId));
  return results;
}
