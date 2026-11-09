import type { BackupInfo, StateStore } from './types';

/** In-memory store used by tests. */
export class MemoryStore implements StateStore {
  readonly kind = 'memory' as const;
  data: unknown | null = null;
  backups: { id: string; createdAt: string; reason: string; data: string }[] = [];
  saves = 0;

  async init(): Promise<void> {}
  async load(): Promise<unknown | null> {
    return this.data ? JSON.parse(JSON.stringify(this.data)) : null;
  }
  async save(state: unknown): Promise<void> {
    this.saves++;
    this.data = JSON.parse(JSON.stringify(state));
  }
  async backup(state: unknown, reason: string): Promise<void> {
    this.backups.unshift({
      id: String(this.backups.length + 1),
      createdAt: new Date().toISOString(),
      reason,
      data: JSON.stringify(state),
    });
  }
  async listBackups(): Promise<BackupInfo[]> {
    return this.backups.map((b) => ({ id: b.id, createdAt: b.createdAt, reason: b.reason, size: b.data.length }));
  }
  async readBackup(id: string): Promise<unknown | null> {
    const b = this.backups.find((x) => x.id === id);
    return b ? JSON.parse(b.data) : null;
  }
  async close(): Promise<void> {}
}
