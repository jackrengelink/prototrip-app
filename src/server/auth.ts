import crypto from 'node:crypto';
import type { Role } from '../shared/schemas';
import type { AppState } from './state';

const TOKEN_TTL_MS = 400 * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Password hashing (admin password)                                   */
/* ------------------------------------------------------------------ */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, nStr, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length, {
    N: Number(nStr) || 16384,
    r: 8,
    p: 1,
  });
  return crypto.timingSafeEqual(actual, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function generatePassword(): string {
  const words = ['canal', 'tulip', 'compass', 'harbor', 'summit', 'lantern', 'voyage', 'meadow', 'atlas', 'pioneer'];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(1000, 9999)}`;
}

/* ------------------------------------------------------------------ */
/* Session tokens                                                      */
/* ------------------------------------------------------------------ */

interface TokenPayload {
  r: Role;
  g: number;
  iat: number;
}

function sign(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function issueToken(state: Pick<AppState, 'secrets'>, role: Role): string {
  const payload: TokenPayload = { r: role, g: state.secrets.generations[role], iat: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(state.secrets.sessionSecret, body)}`;
}

export function verifyToken(state: Pick<AppState, 'secrets'>, token: string | undefined | null): Role | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(state.secrets.sessionSecret, body);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!['participant', 'organizer', 'admin'].includes(payload.r)) return null;
    if (payload.g !== state.secrets.generations[payload.r]) return null;
    if (typeof payload.iat !== 'number' || Date.now() - payload.iat > TOKEN_TTL_MS) return null;
    return payload.r;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Calendar feed tokens                                                */
/* ------------------------------------------------------------------ */

/** Calendar apps can't send headers, so feeds use a secret in the URL. Admins share the organizer feed. */
export function calendarToken(state: Pick<AppState, 'secrets'>, role: Role): string {
  const feedRole = role === 'participant' ? 'participant' : 'organizer';
  const prefix = feedRole === 'participant' ? 'p' : 'o';
  const mac = sign(state.secrets.sessionSecret, `feed:${feedRole}:${state.secrets.generations[feedRole]}`).slice(0, 24);
  return `${prefix}${mac}`;
}

export function verifyCalendarToken(state: Pick<AppState, 'secrets'>, token: string): Role | null {
  for (const role of ['participant', 'organizer'] as const) {
    const expected = calendarToken(state, role);
    if (token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return role;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Login attempt limiting                                              */
/* ------------------------------------------------------------------ */

export class LoginLimiter {
  private perKey = new Map<string, { failures: number; resetAt: number }>();
  private global = { failures: 0, resetAt: 0 };

  constructor(
    private readonly maxPerKey = 10,
    private readonly windowMs = 10 * 60 * 1000,
    private readonly maxGlobal = 300,
  ) {}

  /** Returns seconds to wait if blocked, otherwise 0. */
  blockedFor(key: string, now = Date.now()): number {
    if (this.global.resetAt > now && this.global.failures >= this.maxGlobal) {
      return Math.ceil((this.global.resetAt - now) / 1000);
    }
    const entry = this.perKey.get(key);
    if (entry && entry.resetAt > now && entry.failures >= this.maxPerKey) {
      return Math.ceil((entry.resetAt - now) / 1000);
    }
    return 0;
  }

  fail(key: string, now = Date.now()): void {
    const entry = this.perKey.get(key);
    if (!entry || entry.resetAt <= now) this.perKey.set(key, { failures: 1, resetAt: now + this.windowMs });
    else entry.failures++;
    if (this.global.resetAt <= now) this.global = { failures: 1, resetAt: now + 60 * 60 * 1000 };
    else this.global.failures++;
    if (this.perKey.size > 5000) {
      for (const [k, v] of this.perKey) if (v.resetAt <= now) this.perKey.delete(k);
    }
  }

  succeed(key: string): void {
    this.perKey.delete(key);
  }
}
