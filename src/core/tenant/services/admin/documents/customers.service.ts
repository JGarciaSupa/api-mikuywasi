import { eq, or, ilike, desc } from 'drizzle-orm';
import {
  customers,
  customerContacts,
  customerAddresses,
} from '../../../../../db/tenant/schema';
import { getTenantDb } from '../../../../../utils/tenant-context';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateCustomerInput {
  customerType?: 'person' | 'company';
  firstName: string;
  lastName?: string | null;
  contacts?: { contactType: 'phone' | 'mobile' | 'email'; value: string; isPrimary?: boolean }[];
  addresses?: {
    name?: string | null;
    address: string;
    district?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    deliveryInstructions?: string | null;
    isDefault?: boolean;
  }[];
}

export interface UpdateCustomerInput {
  customerType?: 'person' | 'company';
  firstName?: string;
  lastName?: string | null;
  status?: 'active' | 'inactive';
}

// ── Queries ────────────────────────────────────────────────────────────────────

// Búsqueda para el buscador rápido (pedidos) y el listado de gestión — por nombre
// o por cualquier contacto (teléfono/email). No es una búsqueda exacta: cualquier
// coincidencia parcial aparece, el usuario elige o crea uno nuevo (teléfono no es único).
export async function searchCustomers(search?: string, limit = 20) {
  const db = getTenantDb();

  const rows = search?.trim()
    ? await db
        .selectDistinct({ customer: customers })
        .from(customers)
        .leftJoin(customerContacts, eq(customerContacts.customerId, customers.id))
        .where(or(
          ilike(customers.firstName, `%${search.trim()}%`),
          ilike(customers.lastName, `%${search.trim()}%`),
          ilike(customerContacts.value, `%${search.trim()}%`),
        ))
        .orderBy(desc(customers.createdAt))
        .limit(limit)
    : await db.select({ customer: customers }).from(customers)
        .orderBy(desc(customers.createdAt)).limit(limit);

  const customerIds = rows.map((r) => r.customer.id);
  if (customerIds.length === 0) return [];

  const [contacts, addresses] = await Promise.all([
    db.select().from(customerContacts)
      .where(or(...customerIds.map((id) => eq(customerContacts.customerId, id)))),
    db.select().from(customerAddresses)
      .where(or(...customerIds.map((id) => eq(customerAddresses.customerId, id))))
  ]);

  return rows.map((r) => ({
    ...r.customer,
    contacts: contacts.filter((c) => c.customerId === r.customer.id),
    addresses: addresses.filter((a) => a.customerId === r.customer.id),
  }));
}

export async function getCustomerById(id: number) {
  const db = getTenantDb();
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) return null;

  const [contacts, addresses] = await Promise.all([
    db.select().from(customerContacts).where(eq(customerContacts.customerId, id)),
    db.select().from(customerAddresses).where(eq(customerAddresses.customerId, id)),
  ]);

  return { ...customer, contacts, addresses };
}

// ── Mutations ──────────────────────────────────────────────────────────────────

// Alta rápida (usada tanto desde el flujo de pedido como desde la pantalla de
// gestión): crea el cliente y, si se envían, su primer contacto/dirección/perfil
// fiscal en la misma operación.
export async function createCustomer(data: CreateCustomerInput) {
  const db = getTenantDb();
  if (!data.firstName?.trim()) throw new Error('El nombre del cliente es obligatorio');

  try {
    return await db.transaction(async (tx) => {
      const [customer] = await tx.insert(customers).values({
        customerType: data.customerType ?? 'person',
        firstName: data.firstName.trim(),
        lastName: data.lastName?.trim() || null,
      }).returning();

      if (data.contacts?.length) {
        await tx.insert(customerContacts).values(
          data.contacts
            .filter((c) => c.value?.trim())
            .map((c) => ({ customerId: customer.id, contactType: c.contactType, value: c.value.trim(), isPrimary: c.isPrimary ?? false })),
        );
      }

      const validAddresses = data.addresses?.filter((a) => a.address?.trim()) ?? [];
      if (validAddresses.length) {
        await tx.insert(customerAddresses).values(
          validAddresses.map((a, i) => ({
            customerId: customer.id,
            name: a.name || null,
            address: a.address.trim(),
            district: a.district || null,
            latitude: a.latitude != null ? String(a.latitude) : null,
            longitude: a.longitude != null ? String(a.longitude) : null,
            deliveryInstructions: a.deliveryInstructions || null,
            // Si ninguna viene marcada como predeterminada, la primera lo es.
            isDefault: a.isDefault ?? (i === 0 && !validAddresses.some((x) => x.isDefault)),
          })),
        );
      }

      return getCustomerByIdTx(tx, customer.id);
    });
  } catch (err: any) {
    if (err.code === '23505' && err.message?.includes('customer_contacts')) {
      throw new Error('El número de teléfono o correo ya se encuentra registrado en otro cliente.');
    }
    throw err;
  }
}

async function getCustomerByIdTx(tx: any, id: number) {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, id));
  const [contacts, addresses] = await Promise.all([
    tx.select().from(customerContacts).where(eq(customerContacts.customerId, id)),
    tx.select().from(customerAddresses).where(eq(customerAddresses.customerId, id)),
  ]);
  return { ...customer, contacts, addresses };
}

export async function updateCustomer(id: number, data: UpdateCustomerInput) {
  const db = getTenantDb();
  const [existing] = await db.select().from(customers).where(eq(customers.id, id));
  if (!existing) throw new Error('Cliente no encontrado');

  const [updated] = await db.update(customers).set({
    ...(data.customerType !== undefined && { customerType: data.customerType }),
    ...(data.firstName !== undefined && { firstName: data.firstName.trim() }),
    ...(data.lastName !== undefined && { lastName: data.lastName?.trim() || null }),
    ...(data.status !== undefined && { status: data.status }),
    updatedAt: new Date(),
  }).where(eq(customers.id, id)).returning();

  return updated;
}

// ── Contactos ──────────────────────────────────────────────────────────────────

export async function addContact(customerId: number, data: { contactType: 'phone' | 'mobile' | 'email'; value: string; isPrimary?: boolean }) {
  const db = getTenantDb();
  if (!data.value?.trim()) throw new Error('El contacto no puede estar vacío');
  const [row] = await db.insert(customerContacts).values({
    customerId, contactType: data.contactType, value: data.value.trim(), isPrimary: data.isPrimary ?? false,
  }).returning();
  return row;
}

export async function deleteContact(id: number) {
  const db = getTenantDb();
  await db.delete(customerContacts).where(eq(customerContacts.id, id));
}

// ── Direcciones ────────────────────────────────────────────────────────────────

export async function addAddress(customerId: number, data: {
  name?: string | null; address: string; district?: string | null;
  latitude?: number | null; longitude?: number | null; deliveryInstructions?: string | null; isDefault?: boolean;
}) {
  const db = getTenantDb();
  if (!data.address?.trim()) throw new Error('La dirección no puede estar vacía');
  const [row] = await db.insert(customerAddresses).values({
    customerId,
    name: data.name || null,
    address: data.address.trim(),
    district: data.district || null,
    latitude: data.latitude != null ? String(data.latitude) : null,
    longitude: data.longitude != null ? String(data.longitude) : null,
    deliveryInstructions: data.deliveryInstructions || null,
    isDefault: data.isDefault ?? false,
  }).returning();
  return row;
}

export async function deleteAddress(id: number) {
  const db = getTenantDb();
  await db.delete(customerAddresses).where(eq(customerAddresses.id, id));
}

// Los perfiles fiscales (RUC/DNI) ya NO viven aquí — son un directorio
// independiente, sin relación a Customer. Ver tax-profiles.service.ts.
