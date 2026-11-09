import { createApp } from './app';
import { bootstrap, printWelcome } from './bootstrap';
import { loadConfig } from './config';

async function main() {
  const config = loadConfig();
  const boot = await bootstrap(config);
  printWelcome(config, boot);

  const app = createApp({ db: boot.db, config });
  const server = app.listen(config.port, config.host, () => {
    console.log(`Listening on http://localhost:${config.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down…`);
    server.close();
    try {
      await boot.db.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start ProtoTrip:', err);
  process.exit(1);
});
