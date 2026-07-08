import * as jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!;

// permissions: { actionCode: subActionCode[] }
// Ej: { "ventas": ["ventas.crear_factura", "ventas.listar"], "caja": ["caja.abrir"] }
export type PermissionsMap = Record<string, string[]>;

export interface JwtPayload {
  userId: number;
  role: string;
  tenantId?: number | null;
  roleId?: number | null;
  permissions?: PermissionsMap;
}

export async function generateAccessToken(payload: JwtPayload): Promise<string> {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  return jwt.verify(token, SECRET) as JwtPayload;
}
