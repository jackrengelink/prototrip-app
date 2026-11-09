import fs from 'node:fs/promises';
import path from 'node:path';
import type { BackupInfo, StateStore } from './types';

const AUTO_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_BACKUPS = 40;

export class FileStore implements StateStore {
  readonly kind = 'file' as const;
  private readonly file: string;
  private readonly backupDir: string;
  private lastAutoBackup = 0;

  constructor(dir: string) {
    this.file = path.join(dir, 'state.json');
    this.backupDir = path.join(dir, 'backups');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.backupDir, { recursive: true });
    const backups = await this.listBackups();
    if (backups[0]) this.lastAutoBackup = Date.parse(backups[0].createdAt) || 0;
  }

  async load(): Promise<unknown | null> {
    try {
      const text = await fs.readFile(this.file, 'utf8');
      return JSON.parse(text);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(state: unknown): Promise<void> {
    if (Date.now() - this.lastAutoBackup > AUTO_BACKUP_INTERVAL_MS) {
      const previous = await this.load().catch(() => null);
      if (previous) await this.backup(previous, 'auto');
    }
    const tmp = `${this.file}.${process.pid}.tmp`;
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(JSON.stringify(state));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, this.file);
  }

  async backup(state: unknown, reason: string): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = reason.replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'manual';
    await fs.mkdir(this.backupDir, { recursive: true });
    await fs.writeFile(path.join(this.backupDir, `state-${stamp}-${safeReason}.json`), JSON.stringify(state));
    this.lastAutoBackup = Date.now();
    const backups = await this.listBackups();
    for (const old of backups.slice(MAX_BACKUPS)) {
      await fs.rm(path.join(this.backupDir, `${old.id}.json`), { force: true });
    }
  }

  async listBackups(): Promise<BackupInfo[]> {
    let names: string[] = [];
    try {
      names = await fs.readdir(this.backupDir);
    } catch {
      return [];
    }
    const out: BackupInfo[] = [];
    for (const name of names) {
      const m = name.match(/^state-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-([a-z0-9-]+)\.json$/i);
      if (!m) continue;
      const iso = m[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');
      const stat = await fs.stat(path.join(this.backupDir, name)).catch(() => null);
      out.push({ id: name.replace(/\.json$/, ''), createdAt: iso, reason: m[2], size: stat?.size ?? 0 });
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async readBackup(id: string): Promise<unknown | null> {
    if (!/^state-[\w-]+$/.test(id)) return null;
    try {
      return JSON.parse(await fs.readFile(path.join(this.backupDir, `${id}.json`), 'utf8'));
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {}
}
