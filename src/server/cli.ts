/**
 * Maintenance commands:
 *   npm run seed:demo                 – replace the trip content with the example trip
 *   npm run reset-admin-password [pw] – set a new admin password (prints it)
 */
import { generatePassword, hashPassword } from './auth';
import { loadConfig } from './config';
import { Database } from './db';
import { buildDemoContent } from './demo';
import { createStore } from './storage';

async function main() {
  const [command, arg] = process.argv.slice(2);
  const config = loadConfig();
  const { db } = await Database.open(createStore(config));
  try {
    if (command === 'seed-demo') {
      await db.backupNow('before-demo');
      await db.mutate((draft) => {
        Object.assign(draft, buildDemoContent(draft.settings));
      });
      const s = db.state.settings;
      console.log(`Loaded the example trip "${s.name}".`);
      console.log(`Participant code: ${s.participantCode}\nOrganizer code:   ${s.organizerCode}`);
    } else if (command === 'reset-admin-password') {
      const password = arg || generatePassword();
      if (password.length < 8) throw new Error('Use at least 8 characters.');
      await db.mutate((draft) => {
        draft.secrets.adminPasswordHash = hashPassword(password);
        draft.secrets.generations.admin++;
      });
      console.log(`New admin password: ${password}`);
      if (config.adminPassword) console.log('Note: ADMIN_PASSWORD is set in the environment and takes precedence.');
    } else {
      console.log('Usage: tsx src/server/cli.ts <seed-demo | reset-admin-password [password]>');
      process.exitCode = 1;
    }
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
