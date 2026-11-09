import crypto from 'node:crypto';

/** Short, URL-safe random id. */
export function newId(prefix = ''): string {
  return prefix + crypto.randomBytes(9).toString('base64url');
}

/** Characters that are hard to confuse when read aloud or typed from a poster. */
const READABLE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function readableCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += READABLE[bytes[i] % READABLE.length];
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}
