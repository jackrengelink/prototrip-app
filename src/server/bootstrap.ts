import { generatePassword, hashPassword } from './auth';
import type { ServerConfig } from './config';
import { Database } from './db';
import { buildDemoContent } from './demo';
import { createStore } from './storage';

export interface BootResult {
  db: Database;
  created: boolean;
  generatedAdminPassword?: string;
}

/** Open the database and make sure there is a way to sign in as admin. */
export async function bootstrap(config: ServerConfig): Promise<BootResult> {
  const store = createStore(config);
  const { db, created } = await Database.open(store);
  let generatedAdminPassword: string | undefined;

  if (!config.adminPassword && !db.state.secrets.adminPasswordHash) {
    generatedAdminPassword = generatePassword();
    const hash = hashPassword(generatedAdminPassword);
    await db.mutate((draft) => {
      draft.secrets.adminPasswordHash = hash;
    });
  }

  if (created && config.seedDemo) {
    await db.mutate((draft) => {
      Object.assign(draft, buildDemoContent(draft.settings));
    });
  }

  return { db, created, generatedAdminPassword };
}

export function printWelcome(config: ServerConfig, boot: BootResult): void {
  const s = boot.db.state.settings;
  const line = '─'.repeat(64);
  const out = [
    '',
    line,
    `  ✈  ${s.name} is running`,
    line,
    `  Storage:           ${boot.db.store.kind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : `files in ${config.dataDir}`}`,
    `  Participant code:  ${s.participantCode}`,
    `  Organizer code:    ${s.organizerCode}`,
  ];
  if (config.adminPassword) out.push('  Admin password:    (from the ADMIN_PASSWORD environment variable)');
  else if (boot.generatedAdminPassword) {
    out.push(`  Admin password:    ${boot.generatedAdminPassword}`);
    out.push('                     ↑ write this down – it is only shown once.');
    out.push('                     Change it in the app under Manage → Access & sharing.');
  } else out.push('  Admin password:    (set earlier – reset with "npm run reset-admin-password")');
  out.push(line, '');
  console.log(out.join('\n'));
  if (config.isProduction && boot.db.store.kind === 'file') {
    console.warn(
      [
        `⚠  Data is stored as files in ${config.dataDir}.`,
        '   Make sure this folder is on a persistent disk/volume – on hosts like Render (free) or',
        '   Heroku the filesystem is wiped on every restart. Otherwise set DATABASE_URL to a PostgreSQL',
        '   database. See docs/DEPLOYMENT.md.',
        '',
      ].join('\n'),
    );
  }
}
