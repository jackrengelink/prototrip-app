export interface BackupInfo {
  id: string;
  createdAt: string;
  reason: string;
  size: number;
}

/**
 * Persists the whole trip state as one JSON document. A trip has at most a few
 * hundred records, so this is simple, atomic and fast.
 */
export interface StateStore {
  readonly kind: 'file' | 'postgres' | 'memory';
  init(): Promise<void>;
  load(): Promise<unknown | null>;
  save(state: unknown): Promise<void>;
  backup(state: unknown, reason: string): Promise<void>;
  listBackups(): Promise<BackupInfo[]>;
  readBackup(id: string): Promise<unknown | null>;
  close(): Promise<void>;
}
