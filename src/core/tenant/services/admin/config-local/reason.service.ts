import { reasons } from '@/db/tenant/schema';
import { eq, and, asc, ne } from 'drizzle-orm';
import { getTenantDb } from '@/utils/tenant-context';
import type { CreateReasonInput, UpdateReasonInput } from '@/core/tenant/validations/admin/config-local/reason.validation';

type ReasonType = 'courtesy' | 'order_cancel' | 'document_void' | 'discount';

// ─── Catálogo de motivos (por sucursal) ──────────────────────────────────────

export async function listReasons(branchId: number, type?: ReasonType) {
  const db = getTenantDb();
  const where = type
    ? and(eq(reasons.branchId, branchId), eq(reasons.type, type))
    : eq(reasons.branchId, branchId);

  return db.select().from(reasons).where(where).orderBy(asc(reasons.description));
}

export async function getReasonById(id: number) {
  const db = getTenantDb();
  const [reason] = await db.select().from(reasons).where(eq(reasons.id, id));
  return reason;
}

// Evita dos motivos con la misma descripción dentro del mismo tipo y sucursal.
async function assertNoDuplicate(
  branchId: number,
  type: ReasonType,
  description: string,
  excludeId?: number,
) {
  const db = getTenantDb();
  const rows = await db
    .select({ id: reasons.id })
    .from(reasons)
    .where(and(
      eq(reasons.branchId, branchId),
      eq(reasons.type, type),
      eq(reasons.description, description),
      ...(excludeId ? [ne(reasons.id, excludeId)] : []),
    ));

  if (rows.length > 0) {
    throw new Error(`Ya existe un motivo con la descripción "${description}" en esta sucursal`);
  }
}

// Normaliza los campos específicos: los que no aplican al tipo se guardan vacíos
// para que no queden valores colgados si el tipo cambia o llegan de más.
function normalizeByType(type: ReasonType, data: Partial<CreateReasonInput>) {
  const appliesMaxAmount = type === 'courtesy' || type === 'discount';
  const discountMode = type === 'discount' ? (data.discountMode ?? null) : null;
  // El valor solo se guarda en porcentaje/monto. En 'manual' queda null porque
  // se define por pedido.
  const appliesDiscountValue = discountMode === 'percentage' || discountMode === 'amount';

  return {
    maxAmount: appliesMaxAmount && data.maxAmount != null ? String(data.maxAmount) : null,
    isFreeTransfer: type === 'courtesy' ? (data.isFreeTransfer ?? false) : false,
    discountMode,
    discountValue: appliesDiscountValue && data.discountValue != null ? String(data.discountValue) : null,
  };
}

export async function createReason(data: CreateReasonInput) {
  const db = getTenantDb();
  const description = data.description.trim();

  await assertNoDuplicate(data.branchId, data.type, description);

  const [created] = await db.insert(reasons).values({
    branchId: data.branchId,
    type: data.type,
    description,
    longDescription: data.longDescription?.trim() || null,
    isActive: data.isActive ?? true,
    ...normalizeByType(data.type, data),
  }).returning();

  return created;
}

export async function updateReason(id: number, data: UpdateReasonInput) {
  const db = getTenantDb();

  const current = await getReasonById(id);
  if (!current) return undefined;

  // El tipo no se cambia desde la edición: manda siempre el de la fila existente.
  const type = current.type as ReasonType;
  const description = data.description?.trim() ?? current.description;

  if (data.description !== undefined) {
    await assertNoDuplicate(current.branchId, type, description, id);
  }

  const [updated] = await db
    .update(reasons)
    .set({
      description,
      ...(data.longDescription !== undefined && { longDescription: data.longDescription?.trim() || null }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...normalizeByType(type, {
        maxAmount: data.maxAmount !== undefined ? data.maxAmount : current.maxAmount != null ? Number(current.maxAmount) : null,
        isFreeTransfer: data.isFreeTransfer !== undefined ? data.isFreeTransfer : current.isFreeTransfer,
        discountMode: data.discountMode !== undefined ? data.discountMode : (current.discountMode as any),
        discountValue: data.discountValue !== undefined ? data.discountValue : current.discountValue != null ? Number(current.discountValue) : null,
      }),
      updatedAt: new Date(),
    })
    .where(eq(reasons.id, id))
    .returning();

  return updated;
}

export async function deleteReason(id: number) {
  const db = getTenantDb();
  const [deleted] = await db.delete(reasons).where(eq(reasons.id, id)).returning();
  return deleted;
}
