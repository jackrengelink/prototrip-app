import path from 'node:path';

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  databaseUrl?: string;
  adminPassword?: string;
  publicUrl?: string;
  vapidSubject: string;
  trustProxy: string | number | boolean;
  staticDir: string;
  isProduction: boolean;
  seedDemo: boolean;
}

function parseTrustProxy(value: string | undefined): string | number | boolean {
  if (value === undefined || value === '') return 1;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === 'production';
  const publicUrl = env.PUBLIC_URL?.replace(/\/$/, '') || undefined;
  return {
    port: Number(env.PORT) || 3000,
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR || 'data'),
    databaseUrl: env.DATABASE_URL || undefined,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    publicUrl,
    vapidSubject: env.VAPID_SUBJECT || (publicUrl?.startsWith('https://') ? publicUrl : 'mailto:prototrip@example.com'),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    staticDir: path.resolve(env.STATIC_DIR || 'dist/client'),
    isProduction,
    seedDemo: env.SEED_DEMO === 'true' || env.SEED_DEMO === '1',
  };
}
