import webpush from 'web-push';
import type { Audience } from '../shared/schemas';
import { isOrganizerRole } from '../shared/visibility';
import type { Database } from './db';

export interface PushMessage {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  urgent?: boolean;
}

export interface PushResult {
  sent: number;
  failed: number;
  removed: number;
}

/**
 * Sends Web Push notifications to every subscribed device in the audience.
 * Subscriptions that the push service reports as gone are removed.
 */
export async function sendPush(
  db: Database,
  subject: string,
  audience: Audience,
  message: PushMessage,
  opts: { onlyPersonIds?: string[] } = {},
): Promise<PushResult> {
  const { publicKey, privateKey, subscriptions } = db.state.push;
  const targets = subscriptions.filter((s) => {
    if (audience === 'organizers' && !isOrganizerRole(s.role)) return false;
    if (opts.onlyPersonIds && (!s.personId || !opts.onlyPersonIds.includes(s.personId))) return false;
    return true;
  });
  if (!targets.length) return { sent: 0, failed: 0, removed: 0 };

  const payload = JSON.stringify({
    title: message.title,
    body: message.body ?? '',
    url: message.url ?? '/',
    tag: message.tag,
  });
  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  await Promise.all(
    targets.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: 12 * 60 * 60,
          urgency: message.urgent ? 'high' : 'normal',
          timeout: 10_000,
        });
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(sub.endpoint);
        else console.warn(`[push] delivery failed (${status ?? 'network'}): ${(err as Error).message}`);
      }
    }),
  );
  if (gone.length) {
    await db
      .mutate(
        (draft) => {
          draft.push.subscriptions = draft.push.subscriptions.filter((s) => !gone.includes(s.endpoint));
        },
        { bumpVersion: false },
      )
      .catch(() => undefined);
  }
  return { sent, failed, removed: gone.length };
}
