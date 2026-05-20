import * as jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!;

export interface JwtPayload {
    userId: number;
    role: string;
    tenantId?: number | null;
}

export async function generateAccessToken(payload: JwtPayload): Promise<string> {
    return jwt.sign(payload, SECRET, { expiresIn: '15m' });
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
    return jwt.verify(token, SECRET) as JwtPayload;
}