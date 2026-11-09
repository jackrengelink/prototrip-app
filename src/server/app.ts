import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import { apiErrorHandler, createApiRouter } from './api';
import type { LoginLimiter } from './auth';
import type { ServerConfig } from './config';
import type { Database } from './db';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function createApp(opts: { db: Database; config: ServerConfig; limiter?: LoginLimiter }): express.Express {
  const { db, config } = opts;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'DENY');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.set('Content-Security-Policy', CSP);
    next();
  });
  app.use(compression());

  const api = express.Router();
  api.use(express.json({ limit: '5mb' }));
  api.use(createApiRouter({ db, config, limiter: opts.limiter }));
  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  api.use(apiErrorHandler);
  app.use('/api', api);

  // Manifest with the trip's own name and colour, so the installed app is called e.g. "ProtoTrip 2027".
  app.get('/manifest.webmanifest', (_req, res) => {
    const s = db.state.settings;
    res.set('Content-Type', 'application/manifest+json; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    res.send(
      JSON.stringify({
        name: s.name,
        short_name: s.name.length > 14 ? s.name.slice(0, 14).trim() : s.name,
        description: s.tagline || 'The trip schedule for participants and organizers.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f5f7',
        theme_color: s.accentColor,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }),
    );
  });

  const indexFile = path.join(config.staticDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(
      express.static(config.staticDir, {
        index: false,
        setHeaders(res, filePath) {
          const rel = path.relative(config.staticDir, filePath).split(path.sep).join('/');
          if (rel.startsWith('assets/')) res.set('Cache-Control', 'public, max-age=31536000, immutable');
          else if (rel === 'sw.js' || rel.endsWith('.webmanifest')) res.set('Cache-Control', 'no-cache');
          else res.set('Cache-Control', 'public, max-age=3600');
        },
      }),
    );
    // Single-page app: every other GET serves index.html.
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      if (req.method !== 'GET' || path.extname(req.path)) return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(indexFile);
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .type('text/plain')
        .send('ProtoTrip API is running. Build the web app with "npm run build" (or use "npm run dev" during development).');
    });
  }

  return app;
}
