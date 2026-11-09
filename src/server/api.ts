import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { buildIcs } from '../shared/ics';
import {
  type Announcement,
  announcementInputSchema,
  type EventInput,
  eventInputSchema,
  formatZodError,
  type Group,
  groupInputSchema,
  type InfoPage,
  infoPageInputSchema,
  type Person,
  type PersonInput,
  personInputSchema,
  type Role,
  type ScheduleEvent,
  settingsInputSchema,
  type Task,
  taskInputSchema,
  type TripExport,
} from '../shared/schemas';
import { eventTiming } from '../shared/time';
import { canEditRole, eventRelevantForPerson, isOrganizerRole } from '../shared/visibility';
import { buildDemoContent } from './demo';
import {
  calendarToken,
  hashPassword,
  issueToken,
  LoginLimiter,
  safeEqual,
  verifyCalendarToken,
  verifyPassword,
  verifyToken,
} from './auth';
import type { ServerConfig } from './config';
import type { Database } from './db';
import { newId, nowIso } from './ids';
import { sendPush } from './push';
import { buildSnapshot } from './snapshot';
import { type AppState, createInitialState, normalizeState, starterInfoPages } from './state';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiContext {
  db: Database;
  config: ServerConfig;
  limiter?: LoginLimiter;
}

const GROUP_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#059669'];

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, formatZodError(result.error), result.error.issues);
  return result.data;
}

function roleOf(res: Response): Role {
  return res.locals.role as Role;
}

function stripMarkdown(text: string | undefined, max = 180): string {
  if (!text) return '';
  const plain = text
    .replace(/[#*_`>~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

export function formatWhen(ev: Pick<ScheduleEvent, 'date' | 'startTime' | 'endDate' | 'endTime' | 'timezone'>, state: AppState): string {
  const locale = state.settings.defaultLanguage === 'nl' ? 'nl-NL' : 'en-GB';
  const t = eventTiming(ev, state.settings.timezone);
  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: t.allDay ? 'UTC' : t.tz,
  }).format(t.allDay ? new Date(`${ev.date}T12:00:00Z`) : new Date(t.startMs));
  if (t.allDay) return day;
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: t.tz });
  const start = time.format(new Date(t.startMs));
  return t.endMs ? `${day} ${start}–${time.format(new Date(t.endMs))}` : `${day} ${start}`;
}

/** Keep only references to groups / people that exist. */
function cleanRefs(state: AppState, input: { groupIds?: string[]; assigneeIds?: string[] }) {
  const groupIds = new Set(state.groups.map((g) => g.id));
  const personIds = new Set(state.people.map((p) => p.id));
  if (input.groupIds) input.groupIds = [...new Set(input.groupIds.filter((id) => groupIds.has(id)))];
  if (input.assigneeIds) input.assigneeIds = [...new Set(input.assigneeIds.filter((id) => personIds.has(id)))];
}

function findOr404<T extends { id: string }>(list: T[], id: string, what: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new HttpError(404, `${what} not found`);
  return item;
}

function ensureGroupsByName(draft: AppState, names: string[]): { ids: string[]; created: string[] } {
  const ids: string[] = [];
  const created: string[] = [];
  for (const raw of names) {
    const name = raw.trim().slice(0, 60);
    if (!name) continue;
    let g = draft.groups.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!g) {
      const ts = nowIso();
      g = {
        id: newId('g_'),
        name,
        color: GROUP_COLORS[draft.groups.length % GROUP_COLORS.length],
        description: undefined,
        createdAt: ts,
        updatedAt: ts,
      };
      draft.groups.push(g);
      created.push(name);
    }
    if (!ids.includes(g.id)) ids.push(g.id);
  }
  return { ids, created };
}

const importedEventSchema = z.object({
  groupNames: z.array(z.string()).max(50).default([]),
  assigneeNames: z.array(z.string()).max(50).default([]),
});

const importedPersonSchema = z.object({ groupNames: z.array(z.string()).max(50).default([]) });

/** Re-validate a stored entity from an export file, keeping its id and timestamps. */
function reviveEntity<S extends z.ZodType>(schema: S, raw: unknown, prefix: string): z.output<S> & { id: string; createdAt: string; updatedAt: string } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const data = parse(schema, obj) as Record<string, unknown>;
  const id = typeof obj.id === 'string' && /^[\w-]{1,64}$/.test(obj.id) ? obj.id : newId(prefix);
  const createdAt = typeof obj.createdAt === 'string' && !Number.isNaN(Date.parse(obj.createdAt)) ? obj.createdAt : nowIso();
  const updatedAt = typeof obj.updatedAt === 'string' && !Number.isNaN(Date.parse(obj.updatedAt)) ? obj.updatedAt : createdAt;
  return { ...data, id, createdAt, updatedAt } as z.output<S> & { id: string; createdAt: string; updatedAt: string };
}

export function exportTrip(state: AppState): TripExport {
  return {
    format: 'prototrip-export',
    formatVersion: 1,
    exportedAt: nowIso(),
    settings: state.settings,
    events: state.events,
    tasks: state.tasks,
    announcements: state.announcements,
    people: state.people,
    groups: state.groups,
    infoPages: state.infoPages,
  };
}

/** Validate an export file and turn it into content for the current state (secrets are kept). */
export function contentFromExport(raw: unknown, current: AppState, keepCodes: boolean): Partial<AppState> {
  const data = (raw && typeof raw === 'object' ? raw : null) as Partial<TripExport> | null;
  if (!data || data.format !== 'prototrip-export') throw new HttpError(400, 'This is not a ProtoTrip export file.');
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const wrap = <T>(what: string, fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof HttpError) throw new HttpError(400, `${what}: ${err.message}`);
      throw err;
    }
  };
  const settings = wrap('Settings', () => parse(settingsInputSchema, { ...current.settings, ...(data.settings || {}) }));
  if (keepCodes) {
    settings.participantCode = current.settings.participantCode;
    settings.organizerCode = current.settings.organizerCode;
  }
  const groups = list(data.groups).map((g, i) => wrap(`Group ${i + 1}`, () => reviveEntity(groupInputSchema, g, 'g_'))) as Group[];
  const people = list(data.people).map((p, i) => wrap(`Person ${i + 1}`, () => reviveEntity(personInputSchema, p, 'u_'))) as Person[];
  const events = list(data.events).map((e, i) => wrap(`Event ${i + 1}`, () => reviveEntity(eventInputSchema, e, 'e_'))) as ScheduleEvent[];
  const tasks = list(data.tasks).map((t, i) => {
    const task = wrap(`Task ${i + 1}`, () => reviveEntity(taskInputSchema, t, 't_')) as Task;
    const rawTask = t as Partial<Task>;
    if (task.done && typeof rawTask.doneAt === 'string') task.doneAt = rawTask.doneAt;
    if (task.done && typeof rawTask.doneBy === 'string') task.doneBy = rawTask.doneBy;
    return task;
  });
  const announcements = list(data.announcements).map((a, i) =>
    wrap(`Announcement ${i + 1}`, () => reviveEntity(announcementInputSchema, a, 'a_')),
  ) as Announcement[];
  const infoPages = list(data.infoPages).map((p, i) => wrap(`Info page ${i + 1}`, () => reviveEntity(infoPageInputSchema, p, 'p_'))) as InfoPage[];
  const content = { settings, groups, people, events, tasks, announcements, infoPages };
  const tmp = { ...current, ...content } as AppState;
  for (const ev of tmp.events) cleanRefs(tmp, ev);
  for (const t of tmp.tasks) cleanRefs(tmp, t);
  for (const p of tmp.people) cleanRefs(tmp, p);
  return content;
}

export function createApiRouter(ctx: ApiContext): express.Router {
  const { db, config } = ctx;
  const limiter = ctx.limiter ?? new LoginLimiter();
  const router = express.Router();

  const pushSubject = config.vapidSubject;
  const notify = (audience: 'everyone' | 'organizers', message: Parameters<typeof sendPush>[3]) => {
    sendPush(db, pushSubject, audience, message).catch((err) => console.warn('[push] failed', err));
  };

  /* ---------------- middleware ---------------- */

  const auth = (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    const role = verifyToken(db.state, token);
    if (!role) {
      res.status(401).json({ error: 'Please sign in again.', code: 'unauthorized' });
      return;
    }
    res.locals.role = role;
    next();
  };
  const requireOrganizer = (_req: Request, res: Response, next: NextFunction) => {
    if (!isOrganizerRole(roleOf(res))) throw new HttpError(403, 'Only organizers can do this.');
    next();
  };
  const requireEditor = (_req: Request, res: Response, next: NextFunction) => {
    if (!canEditRole(roleOf(res), db.state.settings.organizersCanEdit)) {
      throw new HttpError(403, 'You do not have permission to edit the trip.');
    }
    next();
  };
  const requireAdmin = (_req: Request, res: Response, next: NextFunction) => {
    if (roleOf(res) !== 'admin') throw new HttpError(403, 'Only the trip admin can do this.');
    next();
  };

  const ok = (res: Response, extra: Record<string, unknown> = {}) => res.json({ ok: true, version: db.state.version, ...extra });

  /* ---------------- public ---------------- */

  router.get('/health', (_req, res) => {
    res.json({ ok: true, storage: db.store.kind, version: db.state.version });
  });

  router.get('/public-info', (_req, res) => {
    const s = db.state.settings;
    res.set('Cache-Control', 'no-cache');
    res.json({ name: s.name, tagline: s.tagline, accentColor: s.accentColor, defaultLanguage: s.defaultLanguage });
  });

  router.post('/auth/login', (req, res) => {
    const key = req.ip || 'unknown';
    const wait = limiter.blockedFor(key);
    if (wait > 0) {
      res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`, code: 'rate_limited' });
      return;
    }
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!code || code.length > 200) {
      res.status(400).json({ error: 'Enter your trip code.', code: 'missing_code' });
      return;
    }
    const s = db.state.settings;
    let role: Role | null = null;
    const isAdmin = config.adminPassword ? safeEqual(code, config.adminPassword) : verifyPassword(code, db.state.secrets.adminPasswordHash);
    if (isAdmin) role = 'admin';
    else if (safeEqual(code.toLowerCase(), s.organizerCode.toLowerCase())) role = 'organizer';
    else if (safeEqual(code.toLowerCase(), s.participantCode.toLowerCase())) role = 'participant';
    if (!role) {
      limiter.fail(key);
      res.status(401).json({ error: 'That code is not right. Check the code you received from the organizers.', code: 'invalid_code' });
      return;
    }
    limiter.succeed(key);
    res.json({ token: issueToken(db.state, role), role });
  });

  /* ---------------- calendar feed ---------------- */

  router.get('/calendar/:file', (req, res) => {
    const file = String(req.params.file);
    const token = file.replace(/\.ics$/i, '');
    const feedRole = verifyCalendarToken(db.state, token);
    if (!feedRole) {
      res.status(404).type('text/plain').send('Calendar not found. Ask the organizers for a new link.');
      return;
    }
    const state = db.state;
    const personId = typeof req.query.person === 'string' ? req.query.person : undefined;
    const person = personId ? state.people.find((p) => p.id === personId) : undefined;
    const scope = req.query.scope === 'participants' ? 'participants' : 'all';
    const remind = Math.min(Math.max(Number(req.query.remind) || 0, 0), 24 * 60);
    let events = state.events.filter((e) => e.audience === 'everyone' || feedRole === 'organizer');
    if (scope === 'participants') events = events.filter((e) => e.audience === 'everyone');
    if (person) events = events.filter((e) => eventRelevantForPerson(e, person));
    const nameSuffix = person ? ` – ${person.name}` : feedRole === 'organizer' && scope === 'all' ? ' (organizers)' : '';
    const ics = buildIcs({
      calendarName: `${state.settings.name}${nameSuffix}`,
      tripTimezone: state.settings.timezone,
      events,
      baseUrl: config.publicUrl || `${req.protocol}://${req.get('host')}`,
      includeOrganizerNotes: feedRole === 'organizer',
      reminderMinutes: remind || undefined,
      peopleNames: Object.fromEntries(state.people.map((p) => [p.id, p.name])),
      groupNames: Object.fromEntries(state.groups.map((g) => [g.id, g.name])),
    });
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    res.set('Content-Disposition', `inline; filename="${state.settings.name.replace(/[^\w-]+/g, '-') || 'trip'}.ics"`);
    res.send(ics);
  });

  /* ---------------- everything below needs a session ---------------- */

  router.use(auth);

  router.get('/data', (req, res) => {
    const role = roleOf(res);
    const etag = `W/"${db.state.version}-${role}-${db.state.secrets.generations[role]}-${db.state.settings.organizersCanEdit ? 1 : 0}"`;
    res.set('ETag', etag);
    res.set('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.json(buildSnapshot(db.state, role, { adminPasswordFromEnv: !!config.adminPassword }));
  });

  /* ---------------- events ---------------- */

  router.post('/events', requireEditor, async (req, res) => {
    const input = parse(eventInputSchema, req.body);
    const ev = await db.mutate((draft) => {
      cleanRefs(draft, input);
      const ts = nowIso();
      const created: ScheduleEvent = { ...input, id: newId('e_'), createdAt: ts, updatedAt: ts };
      draft.events.push(created);
      return created;
    });
    if (req.body?.notify) {
      notify(ev.audience, { title: `🆕 ${ev.title}`, body: formatWhen(ev, db.state), url: `/event/${ev.id}`, tag: ev.id });
    }
    ok(res, { id: ev.id });
  });

  router.put('/events/:id', requireEditor, async (req, res) => {
    const input = parse(eventInputSchema, req.body);
    const id = String(req.params.id);
    const ev = await db.mutate((draft) => {
      const existing = findOr404(draft.events, id, 'Event');
      cleanRefs(draft, input);
      const updated: ScheduleEvent = { ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: nowIso() };
      draft.events[draft.events.indexOf(existing)] = updated;
      return updated;
    });
    if (req.body?.notify) {
      const prefix = ev.status === 'cancelled' ? '❌' : '🔄';
      notify(ev.audience, {
        title: `${prefix} ${ev.title}`,
        body: [ev.changeNote, formatWhen(ev, db.state)].filter(Boolean).join(' · '),
        url: `/event/${ev.id}`,
        tag: ev.id,
        urgent: ev.status === 'cancelled',
      });
    }
    ok(res, { id: ev.id });
  });

  router.delete('/events/:id', requireEditor, async (req, res) => {
    const id = String(req.params.id);
    await db.mutate((draft) => {
      findOr404(draft.events, id, 'Event');
      draft.events = draft.events.filter((e) => e.id !== id);
      for (const t of draft.tasks) if (t.eventId === id) t.eventId = undefined;
    });
    ok(res);
  });

  router.post('/events/import', requireEditor, async (req, res) => {
    const mode = req.body?.mode === 'replace' ? 'replace' : 'append';
    const rows: unknown[] = Array.isArray(req.body?.events) ? req.body.events : [];
    if (!rows.length) throw new HttpError(400, 'There are no events to import.');
    if (rows.length > 2000) throw new HttpError(400, 'Too many events in one import (max 2000).');
    const errors: { index: number; message: string }[] = [];
    const parsed: { input: EventInput; groupNames: string[]; assigneeNames: string[] }[] = [];
    rows.forEach((row, index) => {
      const r = eventInputSchema.safeParse(row);
      const extra = importedEventSchema.safeParse(row);
      if (!r.success) errors.push({ index, message: formatZodError(r.error) });
      else parsed.push({ input: r.data, groupNames: extra.success ? extra.data.groupNames : [], assigneeNames: extra.success ? extra.data.assigneeNames : [] });
    });
    if (errors.length) throw new HttpError(400, `${errors.length} event(s) could not be imported.`, errors);
    if (mode === 'replace') await db.backupNow('before-import');
    const summary = await db.mutate((draft) => {
      const createdGroups: string[] = [];
      const unknownPeople = new Set<string>();
      if (mode === 'replace') {
        draft.events = [];
        for (const t of draft.tasks) t.eventId = undefined;
      }
      for (const { input, groupNames, assigneeNames } of parsed) {
        const g = ensureGroupsByName(draft, groupNames);
        createdGroups.push(...g.created);
        const assignees: string[] = [];
        for (const name of assigneeNames) {
          const p = draft.people.find((x) => x.name.toLowerCase() === name.toLowerCase())
            ?? draft.people.find((x) => x.name.toLowerCase().split(' ')[0] === name.toLowerCase());
          if (p) assignees.push(p.id);
          else unknownPeople.add(name);
        }
        const ts = nowIso();
        const ev: ScheduleEvent = {
          ...input,
          groupIds: [...new Set([...input.groupIds, ...g.ids])],
          assigneeIds: [...new Set([...input.assigneeIds, ...assignees])],
          id: newId('e_'),
          createdAt: ts,
          updatedAt: ts,
        };
        cleanRefs(draft, ev);
        draft.events.push(ev);
      }
      return { imported: parsed.length, createdGroups, unknownPeople: [...unknownPeople] };
    });
    ok(res, summary);
  });

  /* ---------------- tasks (any organizer) ---------------- */

  router.post('/tasks', requireOrganizer, async (req, res) => {
    const input = parse(taskInputSchema, req.body);
    const task = await db.mutate((draft) => {
      cleanRefs(draft, input);
      if (input.eventId && !draft.events.some((e) => e.id === input.eventId)) input.eventId = undefined;
      const ts = nowIso();
      const created: Task = { ...input, id: newId('t_'), createdAt: ts, updatedAt: ts };
      if (created.done) created.doneAt = ts;
      draft.tasks.push(created);
      return created;
    });
    ok(res, { id: task.id });
  });

  router.put('/tasks/:id', requireOrganizer, async (req, res) => {
    const input = parse(taskInputSchema, req.body);
    const id = String(req.params.id);
    await db.mutate((draft) => {
      const existing = findOr404(draft.tasks, id, 'Task');
      cleanRefs(draft, input);
      if (input.eventId && !draft.events.some((e) => e.id === input.eventId)) input.eventId = undefined;
      const updated: Task = { ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: nowIso() };
      if (updated.done) {
        updated.doneAt = existing.done ? existing.doneAt : nowIso();
        updated.doneBy = existing.done ? existing.doneBy : undefined;
      }
      draft.tasks[draft.tasks.indexOf(existing)] = updated;
    });
    ok(res, { id });
  });

  router.patch('/tasks/:id/done', requireOrganizer, async (req, res) => {
    const body = parse(z.object({ done: z.boolean(), by: z.string().max(64).optional() }), req.body);
    const id = String(req.params.id);
    await db.mutate((draft) => {
      const task = findOr404(draft.tasks, id, 'Task');
      task.done = body.done;
      task.doneAt = body.done ? nowIso() : undefined;
      task.doneBy = body.done && body.by && draft.people.some((p) => p.id === body.by) ? body.by : undefined;
      task.updatedAt = nowIso();
    });
    ok(res, { id });
  });

  router.delete('/tasks/:id', requireOrganizer, async (req, res) => {
    const id = String(req.params.id);
    await db.mutate((draft) => {
      findOr404(draft.tasks, id, 'Task');
      draft.tasks = draft.tasks.filter((t) => t.id !== id);
    });
    ok(res);
  });

  /* ---------------- announcements ---------------- */

  router.post('/announcements', requireEditor, async (req, res) => {
    const input = parse(announcementInputSchema, req.body);
    const a = await db.mutate((draft) => {
      const ts = nowIso();
      const created: Announcement = { ...input, id: newId('a_'), createdAt: ts, updatedAt: ts };
      draft.announcements.push(created);
      return created;
    });
    if (req.body?.notify) {
      const icon = a.level === 'urgent' ? '🚨' : a.level === 'important' ? '❗' : '📣';
      notify(a.audience, { title: `${icon} ${a.title}`, body: stripMarkdown(a.body), url: `/news#${a.id}`, tag: a.id, urgent: a.level === 'urgent' });
    }
    ok(res, { id: a.id });
  });

  router.put('/announcements/:id', requireEditor, async (req, res) => {
    const input = parse(announcementInputSchema, req.body);
    const id = String(req.params.id);
    const a = await db.mutate((draft) => {
      const existing = findOr404(draft.announcements, id, 'Announcement');
      const updated: Announcement = { ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: nowIso() };
      draft.announcements[draft.announcements.indexOf(existing)] = updated;
      return updated;
    });
    if (req.body?.notify) {
      notify(a.audience, { title: `📣 ${a.title}`, body: stripMarkdown(a.body), url: `/news#${a.id}`, tag: a.id, urgent: a.level === 'urgent' });
    }
    ok(res, { id });
  });

  router.delete('/announcements/:id', requireEditor, async (req, res) => {
    const id = String(req.params.id);
    await db.mutate((draft) => {
      findOr404(draft.announcements, id, 'Announcement');
      draft.announcements = draft.announcements.filter((a) => a.id !== id);
    });
    ok(res);
  });

  /* ---------------- people ---------------- */

  router.post('/people', requireEditor, async (req, res) => {
    const input = parse(personInputSchema, req.body);
    const p = await db.mutate((draft) => {
      cleanRefs(draft, input);
      const ts = nowIso();
      const created: Person = { ...input, id: newId('u_'), createdAt: ts, updatedAt: ts };
      draft.people.push(created);
      return created;
    });
    ok(res, { id: p.id });
  });

  router.put('/people/:id', requireEditor, async (req, res) => {
    const input = parse(personInputSchema, req.body);
    const id = String(req.params.id);
    await db.mutate((draft) => {
      const existing = findOr404(draft.people, id, 'Person');
      cleanRefs(draft, input);
      draft.people[draft.people.indexOf(existing)] = { ...input, id, createdAt: existing.createdAt, updatedAt: nowIso() };
    });
    ok(res, { id });
  });

  router.delete('/people/:id', requireEditor, async (req, res) => {
    const id = String(req.params.id);
    await db.mutate((draft) => {
      findOr404(draft.people, id, 'Person');
      draft.people = draft.people.filter((p) => p.id !== id);
      for (const e of draft.events) e.assigneeIds = e.assigneeIds.filter((x) => x !== id);
      for (const t of draft.tasks) {
        t.assigneeIds = t.assigneeIds.filter((x) => x !== id);
        if (t.doneBy === id) t.doneBy = undefined;
      }
      for (const s of draft.push.subscriptions) if (s.personId === id) s.personId = undefined;
    });
    ok(res);
  });

  router.post('/people/import', requireEditor, async (req, res) => {
    const mode = req.body?.mode === 'replace' ? 'replace' : 'append';
    const rows: unknown[] = Array.isArray(req.body?.people) ? req.body.people : [];
    if (!rows.length) throw new HttpError(400, 'There is nobody to import.');
    if (rows.length > 2000) throw new HttpError(400, 'Too many people in one import (max 2000).');
    const errors: { index: number; message: string }[] = [];
    const parsed: { input: PersonInput; groupNames: string[] }[] = [];
    rows.forEach((row, index) => {
      const r = personInputSchema.safeParse(row);
      const extra = importedPersonSchema.safeParse(row);
      if (!r.success) errors.push({ index, message: formatZodError(r.error) });
      else parsed.push({ input: r.data, groupNames: extra.success ? extra.data.groupNames : [] });
    });
    if (errors.length) throw new HttpError(400, `${errors.length} person/people could not be imported.`, errors);
    if (mode === 'replace') await db.backupNow('before-import');
    const summary = await db.mutate((draft) => {
      let added = 0;
      let updated = 0;
      const createdGroups: string[] = [];
      if (mode === 'replace') {
        draft.people = [];
        for (const e of draft.events) e.assigneeIds = [];
        for (const t of draft.tasks) {
          t.assigneeIds = [];
          t.doneBy = undefined;
        }
      }
      for (const { input, groupNames } of parsed) {
        const g = ensureGroupsByName(draft, groupNames);
        createdGroups.push(...g.created);
        const groupIds = [...new Set([...input.groupIds, ...g.ids])];
        const existing = draft.people.find((p) => p.name.toLowerCase() === input.name.toLowerCase());
        const ts = nowIso();
        if (existing) {
          Object.assign(existing, {
            ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
            groupIds: [...new Set([...existing.groupIds, ...groupIds])],
            updatedAt: ts,
          });
          cleanRefs(draft, existing);
          updated++;
        } else {
          const person: Person = { ...input, groupIds, id: newId('u_'), createdAt: ts, updatedAt: ts };
          cleanRefs(draft, person);
          draft.people.push(person);
          added++;
        }
      }
      return { added, updated, createdGroups };
    });
    ok(res, summary);
  });

  /* ---------------- groups ---------------- */

  router.post('/groups', requireEditor, async (req, res) => {
    const input = parse(groupInputSchema, req.body);
    const g = await db.mutate((draft) => {
      if (draft.groups.some((x) => x.name.toLowerCase() === input.name.toLowerCase())) {
        throw new HttpError(400, 'A group with that name already exists.');
      }
      const ts = nowIso();
      const created: Group = { ...input, id: newId('g_'), createdAt: ts, updatedAt: ts };
      draft.groups.push(created);
      return created;
    });
    ok(res, { id: g.id });
  });

  router.put('/groups/:id', requireEditor, async (req, res) => {
    const input = parse(groupInputSchema, req.body);
    const id = String(req.params.id);
    await db.mutate((draft) => {
      const existing = findOr404(draft.groups, id, 'Group');
      if (draft.groups.some((x) => x.id !== id && x.name.toLowerCase() === input.name.toLowerCase())) {
        throw new HttpError(400, 'A group with that name already exists.');
      }
      draft.groups[draft.groups.indexOf(existing)] = { ...input, id, createdAt: existing.createdAt, updatedAt: nowIso() };
    });
    ok(res, { id });
  });

  router.delete('/groups/:id', requireEditor, async (req, res) => {
    const id = String(req.params.id);
    await db.mutate((draft) => {
      findOr404(draft.groups, id, 'Group');
      draft.groups = draft.groups.filter((g) => g.id !== id);
      for (const e of draft.events) e.groupIds = e.groupIds.filter((x) => x !== id);
      for (const p of draft.people) p.groupIds = p.groupIds.filter((x) => x !== id);
    });
    ok(res);
  });

  /* ---------------- info pages ---------------- */

  router.post('/info-pages', requireEditor, async (req, res) => {
    const input = parse(infoPageInputSchema, req.body);
    const p = await db.mutate((draft) => {
      const ts = nowIso();
      const order = req.body?.order === undefined ? Math.max(0, ...draft.infoPages.map((x) => x.order)) + 1 : input.order;
      const created: InfoPage = { ...input, order, id: newId('p_'), createdAt: ts, updatedAt: ts };
      draft.infoPages.push(created);
      return created;
    });
    ok(res, { id: p.id });
  });

  router.put('/info-pages/:id', requireEditor, async (req, res) => {
    const input = parse(infoPageInputSchema, req.body);
    const id = String(req.params.id);
    await db.mutate((draft) => {
      const existing = findOr404(draft.infoPages, id, 'Page');
      draft.infoPages[draft.infoPages.indexOf(existing)] = { ...input, id, createdAt: existing.createdAt, updatedAt: nowIso() };
    });
    ok(res, { id });
  });

  router.delete('/info-pages/:id', requireEditor, async (req, res) => {
    const id = String(req.params.id);
    await db.mutate((draft) => {
      findOr404(draft.infoPages, id, 'Page');
      draft.infoPages = draft.infoPages.filter((p) => p.id !== id);
    });
    ok(res);
  });

  router.post('/info-pages/reorder', requireEditor, async (req, res) => {
    const body = parse(z.object({ ids: z.array(z.string()).max(500) }), req.body);
    await db.mutate((draft) => {
      body.ids.forEach((id, index) => {
        const p = draft.infoPages.find((x) => x.id === id);
        if (p) p.order = index + 1;
      });
    });
    ok(res);
  });

  /* ---------------- push subscriptions ---------------- */

  router.post('/push/subscribe', async (req, res) => {
    const body = parse(
      z.object({
        subscription: z.object({
          endpoint: z.string().url().max(2000).refine((u) => u.startsWith('https://'), 'Invalid endpoint'),
          keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
        }),
        personId: z.string().max(64).optional().nullable(),
      }),
      req.body,
    );
    const role = roleOf(res);
    await db.mutate(
      (draft) => {
        const personId = body.personId && draft.people.some((p) => p.id === body.personId) ? body.personId : undefined;
        const existing = draft.push.subscriptions.find((s) => s.endpoint === body.subscription.endpoint);
        if (existing) {
          existing.keys = body.subscription.keys;
          existing.role = role;
          existing.personId = personId;
        } else {
          draft.push.subscriptions.push({ ...body.subscription, role, personId, createdAt: nowIso() });
          if (draft.push.subscriptions.length > 3000) draft.push.subscriptions.shift();
        }
      },
      { bumpVersion: false },
    );
    ok(res);
  });

  router.post('/push/unsubscribe', async (req, res) => {
    const body = parse(z.object({ endpoint: z.string().max(2000) }), req.body);
    await db.mutate(
      (draft) => {
        draft.push.subscriptions = draft.push.subscriptions.filter((s) => s.endpoint !== body.endpoint);
      },
      { bumpVersion: false },
    );
    ok(res);
  });

  /* ---------------- admin ---------------- */

  router.get('/admin/overview', requireAdmin, async (_req, res) => {
    const s = db.state;
    res.json({
      settings: s.settings,
      storage: db.store.kind,
      adminPasswordFromEnv: !!config.adminPassword,
      publicUrl: config.publicUrl,
      pushSubscriptions: {
        total: s.push.subscriptions.length,
        organizers: s.push.subscriptions.filter((x) => isOrganizerRole(x.role)).length,
      },
      counts: {
        events: s.events.length,
        tasks: s.tasks.length,
        announcements: s.announcements.length,
        people: s.people.length,
        groups: s.groups.length,
        infoPages: s.infoPages.length,
      },
      calendarTokens: { participant: calendarToken(s, 'participant'), organizer: calendarToken(s, 'organizer') },
      backups: await db.store.listBackups(),
    });
  });

  router.put('/admin/settings', requireAdmin, async (req, res) => {
    const input = parse(settingsInputSchema, req.body);
    for (const code of [input.participantCode, input.organizerCode]) {
      const clash = config.adminPassword ? safeEqual(code, config.adminPassword) : verifyPassword(code, db.state.secrets.adminPasswordHash);
      if (clash) throw new HttpError(400, 'Trip codes must be different from the admin password.');
    }
    await db.mutate((draft) => {
      draft.settings = input;
    });
    ok(res);
  });

  router.post('/admin/password', requireAdmin, async (req, res) => {
    if (config.adminPassword) {
      throw new HttpError(400, 'The admin password is set with the ADMIN_PASSWORD environment variable on the server. Change it there.');
    }
    const body = parse(z.object({ current: z.string().max(200), next: z.string().min(8, 'Use at least 8 characters').max(200) }), req.body);
    if (!verifyPassword(body.current, db.state.secrets.adminPasswordHash)) throw new HttpError(400, 'The current password is not correct.');
    const s = db.state.settings;
    if ([s.participantCode, s.organizerCode].some((c) => c.toLowerCase() === body.next.toLowerCase())) {
      throw new HttpError(400, 'The admin password must be different from the trip codes.');
    }
    const hash = hashPassword(body.next);
    await db.mutate((draft) => {
      draft.secrets.adminPasswordHash = hash;
      draft.secrets.generations.admin++;
    });
    ok(res, { token: issueToken(db.state, 'admin') });
  });

  router.post('/admin/sign-out', requireAdmin, async (req, res) => {
    const body = parse(z.object({ role: z.enum(['participant', 'organizer']) }), req.body);
    await db.mutate((draft) => {
      draft.secrets.generations[body.role]++;
      draft.push.subscriptions = draft.push.subscriptions.filter((s) => s.role !== body.role);
    });
    ok(res);
  });

  router.get('/admin/export', requireAdmin, (_req, res) => {
    const name = db.state.settings.name.replace(/[^\w-]+/g, '-') || 'trip';
    res.set('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(exportTrip(db.state));
  });

  router.post('/admin/import', requireAdmin, async (req, res) => {
    const keepCodes = req.body?.keepCodes !== false;
    const content = contentFromExport(req.body?.data, db.state, keepCodes);
    await db.replace({ ...structuredClone(db.state), ...content } as AppState, 'import');
    ok(res);
  });

  router.post('/admin/reset', requireAdmin, async (req, res) => {
    const scope = parse(z.object({ scope: z.enum(['schedule', 'everything']) }), req.body).scope;
    const next = structuredClone(db.state) as AppState;
    if (scope === 'schedule') {
      next.events = [];
      next.tasks = [];
      next.announcements = [];
    } else {
      const fresh = createInitialState({ publicKey: next.push.publicKey, privateKey: next.push.privateKey });
      next.events = [];
      next.tasks = [];
      next.announcements = [];
      next.people = [];
      next.groups = [];
      next.infoPages = starterInfoPages();
      next.settings = {
        ...fresh.settings,
        participantCode: next.settings.participantCode,
        organizerCode: next.settings.organizerCode,
      };
    }
    await db.replace(next, `reset-${scope}`);
    ok(res);
  });

  router.post('/admin/demo', requireAdmin, async (_req, res) => {
    const next = structuredClone(db.state) as AppState;
    Object.assign(next, buildDemoContent(next.settings));
    await db.replace(next, 'demo');
    ok(res);
  });

  router.post('/admin/backups/:id/restore', requireAdmin, async (req, res) => {
    const raw = await db.store.readBackup(String(req.params.id));
    if (!raw) throw new HttpError(404, 'Backup not found');
    const restored = normalizeState(raw, () => ({ publicKey: db.state.push.publicKey, privateKey: db.state.push.privateKey }));
    const next = structuredClone(db.state) as AppState;
    Object.assign(next, {
      settings: { ...restored.settings },
      events: restored.events,
      tasks: restored.tasks,
      announcements: restored.announcements,
      people: restored.people,
      groups: restored.groups,
      infoPages: restored.infoPages,
    });
    await db.replace(next, 'restore');
    ok(res);
  });

  router.post('/admin/backups', requireAdmin, async (_req, res) => {
    await db.backupNow('manual');
    ok(res);
  });

  router.post('/admin/push-test', requireAdmin, async (_req, res) => {
    const result = await sendPush(db, pushSubject, 'organizers', {
      title: '🔔 Test notification',
      body: `Notifications for ${db.state.settings.name} are working.`,
      url: '/me',
      tag: 'test',
    });
    ok(res, { result });
  });

  return router;
}

/** Final JSON error handler for the API. */
export function apiErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  const status = (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode;
  if (status === 400 || status === 413) {
    res.status(status).json({ error: status === 413 ? 'That is too much data at once.' : 'The request could not be read.' });
    return;
  }
  console.error('[api] unexpected error', err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}
