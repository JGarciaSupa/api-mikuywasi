import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { branches } from '@/db/tenant/schema';
import { getTenantDb } from '@/utils/tenant-context';

// Ubicación del dispositivo que envía el admin al iniciar sesión y al abrir/cerrar caja.
// Es opcional: si el usuario deniega el permiso o el equipo no la tiene, llega solo `status`.
export const geoSchema = z.object({
  status: z.enum(['ok', 'denied', 'unavailable', 'timeout']),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).max(1_000_000).optional(),
});

export type GeoInput = z.infer<typeof geoSchema>;

/** Campos de ubicación de audit_log (migración 0094). */
export interface GeoAuditFields {
  latitude: string | null;
  longitude: string | null;
  geoAccuracy: number | null;
  geoStatus: string | null;
  distanceToBranch: number | null;
}

/** Valida la ubicación recibida en un body; null si no viene o no es válida (nunca lanza). */
export function parseGeo(raw: unknown): GeoInput | null {
  const parsed = geoSchema.safeParse(raw);
  if (!parsed.success) return null;
  const geo = parsed.data;
  // Coordenadas solo si el estado es 'ok' y vienen ambas
  if (geo.status !== 'ok' || geo.lat == null || geo.lng == null) {
    return { status: geo.status === 'ok' ? 'unavailable' : geo.status };
  }
  return geo;
}

/** Distancia en metros entre dos puntos (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Convierte la ubicación recibida en los campos de audit_log, con la distancia a la sucursal
 * si esta tiene coordenadas (branches.address.lat/lng). Nunca lanza: la auditoría no debe
 * bloquear el login ni la caja.
 */
export async function geoAuditFields(geo: GeoInput | null, branchId?: number | null): Promise<GeoAuditFields | undefined> {
  if (!geo) return undefined;
  const fields: GeoAuditFields = {
    latitude: geo.lat != null ? geo.lat.toFixed(7) : null,
    longitude: geo.lng != null ? geo.lng.toFixed(7) : null,
    geoAccuracy: geo.accuracy != null ? Math.round(geo.accuracy) : null,
    geoStatus: geo.status,
    distanceToBranch: null,
  };
  if (geo.lat == null || geo.lng == null || !branchId) return fields;
  try {
    const [branch] = await getTenantDb()
      .select({ address: branches.address })
      .from(branches)
      .where(eq(branches.id, branchId));
    const lat = Number(branch?.address?.lat);
    const lng = Number(branch?.address?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      fields.distanceToBranch = Math.round(distanceMeters({ lat: geo.lat, lng: geo.lng }, { lat, lng }));
    }
  } catch {
    // sin distancia: la sucursal no se pudo leer
  }
  return fields;
}
