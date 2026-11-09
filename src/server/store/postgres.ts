import pg from 'pg';
import type { BackupInfo, StateStore } from './types';

const AUTO_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_BACKUPS = 40;

/**
 * Stores the state document in PostgreSQL. Works with any hosted Postgres
 * (Neon, Supabase, Render, Railway, Fly, ...). Set DATABASE_URL to enable.
 */
export class PostgresStore implements StateStore {
  readonly kind = 'postgres' as const;
  private readonly pool: pg.Pool;
  private lastAutoBackup = 0;

  constructor(connectionString: string) {
    const needsSsl =
      /sslmode=(require|verify-ca|verify-full|prefer)/.test(connectionString) || process.env.PGSSL === 'true';
    const cleaned = connectionString.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
    this.pool = new pg.Pool({
      connectionString: cleaned,
      ssl: needsSsl ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
      max: 4,
    });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS prototrip_state (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS prototrip_backups (
        id SERIAL PRIMARY KEY,
        reason TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    const res = await this.pool.query('SELECT max(created_at) AS last FROM prototrip_backups');
    const last = res.rows[0]?.last as Date | null;
    if (last) this.lastAutoBackup = last.getTime();
  }

  async load(): Promise<unknown | null> {
    const res = await this.pool.query('SELECT data FROM prototrip_state WHERE id = $1', ['main']);
    return res.rows[0]?.data ?? null;
  }

  async save(state: unknown): Promise<void> {
    if (Date.now() - this.lastAutoBackup > AUTO_BACKUP_INTERVAL_MS) {
      const previous = await this.load().catch(() => null);
      if (previous) await this.backup(previous, 'auto');
    }
    await this.pool.query(
      `INSERT INTO prototrip_state (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      ['main', JSON.stringify(state)],
    );
  }

  async backup(state: unknown, reason: string): Promise<void> {
    await this.pool.query('INSERT INTO prototrip_backups (reason, data) VALUES ($1, $2)', [
      reason.slice(0, 20),
      JSON.stringify(state),
    ]);
    this.lastAutoBackup = Date.now();
    await this.pool.query(
      `DELETE FROM prototrip_backups WHERE id NOT IN (
         SELECT id FROM prototrip_backups ORDER BY created_at DESC LIMIT $1)`,
      [MAX_BACKUPS],
    );
  }

  async listBackups(): Promise<BackupInfo[]> {
    const res = await this.pool.query(
      'SELECT id, reason, created_at, octet_length(data::text) AS size FROM prototrip_backups ORDER BY created_at DESC',
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      reason: r.reason,
      createdAt: (r.created_at as Date).toISOString(),
      size: Number(r.size),
    }));
  }

  async readBackup(id: string): Promise<unknown | null> {
    if (!/^\d+$/.test(id)) return null;
    const res = await this.pool.query('SELECT data FROM prototrip_backups WHERE id = $1', [Number(id)]);
    return res.rows[0]?.data ?? null;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
