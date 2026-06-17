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
  // Campos de diagnóstico — presentes sólo cuando SUNAT rechaza
  tipo_error?: string | null;       // 'CDR_RECHAZO' | 'SUNAT_POLICY' | 'SOAP_FAULT' | 'NETWORK_ERROR'
  error_detalle?: Record<string, string | null> | null;
  diagnostico?: Record<string, unknown> | null;
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
      const tipoError = json.data?.tipo_error ?? 'RECHAZO';
      const detalle = json.data?.error_detalle?.message
        ? ` | Detalle: ${json.data.error_detalle.message}`
        : '';
      const notas = json.data?.notes?.length
        ? ` | Notas: ${(json.data.notes as string[]).join('; ')}`
        : '';
      log.err('POST', endpoint, 422,
        `[${tipoError}] ${json.data?.responseCode} — ${json.data?.responseMessage}${detalle}${notas}`
      );
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

// ── Voided (Comunicación de Baja RA) ──────────────────────────────────────────

export interface VoidedDocumento {
  tipo_doc: '01' | '03';   // '01'=Factura '03'=Boleta
  serie: string;
  correlativo: string;
  des_motivo_baja: string;
}

export interface VoidedPayload {
  emisor: { ruc: string };
  fec_generacion: string;    // YYYY-MM-DD — fecha de los documentos anulados
  fec_comunicacion: string;  // YYYY-MM-DD — fecha de esta comunicación
  documentos: VoidedDocumento[];
}

export interface VoidedResponse {
  id: number;
  xmlFilename: string;
  ticket: string | null;
  status: 'PENDING' | 'ERROR';
  message: string;
}

export interface VoidedStatusResponse {
  success: boolean;
  pending: boolean;
  code: string | null;
  description: string | null;
  cdrZip: string | null;
}

export async function enviarComunicacionBaja(
  payload: VoidedPayload,
): Promise<{ success: boolean; data: VoidedResponse }> {
  const endpoint = '/api/v1/voided/send';
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
    throw new Error(`Facturador no disponible (voided/send): ${err?.message ?? err}`);
  }

  if (res.status === 422 || res.ok) {
    const json = await res.json() as { success: boolean; data: VoidedResponse };
    if (!json.success) {
      log.err('POST', endpoint, res.status, json.data?.message ?? 'Error baja SUNAT');
    } else {
      log.ok('POST', endpoint, res.status);
    }
    return json;
  }

  const errText = await res.text().catch(() => res.statusText);
  log.err('POST', endpoint, res.status, errText);
  throw new Error(`Facturador voided/send → ${res.status}: ${errText}`);
}

export async function consultarEstadoBaja(
  ticket: string,
  ruc: string,
): Promise<VoidedStatusResponse> {
  const endpoint = `/api/v1/voided/status`;
  // Pasamos id=ticket para que el facturador encuentre el voucher por responseCode y actualice su BD
  const url = `${BASE_URL}${endpoint}?ticket=${encodeURIComponent(ticket)}&ruc=${encodeURIComponent(ruc)}&id=${encodeURIComponent(ticket)}`;

  log.req('GET', `${endpoint}?ticket=${ticket}&ruc=${ruc}&id=${ticket}`);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err: any) {
    log.err('GET', endpoint, 'NETWORK', err?.message ?? String(err));
    throw new Error(`Facturador no disponible (voided/status): ${err?.message ?? err}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    log.err('GET', endpoint, res.status, errText);
    throw new Error(`Facturador voided/status → ${res.status}: ${errText}`);
  }

  log.ok('GET', endpoint, res.status);
  const json = await res.json() as any;

  if (json.code === '98') return { success: false, pending: true, code: '98', description: 'En proceso por SUNAT', cdrZip: null };

  return {
    success: json.success === true,
    pending: false,
    code: json.code ?? null,
    description: json.cdrResponse?.description ?? json.error?.message ?? null,
    cdrZip: json.cdrZip ?? null,
  };
}

// ── Summary / Resumen Diario (RC) — para anulación de boletas ─────────────────

export interface SummaryDocumento {
  tipo_doc: '03';
  serie_nro: string;      // ej: "B001-00000010"
  cliente_tipo: string;   // '0' sin doc, '1' DNI, '4' CE, '6' RUC
  cliente_nro: string;    // número de doc o '-'
  estado: '3';            // '3' = anulado
  total: number;
  gravadas: number;
  igv: number;
}

export interface SummaryPayload {
  emisor: { ruc: string };
  fec_generacion: string; // YYYY-MM-DD — fecha de emisión de la boleta
  fec_resumen: string;    // YYYY-MM-DD — fecha del resumen (hoy)
  documentos: SummaryDocumento[];
}

export interface SummaryResponse {
  id: number;
  xmlFilename: string;
  ticket: string | null;
  status: 'PENDING' | 'ERROR';
  message: string;
}

export async function enviarResumenDiarioBaja(
  payload: SummaryPayload,
): Promise<{ success: boolean; data: SummaryResponse }> {
  const endpoint = '/api/v1/summary/send';
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
    throw new Error(`Facturador no disponible (summary/send): ${err?.message ?? err}`);
  }

  if (res.status === 422 || res.ok) {
    const json = await res.json() as { success: boolean; data: SummaryResponse };
    if (!json.success) {
      log.err('POST', endpoint, res.status, json.data?.message ?? 'Error resumen SUNAT');
    } else {
      log.ok('POST', endpoint, res.status);
    }
    return json;
  }

  const errText = await res.text().catch(() => res.statusText);
  log.err('POST', endpoint, res.status, errText);
  throw new Error(`Facturador summary/send → ${res.status}: ${errText}`);
}

// ── Summary status (consultar estado RC — para boletas anuladas) ──────────────

export interface SummaryStatusResponse {
  success: boolean;
  pending: boolean;
  code: string | null;
  description: string | null;
}

export async function consultarEstadoResumen(
  ticket: string,
  ruc: string,
): Promise<SummaryStatusResponse> {
  const endpoint = '/api/v1/summary/status';
  const url = `${BASE_URL}${endpoint}`;
  // Pasamos id=ticket para que el facturador encuentre el voucher por responseCode y actualice su BD
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: ticket, ticket, ruc }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  log.req('POST', endpoint, { id: ticket, ticket, ruc });

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: any) {
    log.err('POST', endpoint, 'NETWORK', err?.message ?? String(err));
    throw new Error(`Facturador no disponible (summary/status): ${err?.message ?? err}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    log.err('POST', endpoint, res.status, errText);
    throw new Error(`Facturador summary/status → ${res.status}: ${errText}`);
  }

  log.ok('POST', endpoint, res.status);
  const rawText = await res.text();
  let json: any;
  try {
    json = JSON.parse(rawText);
  } catch {
    log.err('POST', endpoint, 'JSON_PARSE', `Non-JSON body: ${rawText.slice(0, 500)}`);
    throw new Error(`Facturador summary/status devolvió respuesta no JSON: ${rawText.slice(0, 200)}`);
  }
  const data = json.data ?? {};

  // El facturador puede responder en español (pendiente/estado/codigo/mensaje)
  // o en inglés (pending/status/responseCode/message) según la versión del contenedor
  const isPending = data.pending === true || data.pendiente === true;
  const statusStr: string = data.status ?? data.estado ?? '';
  const code = data.responseCode ?? data.codigo ?? null;
  const isAccepted = !isPending && (
    statusStr === 'ACCEPTED' || statusStr === 'ACEPTADO' || code === '0'
  );

  return {
    success: isAccepted,
    pending: isPending,
    code,
    description: data.message ?? data.mensaje ?? null,
  };
}

// ── Diagnose (depuración de configuración sin enviar a SUNAT) ─────────────────

export interface DiagnoseResult {
  empresa_id: number;
  razon_social: string;
  ruc: string;
  ambiente: string;
  sunat_url: string;
  sol_usuario: string;
  sol_usuario_full: string;
  tiene_cert: boolean;
  cert_cn: string | null;
  cert_expira: string | null;
  cert_vigente: boolean | null;
  cert_ruc_match: boolean | null;
  warnings: string[];
}

/**
 * Consulta la configuración de una empresa en el facturador sin enviar nada a SUNAT.
 * Muestra ambiente, URL, usuario SOL, info del certificado y advertencias de config.
 * Útil para depurar el error SUNAT 0111 "No tiene perfil para enviar comprobantes".
 */
export async function diagnosticarEmision(ruc: string): Promise<DiagnoseResult> {
  const res = await request<{ success: boolean; data: DiagnoseResult }>(
    'POST', '/api/v1/invoice/diagnose', { ruc },
  );
  return res.data;
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
