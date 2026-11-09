import { describe, expect, it } from 'vitest';
import {
  calendarToken,
  hashPassword,
  issueToken,
  LoginLimiter,
  verifyCalendarToken,
  verifyPassword,
  verifyToken,
} from '../../src/server/auth';

const state = () => ({
  secrets: { sessionSecret: 'test-secret', adminPasswordHash: null, generations: { participant: 1, organizer: 1, admin: 1 } },
});

describe('passwords', () => {
  it('hashes and verifies', () => {
    const hash = hashPassword('correct horse');
    expect(verifyPassword('correct horse', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
    expect(verifyPassword('x', null)).toBe(false);
  });
});

describe('session tokens', () => {
  it('round-trips and rejects tampering', () => {
    const s = state();
    const token = issueToken(s, 'organizer');
    expect(verifyToken(s, token)).toBe('organizer');
    const [body] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ r: 'admin', g: 1, iat: Date.now() })).toString('base64url');
    expect(verifyToken(s, `${forged}.${token.split('.')[1]}`)).toBeNull();
    expect(verifyToken(s, `${body}.nope`)).toBeNull();
    expect(verifyToken({ ...s, secrets: { ...s.secrets, sessionSecret: 'other' } }, token)).toBeNull();
  });
  it('is invalidated when the generation changes', () => {
    const s = state();
    const token = issueToken(s, 'participant');
    s.secrets.generations.participant++;
    expect(verifyToken(s, token)).toBeNull();
  });
});

describe('calendar tokens', () => {
  it('maps to the right feed', () => {
    const s = state();
    expect(verifyCalendarToken(s, calendarToken(s, 'participant'))).toBe('participant');
    expect(verifyCalendarToken(s, calendarToken(s, 'admin'))).toBe('organizer');
    expect(verifyCalendarToken(s, 'pnope')).toBeNull();
  });
});

describe('LoginLimiter', () => {
  it('blocks after too many failures and recovers', () => {
    const l = new LoginLimiter(3, 1000, 100);
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) l.fail('ip', t0);
    expect(l.blockedFor('ip', t0)).toBeGreaterThan(0);
    expect(l.blockedFor('other', t0)).toBe(0);
    expect(l.blockedFor('ip', t0 + 2000)).toBe(0);
  });
});
