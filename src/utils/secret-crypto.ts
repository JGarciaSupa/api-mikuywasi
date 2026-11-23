import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Cifrado de secretos guardados en BD (p. ej. la contraseña SMTP del restaurante): AES-256-GCM.
// Clave: SETTINGS_ENCRYPTION_KEY o, si no está, derivada de JWT_SECRET. Si la clave cambia, los
// secretos guardados dejan de poder leerse y hay que volver a cargarlos.
// Formato: v1:<iv>:<tag>:<cifrado> (base64).

function getKey(): Buffer {
  const material = process.env.SETTINGS_ENCRYPTION_KEY || `${process.env.JWT_SECRET ?? ''}:settings`;
  if (!material || material === ':settings') throw new Error('Falta la clave de cifrado del servidor');
  return createHash('sha256').update(material).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Secreto con formato inválido');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
