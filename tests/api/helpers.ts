import request from 'supertest';
import { createApp } from '../../src/server/app';
import { hashPassword, LoginLimiter } from '../../src/server/auth';
import { loadConfig } from '../../src/server/config';
import { Database } from '../../src/server/db';
import { buildDemoContent } from '../../src/server/demo';
import { MemoryStore } from '../../src/server/store/memory';

export const ADMIN_PASSWORD = 'test-admin-password';

export async function setup(opts: { demo?: boolean; envPassword?: boolean } = {}) {
  const useEnv = opts.envPassword !== false;
  const config = { ...loadConfig({}), adminPassword: useEnv ? ADMIN_PASSWORD : undefined, staticDir: '/nonexistent' };
  const store = new MemoryStore();
  const { db } = await Database.open(store);
  if (!useEnv) {
    await db.mutate((draft) => {
      draft.secrets.adminPasswordHash = hashPassword(ADMIN_PASSWORD);
    });
  }
  if (opts.demo) {
    await db.mutate((draft) => {
      Object.assign(draft, buildDemoContent(draft.settings));
    });
  }
  const limiter = new LoginLimiter(5, 60_000, 1000);
  const app = createApp({ db, config, limiter });
  const agent = request(app);

  async function login(code: string): Promise<string> {
    const res = await agent.post('/api/auth/login').send({ code });
    if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.token as string;
  }

  const codes = () => ({ participant: db.state.settings.participantCode, organizer: db.state.settings.organizerCode });
  const tokens = {
    participant: await login(codes().participant),
    organizer: await login(codes().organizer),
    admin: await login(ADMIN_PASSWORD),
  };
  const as = (role: keyof typeof tokens) => ({
    get: (url: string) => agent.get(url).set('Authorization', `Bearer ${tokens[role]}`),
    post: (url: string, body: unknown = {}) => agent.post(url).set('Authorization', `Bearer ${tokens[role]}`).send(body as object),
    put: (url: string, body: unknown) => agent.put(url).set('Authorization', `Bearer ${tokens[role]}`).send(body as object),
    patch: (url: string, body: unknown) => agent.patch(url).set('Authorization', `Bearer ${tokens[role]}`).send(body as object),
    del: (url: string) => agent.delete(url).set('Authorization', `Bearer ${tokens[role]}`),
  });
  return { app, db, store, agent, tokens, as, login, codes };
}
