import webpush from 'web-push';
import { nowIso } from './ids';
import { type AppState, createInitialState, normalizeState } from './state';
import type { StateStore } from './store/types';

function generateVapid() {
  return webpush.generateVAPIDKeys();
}

/**
 * Holds the trip state in memory and persists every change through the store.
 * Mutations run one at a time against a copy; the copy only replaces the live
 * state after it was saved successfully, so a failed write never leaves the app
 * half-updated.
 */
export class Database {
  private current: AppState;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    readonly store: StateStore,
    state: AppState,
  ) {
    this.current = state;
  }

  static async open(store: StateStore): Promise<{ db: Database; created: boolean }> {
    await store.init();
    const raw = await store.load();
    if (raw) {
      const db = new Database(store, normalizeState(raw, generateVapid));
      return { db, created: false };
    }
    const state = createInitialState(generateVapid());
    await store.save(state);
    return { db: new Database(store, state), created: true };
  }

  /** Read-only view of the current state. Never mutate the returned object. */
  get state(): Readonly<AppState> {
    return this.current;
  }

  /** Apply a change. `fn` receives a draft copy it may freely modify. */
  mutate<T>(fn: (draft: AppState) => T, opts: { bumpVersion?: boolean } = {}): Promise<T> {
    const run = async (): Promise<T> => {
      const draft = structuredClone(this.current);
      const result = fn(draft);
      if (opts.bumpVersion !== false) {
        draft.version = this.current.version + 1;
        draft.updatedAt = nowIso();
      }
      await this.store.save(draft);
      this.current = draft;
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Replace the whole state (import / restore), keeping a backup of what was there. */
  async replace(next: AppState, reason: string): Promise<void> {
    await this.store.backup(this.current, `before-${reason}`);
    await this.mutate((draft) => {
      Object.assign(draft, structuredClone(next));
    });
  }

  async backupNow(reason: string): Promise<void> {
    await this.store.backup(this.current, reason);
  }

  async close(): Promise<void> {
    await this.queue;
    await this.store.close();
  }
}
