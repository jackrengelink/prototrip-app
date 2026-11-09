import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: { endpoint: string; payload: string; urgency?: string }[] = [];
const failures = new Map<string, number>();

vi.mock('web-push', () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string, opts: { urgency?: string }) => {
      const status = failures.get(sub.endpoint);
      if (status) throw Object.assign(new Error('push failed'), { statusCode: status });
      sent.push({ endpoint: sub.endpoint, payload, urgency: opts.urgency });
    }),
  },
}));

const { Database } = await import('../../src/server/db');
const { MemoryStore } = await import('../../src/server/store/memory');
const { sendPush } = await import('../../src/server/push');

async function dbWithSubs() {
  const { db } = await Database.open(new MemoryStore());
  await db.mutate((d) => {
    const keys = { p256dh: 'k', auth: 'a' };
    d.push.subscriptions = [
      { endpoint: 'https://push/p1', keys, role: 'participant', personId: 'u1', createdAt: '' },
      { endpoint: 'https://push/o1', keys, role: 'organizer', personId: 'u2', createdAt: '' },
      { endpoint: 'https://push/a1', keys, role: 'admin', createdAt: '' },
    ];
  });
  return db;
}

describe('sendPush', () => {
  beforeEach(() => {
    sent.length = 0;
    failures.clear();
  });

  it('sends announcements for everyone to every device', async () => {
    const db = await dbWithSubs();
    const res = await sendPush(db, 'mailto:x@example.org', 'everyone', { title: 'Hi', body: 'There', url: '/news', urgent: true });
    expect(res).toEqual({ sent: 3, failed: 0, removed: 0 });
    expect(JSON.parse(sent[0].payload)).toMatchObject({ title: 'Hi', body: 'There', url: '/news' });
    expect(sent[0].urgency).toBe('high');
  });

  it('only sends organizer messages to organizer and admin devices', async () => {
    const db = await dbWithSubs();
    await sendPush(db, 'mailto:x@example.org', 'organizers', { title: 'Orga' });
    expect(sent.map((s) => s.endpoint).sort()).toEqual(['https://push/a1', 'https://push/o1']);
  });

  it('can target specific people', async () => {
    const db = await dbWithSubs();
    await sendPush(db, 'mailto:x@example.org', 'everyone', { title: 'You' }, { onlyPersonIds: ['u1'] });
    expect(sent.map((s) => s.endpoint)).toEqual(['https://push/p1']);
  });

  it('removes subscriptions that no longer exist', async () => {
    const db = await dbWithSubs();
    failures.set('https://push/p1', 410);
    failures.set('https://push/o1', 500);
    const res = await sendPush(db, 'mailto:x@example.org', 'everyone', { title: 'x' });
    expect(res).toEqual({ sent: 1, failed: 2, removed: 1 });
    expect(db.state.push.subscriptions.map((s) => s.endpoint).sort()).toEqual(['https://push/a1', 'https://push/o1']);
  });
});
