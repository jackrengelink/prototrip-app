/**
 * End-to-end test in a real browser (Chromium via Playwright).
 * Builds nothing itself: run `npm run build` first, then `npm run test:e2e`.
 *
 * It starts the production server on a free port with an empty data folder and walks
 * through the main flows for the admin, an organizer and a participant – including
 * using the app offline.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  try {
    ({ chromium } = require(path.join(process.env.NODE_PATH || '', 'playwright')));
  } catch {
    console.error('Playwright is not installed. Install it with: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }
}

const ADMIN = 'e2e-admin-password';
const port = 4300 + Math.floor(Math.random() * 500);
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prototrip-e2e-'));
const shotsDir = process.env.E2E_SCREENSHOTS;

const server = spawn('node', ['dist/server/index.js'], {
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_PASSWORD: ADMIN, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

const steps = [];
function step(name) {
  steps.push(name);
  console.log(`  • ${name}`);
}
function assert(cond, message) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not start:\n${serverLog}`);
}

async function api(token, method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const browser = await chromium.launch();
const errors = [];
async function newPage(name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', timezoneId: 'Europe/Amsterdam', ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`[${name}] ${m.text()}`);
  });
  return { ctx, page };
}
async function shot(page, name) {
  if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });
}

let exitCode = 0;
try {
  await waitForServer();
  console.log(`Server on ${base}`);

  // ---------------------------------------------------------------- admin
  step('admin signs in with the admin password');
  const admin = await newPage('admin');
  await admin.page.goto(base);
  await admin.page.fill('#code', ADMIN);
  // Regression: the service worker taking control on a first visit must not reload the page.
  await admin.page.waitForTimeout(1500);
  assert((await admin.page.inputValue('#code')) === ADMIN, 'typed code survives service worker activation');
  await admin.page.click('button[type=submit]');
  await admin.page.waitForSelector('.hero');
  await admin.page.waitForSelector('text=Get your trip ready');

  const { token: adminToken } = await api(null, 'POST', '/api/auth/login', { code: ADMIN });
  const overview = await api(adminToken, 'GET', '/api/admin/overview');
  const { participantCode, organizerCode } = overview.settings;

  step('admin fills in trip details');
  await admin.page.goto(`${base}/manage`);
  await admin.page.fill('#trip-name', 'E2E Trip');
  await admin.page.fill('#trip-dest', 'Lisbon, Portugal');
  const today = new Date().toISOString().slice(0, 10);
  await admin.page.fill('#trip-start', today);
  await admin.page.fill('#trip-end', today);
  await admin.page.selectOption('#trip-tz', 'Europe/Lisbon');
  await admin.page.click('form:has(#trip-name) button[type=submit]');
  await admin.page.waitForSelector('text=Trip details saved');

  step('admin adds a group and people');
  await admin.page.goto(`${base}/people`);
  await admin.page.click('text=Add group');
  await admin.page.fill('#group-name', 'Team Red');
  await admin.page.click('.modal button[type=submit]');
  await admin.page.waitForSelector('.group-row:has-text("Team Red")');
  for (const [name, organizer] of [
    ['Olivia Orga', true],
    ['Pim Participant', false],
  ]) {
    await admin.page.goto(`${base}/people/new`);
    await admin.page.fill('#p-name', name);
    if (organizer) await admin.page.click('.segmented button:has-text("Organizer")');
    else await admin.page.click('.chip:has-text("Team Red")');
    await admin.page.fill('#p-phone', '+31 6 1234 5678');
    await admin.page.fill('#p-diet', organizer ? '' : 'Vegetarian');
    await admin.page.click('button[type=submit]');
    await admin.page.waitForURL(`${base}/people`);
  }

  step('admin imports a schedule by pasting spreadsheet rows');
  await admin.page.goto(`${base}/manage#import`);
  const csv = [
    'Date;Start;End;Title;Location;Audience;Groups',
    `${today};00:00;23:59;Workshop for everyone;Hub;;`,
    `;00:00;23:58;Secret orga briefing;Lobby;organizers;`,
    `;20:00;21:00;Team Red dinner;Taberna;;Team Red`,
  ].join('\n');
  await admin.page.locator('.import-box').first().locator('textarea').fill(csv);
  await admin.page.waitForSelector('text=3 rows ready to import');
  await admin.page.locator('.import-box').first().locator('button.btn-primary').click();
  await admin.page.waitForSelector('text=Imported 3 items');

  step('admin creates an organizer-only event with private notes');
  await admin.page.goto(`${base}/event/new?date=${today}`);
  await admin.page.fill('#ev-title', 'Count the cash box');
  await admin.page.fill('#ev-start', '23:30');
  await admin.page.click('.segmented button:has-text("Organizers only")');
  await admin.page.fill('#ev-onotes', 'Safe code 4711');
  await admin.page.click('button[type=submit]');
  await admin.page.waitForSelector('h1:has-text("Count the cash box")');
  await admin.page.waitForSelector('text=Safe code 4711');

  step('admin posts an announcement');
  await admin.page.goto(`${base}/news/new`);
  await admin.page.fill('#news-title', 'Bring sunscreen');
  await admin.page.fill('#news-body', 'It will be **hot** today.');
  await admin.page.click('button[type=submit]');
  await admin.page.waitForSelector('.announcement:has-text("Bring sunscreen")');
  await shot(admin.page, 'e2e-admin-news');

  // ---------------------------------------------------------------- participant
  step('participant joins through the invite link');
  const part = await newPage('participant');
  await part.page.goto(`${base}/join/${encodeURIComponent(participantCode)}`);
  await part.page.waitForSelector('.hero:has-text("E2E Trip")');
  await part.page.waitForSelector('text=Bring sunscreen');

  step('participant picks their name and sees their schedule');
  await part.page.click('text=Choose my name');
  await part.page.click('.picker-item:has-text("Pim Participant")');
  await part.page.goto(`${base}/schedule?day=all`);
  await part.page.waitForSelector('text=Workshop for everyone');
  await part.page.waitForSelector('text=Team Red dinner');
  assert((await part.page.locator('text=Secret orga briefing').count()) === 0, 'participant must not see organizer events');
  assert((await part.page.locator('text=Count the cash box').count()) === 0, 'participant must not see organizer events');
  assert((await part.page.locator('.bottom-nav >> text=Tasks').count()) === 0, 'participant has no tasks tab');
  await shot(part.page, 'e2e-participant-schedule');

  step('participant only sees organizer phone numbers and no private details');
  await part.page.goto(`${base}/people`);
  await part.page.waitForSelector('text=Olivia Orga');
  const html = await part.page.content();
  assert(!html.includes('Vegetarian'), 'dietary info hidden from participants');
  assert((await part.page.locator('.person-row:has-text("Olivia Orga") a[href^="tel:"]').count()) === 1, 'organizer phone visible');
  assert((await part.page.locator('.person-row:has-text("Pim Participant") a[href^="tel:"]').count()) === 0, 'participant phone hidden');

  step('participant cannot open admin pages');
  await part.page.goto(`${base}/manage`);
  await part.page.waitForSelector('text=Only the trip admin can change trip details and codes.');

  step('participant can still use the app offline');
  await part.page.goto(`${base}/schedule?day=all`);
  await part.page.waitForSelector('text=Workshop for everyone');
  await part.page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10000 }).catch(() => undefined);
  await part.ctx.setOffline(true);
  await part.page.reload();
  await part.page.waitForSelector('text=Workshop for everyone', { timeout: 10000 });
  await part.page.waitForSelector('.sync-pill.offline');
  await shot(part.page, 'e2e-participant-offline');
  await part.ctx.setOffline(false);

  // ---------------------------------------------------------------- organizer
  step('organizer signs in and sees organizer items with private notes');
  const orga = await newPage('organizer');
  await orga.page.goto(base);
  await orga.page.fill('#code', organizerCode.toLowerCase());
  await orga.page.click('button[type=submit]');
  await orga.page.waitForSelector('.hero');
  await orga.page.goto(`${base}/schedule?day=all`);
  await orga.page.waitForSelector('text=Secret orga briefing');
  await orga.page.click('.segmented button:has-text("Organizers")');
  assert((await orga.page.locator('text=Workshop for everyone').count()) === 0, 'organizer-only filter');
  await orga.page.click('text=Count the cash box');
  await orga.page.waitForSelector('text=Safe code 4711');

  step('organizer adds and completes a task');
  await orga.page.goto(`${base}/tasks`);
  await orga.page.click('.segmented button:has-text("Open")');
  await orga.page.fill('.quick-add input', 'Buy water');
  await orga.page.click('.quick-add button[type=submit]');
  await orga.page.waitForSelector('.task-row:has-text("Buy water")');
  await orga.page.click('.task-row:has-text("Buy water") .task-check');
  await orga.page.waitForSelector('.task-row:has-text("Buy water") .task-check.on', { timeout: 5000 }).catch(async () => {
    await orga.page.click('.segmented button:has-text("Done")');
    await orga.page.waitForSelector('.task-row.done:has-text("Buy water")');
  });

  step('changes show up for participants after a refresh');
  await admin.page.goto(`${base}/schedule?day=all`);
  await admin.page.click('text=Workshop for everyone');
  await admin.page.click('a[aria-label="Edit"]');
  await admin.page.click('text=More options');
  await admin.page.click('.segmented button:has-text("Cancelled")');
  await admin.page.click('button[type=submit]');
  await admin.page.waitForSelector('text=This event has been cancelled.');
  await part.page.goto(`${base}/schedule?day=all`);
  await part.page.waitForSelector('.event-card.is-cancelled:has-text("Workshop for everyone")');

  step('calendar feeds respect roles');
  const pData = await api((await api(null, 'POST', '/api/auth/login', { code: participantCode })).token, 'GET', '/api/data');
  const feed = await (await fetch(`${base}/api/calendar/${pData.calendarToken}.ics`)).text();
  assert(feed.includes('BEGIN:VCALENDAR') && feed.includes('Team Red dinner'), 'participant feed has events');
  assert(!feed.includes('cash box'), 'participant feed hides organizer events');

  step('Dutch translation works');
  await part.page.goto(`${base}/me`);
  await part.page.click('.segmented button:has-text("Nederlands")');
  await part.page.waitForSelector('h1:has-text("Ik")');
  await part.page.goto(`${base}/`);
  await part.page.waitForSelector('.bottom-nav >> text=Programma');

  assert(errors.length === 0, `browser errors:\n${errors.join('\n')}`);
  console.log(`\n✅ ${steps.length} end-to-end steps passed`);
} catch (err) {
  exitCode = 1;
  console.error(`\n❌ Failed after step: ${steps[steps.length - 1]}\n`, err);
  if (errors.length) console.error('Browser errors:\n' + errors.join('\n'));
} finally {
  await browser.close();
  server.kill('SIGTERM');
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(exitCode);
}
