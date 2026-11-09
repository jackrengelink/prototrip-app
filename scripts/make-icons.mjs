/**
 * Renders the app icons in public/icons from inline SVG using Playwright's Chromium.
 * Run with: npm run icons   (only needed when the icon design changes)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('Playwright is needed to render icons (npm i -g playwright).');
  process.exit(1);
}

const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });

const plane = (scale = 1, opacity = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" opacity="${opacity}">
    <path d="M86 238 L414 98 L262 300 Z" fill="#ffffff"/>
    <path d="M262 300 L414 98 L322 420 Z" fill="#ffffff" fill-opacity="0.82"/>
    <path d="M262 300 L322 420 L268 368 Z" fill="#ffffff" fill-opacity="0.6"/>
    <path d="M70 392 C 120 372, 150 420, 214 392" fill="none" stroke="#ffffff" stroke-opacity="0.75" stroke-width="16" stroke-linecap="round" stroke-dasharray="2 34"/>
  </g>`;

const background = (rounded) => `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14a3a8"/>
      <stop offset="1" stop-color="#0b4f7a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#g)"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${body}</svg>`;

const icon = svg(background(true) + plane(0.9));
const fullBleed = svg(background(false) + plane(0.9));
const maskable = svg(background(false) + plane(0.66));
const badge = svg(`<g>${plane(1.05).replace(/fill-opacity="[^"]+"/g, '').replace(/stroke-opacity="[^"]+"/g, '')}</g>`);

fs.writeFileSync(path.join(outDir, 'favicon.svg'), icon);

const targets = [
  { file: 'icon-192.png', svg: icon, size: 192 },
  { file: 'icon-512.png', svg: icon, size: 512 },
  { file: 'maskable-512.png', svg: maskable, size: 512 },
  { file: 'apple-touch-icon.png', svg: fullBleed, size: 180 },
  { file: 'favicon-32.png', svg: icon, size: 32 },
  { file: 'badge-96.png', svg: badge, size: 96, transparent: true },
];

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${t.svg.replace('width="512" height="512"', `width="${t.size}" height="${t.size}"`)}</body></html>`,
  );
  await page.screenshot({ path: path.join(outDir, t.file), omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  console.log('wrote', t.file);
}
await browser.close();
