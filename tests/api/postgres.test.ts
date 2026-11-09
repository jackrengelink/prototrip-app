/**
 * Runs only when TEST_DATABASE_URL points at a disposable PostgreSQL database, e.g.
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/prototrip_test npm test
 */
import { describe, expect, it } from 'vitest';
import { Database } from '../../src/server/db';
import { PostgresStore } from '../../src/server/store/postgres';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PostgresStore', () => {
  it('creates, saves, reloads and backs up the state', async () => {
    const store = new PostgresStore(url!);
    await store.init();
    // Start clean.
    const pool = (store as unknown as { pool: { query(q: string): Promise<unknown> } }).pool;
    await pool.query('DELETE FROM prototrip_state; DELETE FROM prototrip_backups;');

    const { db, created } = await Database.open(store);
    expect(created).toBe(true);
    await db.mutate((d) => {
      d.settings.name = 'PG Trip';
    });
    await db.backupNow('manual');
    await db.close();

    const store2 = new PostgresStore(url!);
    const { db: db2, created: created2 } = await Database.open(store2);
    expect(created2).toBe(false);
    expect(db2.state.settings.name).toBe('PG Trip');
    const backups = await store2.listBackups();
    expect(backups.length).toBeGreaterThan(0);
    const restored = (await store2.readBackup(backups[0].id)) as { settings: { name: string } };
    expect(restored.settings.name).toBe('PG Trip');
    await db2.close();
  });
});
