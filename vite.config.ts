import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Builds dist/client/sw.js from src/sw/sw.js with the list of hashed assets to precache. */
function serviceWorker(): Plugin {
  return {
    name: 'prototrip-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => /\.(js|css|svg|png|webp|woff2?)$/.test(f))
        .map((f) => `/${f}`)
        .sort();
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);
      const source = fs
        .readFileSync('src/sw/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(assets));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
