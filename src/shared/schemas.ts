import { z } from 'zod';
import { COLOR_RE, isSafeUrl, isValidDateString, isValidTimeZone, TIME_RE } from './validation';

export { COLOR_RE, DATE_RE, isSafeUrl, isValidDateString, isValidTimeZone, TIME_RE } from './validation';

/* ------------------------------------------------------------------ */
/* Primitive helpers                                                   */
/* ------------------------------------------------------------------ */

const dateStr = z
  .string()
  .trim()
  .refine(isValidDateString, { message: 'Expected a valid date (YYYY-MM-DD)' });

/** Optional text: trims, turns empty strings into undefined. */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : undefined));

const optDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isValidDateString(v), { message: 'Expected a valid date (YYYY-MM-DD)' });

const optTime = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || TIME_RE.test(v), { message: 'Expected a time (HH:mm)' });

const optTimeZone = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isValidTimeZone(v), { message: 'Unknown time zone' });

const idList = z.array(z.string().trim().min(1).max(64)).max(500).default([]);

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const CATEGORY_IDS = [
  'travel',
  'activity',
  'culture',
  'company',
  'meal',
  'free',
  'accommodation',
  'briefing',
  'party',
  'other',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const AUDIENCES = ['everyone', 'organizers'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const EVENT_STATUSES = ['scheduled', 'tentative', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const PRIORITIES = ['low', 'normal', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ANNOUNCEMENT_LEVELS = ['info', 'important', 'urgent'] as const;
export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number];

export const PERSON_ROLES = ['participant', 'organizer'] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const LANGUAGES = ['en', 'nl'] as const;
export type Language = (typeof LANGUAGES)[number];

export type Role = 'participant' | 'organizer' | 'admin';

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

type UndefinedKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T];
type Simplify<T> = { [K in keyof T]: T[K] } & {};
/** Turn `key: X | undefined` (what zod transforms produce) into `key?: X`. */
export type Optionalize<T> = Simplify<Omit<T, UndefinedKeys<T>> & { [K in UndefinedKeys<T>]?: Exclude<T[K], undefined> }>;

export const linkSchema = z.object({
  label: z.string().trim().max(100).default(''),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine(isSafeUrl, { message: 'Links must start with http:// or https://' }),
});
export type Link = z.output<typeof linkSchema>;

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    date: dateStr,
    startTime: optTime,
    endDate: optDate,
    endTime: optTime,
    timezone: optTimeZone,
    category: z.enum(CATEGORY_IDS).default('other'),
    audience: z.enum(AUDIENCES).default('everyone'),
    groupIds: idList,
    assigneeIds: idList,
    location: optText(200),
    address: optText(300),
    meetingPoint: optText(200),
    description: optText(5000),
    organizerNotes: optText(5000),
    bring: optText(1000),
    cost: optText(100),
    links: z.array(linkSchema).max(20).default([]),
    status: z.enum(EVENT_STATUSES).default('scheduled'),
    changeNote: optText(300),
  })
  .superRefine((ev, ctx) => {
    if (ev.endTime && !ev.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Set a start time before setting an end time' });
    }
    if (ev.endDate && ev.endDate < ev.date) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date cannot be before the start date' });
    }
    if (ev.startTime && ev.endDate && ev.endDate !== ev.date && !ev.endTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Add an end time for an event that ends on another day' });
    }
    if (ev.startTime && ev.endTime && ev.endDate === ev.date && ev.endTime < ev.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End time is before the start time' });
    }
  });
export type EventInput = Optionalize<z.output<typeof eventInputSchema>>;

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  notes: optText(3000),
  dueDate: optDate,
  dueTime: optTime,
  assigneeIds: idList,
  priority: z.enum(PRIORITIES).default('normal'),
  eventId: optText(64),
  done: z.boolean().default(false),
});
export type TaskInput = Optionalize<z.output<typeof taskInputSchema>>;

export const announcementInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: optText(5000),
  audience: z.enum(AUDIENCES).default('everyone'),
  level: z.enum(ANNOUNCEMENT_LEVELS).default('info'),
  pinned: z.boolean().default(false),
  author: optText(120),
});
export type AnnouncementInput = Optionalize<z.output<typeof announcementInputSchema>>;

export const personInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  role: z.enum(PERSON_ROLES).default('participant'),
  roleTitle: optText(80),
  groupIds: idList,
  phone: optText(40),
  email: optText(200),
  dietary: optText(300),
  emergencyContact: optText(200),
  notes: optText(2000),
});
export type PersonInput = Optionalize<z.output<typeof personInputSchema>>;

export const groupInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  color: z.string().trim().regex(COLOR_RE, 'Expected a colour like #22aa88').default('#0e7c86'),
  description: optText(300),
});
export type GroupInput = Optionalize<z.output<typeof groupInputSchema>>;

export const infoPageInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  icon: optText(16),
  body: z.string().max(30000).default(''),
  audience: z.enum(AUDIENCES).default('everyone'),
  order: z.number().int().min(0).max(10000).default(0),
});
export type InfoPageInput = Optionalize<z.output<typeof infoPageInputSchema>>;

export const settingsInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Trip name is required').max(80),
    tagline: optText(160),
    destination: optText(120),
    startDate: optDate,
    endDate: optDate,
    timezone: z.string().trim().refine(isValidTimeZone, { message: 'Unknown time zone' }),
    participantCode: z
      .string()
      .trim()
      .min(4, 'Codes need at least 4 characters')
      .max(64)
      .regex(/^\S+$/, 'Codes cannot contain spaces'),
    organizerCode: z
      .string()
      .trim()
      .min(6, 'The organizer code needs at least 6 characters')
      .max(64)
      .regex(/^\S+$/, 'Codes cannot contain spaces'),
    organizersCanEdit: z.boolean().default(true),
    welcomeMessage: optText(5000),
    emergencyNumber: optText(30),
    defaultLanguage: z.enum(LANGUAGES).default('en'),
    accentColor: z.string().trim().regex(COLOR_RE).default('#0e7c86'),
  })
  .superRefine((s, ctx) => {
    if (s.startDate && s.endDate && s.endDate < s.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date cannot be before the start date' });
    }
    if (s.participantCode.toLowerCase() === s.organizerCode.toLowerCase()) {
      ctx.addIssue({
        code: 'custom',
        path: ['organizerCode'],
        message: 'The organizer code must be different from the participant code',
      });
    }
  });
export type SettingsInput = Optionalize<z.output<typeof settingsInputSchema>>;

/* ------------------------------------------------------------------ */
/* Stored entities                                                     */
/* ------------------------------------------------------------------ */

interface Stamped {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleEvent = EventInput & Stamped;
export type Task = TaskInput & Stamped & { doneAt?: string; doneBy?: string };
export type Announcement = AnnouncementInput & Stamped;
export type Person = PersonInput & Stamped;
export type Group = GroupInput & Stamped;
export type InfoPage = InfoPageInput & Stamped;
export type TripSettings = SettingsInput;

/** Person as seen by a participant: contact details of other participants are removed. */
export type PublicPerson = Pick<Person, 'id' | 'name' | 'role' | 'roleTitle' | 'groupIds'> &
  Partial<Pick<Person, 'phone' | 'email' | 'dietary' | 'emergencyContact' | 'notes' | 'createdAt' | 'updatedAt'>>;

export type PublicTrip = Omit<TripSettings, 'participantCode' | 'organizerCode'> & {
  participantCode?: string;
  organizerCode?: string;
};

/** Head count for one event: person id -> when they were marked present (and by whom). */
export type EventCheckins = Record<string, { at: string; by?: string }>;

/** Everything a signed-in device receives. Filtered on the server by role. */
export interface Snapshot {
  version: number;
  serverTime: string;
  role: Role;
  canEdit: boolean;
  trip: PublicTrip;
  events: ScheduleEvent[];
  tasks: Task[];
  announcements: Announcement[];
  people: PublicPerson[];
  groups: Group[];
  infoPages: InfoPage[];
  /** Head counts per event id (organizers only). */
  checkins: Record<string, EventCheckins>;
  calendarToken: string;
  pushPublicKey?: string;
  adminPasswordFromEnv?: boolean;
}

/** Portable export format (no secrets). */
export interface TripExport {
  format: 'prototrip-export';
  formatVersion: 1;
  exportedAt: string;
  settings: TripSettings;
  events: ScheduleEvent[];
  tasks: Task[];
  announcements: Announcement[];
  people: Person[];
  groups: Group[];
  infoPages: InfoPage[];
}

/** Format zod issues into a short human-readable message. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('; ');
}
