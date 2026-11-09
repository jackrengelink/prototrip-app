import type { ServerConfig } from './config';
import { FileStore } from './store/file';
import { PostgresStore } from './store/postgres';
import type { StateStore } from './store/types';

export function createStore(config: ServerConfig): StateStore {
  if (config.databaseUrl) return new PostgresStore(config.databaseUrl);
  return new FileStore(config.dataDir);
}
