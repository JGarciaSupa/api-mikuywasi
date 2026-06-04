const BASE_URL = process.env.FACTURADOR_URL ?? 'http://facturador-restaurante:8080';
const TIMEOUT_MS = 30_000;

const log = {
  req: (method: string, path: string, body?: unknown) => {
    const preview = body ? JSON.stringify(body).slice(0, 300) : '';
    console.log(`\x1b[36m[FACTURADOR →]\x1b[0m ${method} ${path}${preview ? ` ${preview}` : ''}`);
  },
  ok: (method: string, path: string, status: number) =>
    console.log(`\x1b[32m[FACTURADOR ←]\x1b[0m ${method} ${path} ${status}`),
  err: (method: string, path: string, status: number | string, body: string) =>
    console.error(`\x1b[31m[FACTURADOR ✗]\x1b[0m ${method} ${path} ${status}\n  ${body}`),
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FacturadorEmpresaInput {
  ruc: string;
  razon_social: string;
  direccion: string;
  usuario_sol: string;
  clave_sol: string;
  ambiente: 'beta' | 'produccion';
  plan?: string;
  certificado?: string;       // Base64 PEM
  certificado_password?: string;
  logo?: string;              // Base64
  client_id?: string;
  client_secret?: string;
}

export interface FacturadorEmpresaRow {
  id: number;
  ruc: string;
  legalName: string;
  address: string | null;
  plan: string | null;
  environment: string;
  clientId: string | null;
  hasCertificate: boolean;
  hasLogo: boolean;
  solUsername?: string;
  createdAt?: string;
}

export interface DetallePayload {
  codigo: string;
  unidad_medida: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;      // precio SIN IGV
  valor_venta: number;         // valor_unitario * cantidad
  base_igv: number;
  porcentaje_igv: number;
  igv: number;
  tipo_afectacion: string;     // '10' = gravado
  total_impuestos: number;
  precio_unitario: number;     // precio CON IGV
}

export interface ComprobantePayload {
  emisor: { ruc: string };
  cliente: {
    tipo_documento: string;    // '6'=RUC '1'=DNI '0'=sin doc
    numero_documento: string;
    razon_social: string;
    direccion?: string;
  };
  comprobante: {
    tipo_doc: '01' | '03';    // '01'=Factura '03'=Boleta
    serie: string;
    correlativo: string;
    fecha_emision: string;    // ISO 8601 con zona Lima: -05:00
    moneda: string;
  };
  totales: {
    gravadas: number;
    igv: number;
    total_impuestos: number;
    valor_venta: number;
    subtotal: number;
    total: number;
  };
  detalles: DetallePayload[];
  leyenda?: string;           // texto en letras del total
}

export interface ComprobanteResponse {
  id: number;
  xmlFilename: string;
  hash: string;
  responseCode: string;
  responseMessage: string;
  notes: string[];
  xmlBase64: string | null;
  cdrBase64: string | null;
}

// ── Internal ───────────────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  log.req(method, path, body);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: any) {
    log.err(method, path, 'NETWORK', err?.message ?? String(err));
    throw new Error(`Facturador no disponible (${method} ${path}): ${err?.message ?? err}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    log.err(method, path, res.status, errText);
    throw new Error(`Facturador ${method} ${path} → ${res.status}: ${errText}`);
  }

  log.ok(method, path, res.status);
  return res.json() as Promise<T>;
}

// ── Empresa endpoints ──────────────────────────────────────────────────────────

export async function crearEmpresa(data: FacturadorEmpresaInput): Promise<{ id: number }> {
  const res = await request<{ success: boolean; id: number }>(
    'POST', '/api/v1/empresas', data,
  );
  return { id: res.id };
}

export async function actualizarEmpresa(
  id: number,
  data: Partial<FacturadorEmpresaInput>,
): Promise<void> {
  await request('PUT', `/api/v1/empresas/${id}`, data);
}

export async function obtenerEmpresa(id: number): Promise<FacturadorEmpresaRow> {
  const res = await request<{ success: boolean; data: FacturadorEmpresaRow }>(
    'GET', `/api/v1/empresas/${id}`,
  );
  return res.data;
}

// ── Emission endpoints ─────────────────────────────────────────────────────────

/**
 * Emite factura o boleta. Maneja HTTP 422 como rechazo SUNAT (no como error),
 * porque el facturador retorna 422 cuando SUNAT procesa pero rechaza el comprobante.
 * Solo lanza error en fallos de red o errores de validación (4xx distintos de 422).
 */
export async function emitirComprobante(
  payload: ComprobantePayload,
): Promise<{ success: boolean; data: ComprobanteResponse }> {
  const endpoint = payload.comprobante.tipo_doc === '01'
    ? '/api/v1/comprobantes/factura'
    : '/api/v1/comprobantes/boleta';

  const url = `${BASE_URL}${endpoint}`;
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  log.req('POST', endpoint, payload);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: any) {
    log.err('POST', endpoint, 'NETWORK', err?.message ?? String(err));
    throw new Error(`Facturador no disponible (${endpoint}): ${err?.message ?? err}`);
  }

  // 422 = SUNAT procesó y rechazó → devolver el body con success:false, no lanzar error
  if (res.status === 422 || res.ok) {
    const json = await res.json() as { success: boolean; data: ComprobanteResponse };
    if (res.status === 422) {
      log.err('POST', endpoint, 422, `SUNAT rechazó: ${json.data?.responseCode} — ${json.data?.responseMessage}`);
    } else {
      log.ok('POST', endpoint, res.status);
    }
    return json;
  }

  // Cualquier otro error (400, 500, etc.) → sí lanzar
  const errText = await res.text().catch(() => res.statusText);
  log.err('POST', endpoint, res.status, errText);
  throw new Error(`Facturador ${endpoint} → ${res.status}: ${errText}`);
}

/**
 * Re-envía a SUNAT un comprobante ya registrado en el facturador.
 * Usa el payload guardado para reconstruir el XML y actualiza el Voucher existente.
 * Maneja 422 como rechazo SUNAT (igual que emitirComprobante).
 */
export async function reenviarComprobante(
  comprobanteId: number,
): Promise<{ success: boolean; data: ComprobanteResponse }> {
  const endpoint = `/api/v1/comprobantes/${comprobanteId}/retry`;
  const url = `${BASE_URL}${endpoint}`;
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  log.req('POST', endpoint);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: any) {
    log.err('POST', endpoint, 'NETWORK', err?.message ?? String(err));
    throw new Error(`Facturador no disponible (retry ${comprobanteId}): ${err?.message ?? err}`);
  }

  if (res.status === 422 || res.ok) {
    const json = await res.json() as { success: boolean; data: ComprobanteResponse };
    if (res.status === 422) {
      log.err('POST', endpoint, 422, `SUNAT rechazó reintento: ${json.data?.responseCode} — ${json.data?.responseMessage}`);
    } else {
      log.ok('POST', endpoint, res.status);
    }
    return json;
  }

  const errText = await res.text().catch(() => res.statusText);
  log.err('POST', endpoint, res.status, errText);
  throw new Error(`Facturador retry ${comprobanteId} → ${res.status}: ${errText}`);
}

export async function obtenerPdfBuffer(comprobanteId: number): Promise<Buffer> {
  const path = `/api/v1/comprobantes/${comprobanteId}/pdf`;
  const url = `${BASE_URL}${path}`;
  log.req('GET', path);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err: any) {
    log.err('GET', path, 'NETWORK', err?.message ?? String(err));
    throw new Error(`Facturador no disponible (PDF ${comprobanteId}): ${err?.message ?? err}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    log.err('GET', path, res.status, errText);
    throw new Error(`Facturador PDF ${comprobanteId} → ${res.status}: ${errText}`);
  }

  log.ok('GET', path, res.status);
  return Buffer.from(await res.arrayBuffer());
}

// ── Certificate conversion ─────────────────────────────────────────────────────

export interface CertificateResult {
  pem: string;  // Base64 del PEM combinado (privkey + cert)
  cer: string;  // Base64 del CER (solo el certificado público)
}

/**
 * Convierte un archivo .p12/.pfx (en Base64) a PEM usando el facturador.
 * El resultado pem se usa como `certificado` al crear/actualizar una Empresa.
 */
export async function convertirCertificado(
  p12Base64: string,
  password: string,
): Promise<CertificateResult> {
  return request<CertificateResult>('POST', '/api/v1/companies/certificate', {
    cert: p12Base64,
    cert_pass: password,
    base64: true,
  });
}
