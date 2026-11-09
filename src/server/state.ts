import crypto from 'node:crypto';
import type {
  Announcement,
  Group,
  InfoPage,
  Person,
  Role,
  ScheduleEvent,
  Task,
  TripSettings,
} from '../shared/schemas';
import { newId, nowIso, readableCode } from './ids';

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  role: Role;
  personId?: string;
  createdAt: string;
}

export interface AppState {
  schemaVersion: 1;
  /** Incremented on every change; used for caching and change detection. */
  version: number;
  updatedAt: string;
  settings: TripSettings;
  events: ScheduleEvent[];
  tasks: Task[];
  announcements: Announcement[];
  people: Person[];
  groups: Group[];
  infoPages: InfoPage[];
  secrets: {
    sessionSecret: string;
    adminPasswordHash: string | null;
    /** Bumping a generation signs out every device with that role. */
    generations: Record<Role, number>;
  };
  push: {
    publicKey: string;
    privateKey: string;
    subscriptions: PushSubscriptionRecord[];
  };
}

export function defaultSettings(): TripSettings {
  return {
    name: 'ProtoTrip',
    tagline: undefined,
    destination: undefined,
    startDate: undefined,
    endDate: undefined,
    timezone: 'Europe/Amsterdam',
    participantCode: `TRIP-${readableCode(5)}`,
    organizerCode: `ORGA-${readableCode(4)}-${readableCode(4)}`,
    organizersCanEdit: true,
    welcomeMessage: undefined,
    emergencyNumber: '112',
    defaultLanguage: 'en',
    accentColor: '#0e7c86',
  };
}

function page(title: string, icon: string, body: string, order: number, audience: 'everyone' | 'organizers' = 'everyone'): InfoPage {
  const ts = nowIso();
  return { id: newId('p_'), title, icon, body, order, audience, createdAt: ts, updatedAt: ts };
}

/** Starter pages so the info section is never empty; organizers edit them to fit the trip. */
export function starterInfoPages(): InfoPage[] {
  return [
    page(
      'Practical info',
      'ℹ️',
      [
        '## Before we leave',
        '- Make sure your **passport or ID card** is valid for the whole trip.',
        '- Install this app on your home screen (see *Me → Install app*) so it works offline.',
        '- Turn on notifications so you hear about schedule changes right away.',
        '',
        '## During the trip',
        '- Always be at the meeting point **5 minutes early**.',
        '- Keep your phone charged and carry the address of the accommodation.',
        '- If you get lost, call one of the organizers (see *People*).',
        '',
        '## Money',
        'Most meals are included unless the schedule says otherwise. Bring a debit or credit card for your own expenses.',
      ].join('\n'),
      1,
    ),
    page(
      'Packing list',
      '🎒',
      [
        'Tick things off as you pack – your checklist is saved on your own phone.',
        '',
        '## Documents',
        '- [ ] Passport or ID card',
        '- [ ] Student card',
        '- [ ] Health insurance card (EHIC)',
        '- [ ] Travel tickets (or in your app)',
        '',
        '## Electronics',
        '- [ ] Phone + charger',
        '- [ ] Power bank',
        '- [ ] Travel adapter (if needed)',
        '',
        '## Clothes & personal',
        '- [ ] Clothes for every day + something nice for the evening',
        '- [ ] Comfortable walking shoes',
        '- [ ] Rain jacket',
        '- [ ] Toiletries & medication',
        '- [ ] Towel (check the accommodation info)',
        '',
        '## Handy',
        '- [ ] Reusable water bottle',
        '- [ ] Small backpack for day trips',
        '- [ ] Some cash',
      ].join('\n'),
      2,
    ),
    page(
      'Emergency',
      '🆘',
      [
        '## In an emergency',
        'Call the local emergency number first (in Europe: **112**), then call an organizer.',
        '',
        '## Organizers',
        'You can find every organizer with their phone number on the *People* page.',
        '',
        '## Accommodation',
        'Address and phone number of the accommodation will be added here.',
        '',
        '## Insurance',
        'Keep your travel/health insurance details with you at all times.',
      ].join('\n'),
      3,
    ),
    page(
      'Organizer handbook',
      '🧭',
      [
        'Only organizers can see this page.',
        '',
        '## Daily routine',
        '- [ ] Morning check: everyone present at the first meeting point',
        '- [ ] Confirm the day’s reservations',
        '- [ ] Evening evaluation with the organizers',
        '',
        '## Important numbers',
        '- Booking references, supplier contacts and insurance policy numbers can go here.',
      ].join('\n'),
      4,
      'organizers',
    ),
  ];
}

export function createInitialState(vapid: { publicKey: string; privateKey: string }): AppState {
  return {
    schemaVersion: 1,
    version: 1,
    updatedAt: nowIso(),
    settings: defaultSettings(),
    events: [],
    tasks: [],
    announcements: [],
    people: [],
    groups: [],
    infoPages: starterInfoPages(),
    secrets: {
      sessionSecret: crypto.randomBytes(32).toString('base64url'),
      adminPasswordHash: null,
      generations: { participant: 1, organizer: 1, admin: 1 },
    },
    push: { publicKey: vapid.publicKey, privateKey: vapid.privateKey, subscriptions: [] },
  };
}

/** Fill in anything missing from older or hand-edited state files. */
export function normalizeState(raw: unknown, vapid: () => { publicKey: string; privateKey: string }): AppState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppState>;
  const defaults = defaultSettings();
  const keys = s.push?.publicKey && s.push?.privateKey ? { publicKey: s.push.publicKey, privateKey: s.push.privateKey } : vapid();
  const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  return {
    schemaVersion: 1,
    version: typeof s.version === 'number' ? s.version : 1,
    updatedAt: s.updatedAt || nowIso(),
    settings: { ...defaults, ...(s.settings || {}) },
    events: arr(s.events).map((e) => ({ ...e, groupIds: arr(e.groupIds), assigneeIds: arr(e.assigneeIds), links: arr(e.links) })),
    tasks: arr(s.tasks).map((t) => ({ ...t, assigneeIds: arr(t.assigneeIds) })),
    announcements: arr(s.announcements),
    people: arr(s.people).map((p) => ({ ...p, groupIds: arr(p.groupIds) })),
    groups: arr(s.groups),
    infoPages: Array.isArray(s.infoPages) ? s.infoPages : starterInfoPages(),
    secrets: {
      sessionSecret: s.secrets?.sessionSecret || crypto.randomBytes(32).toString('base64url'),
      adminPasswordHash: s.secrets?.adminPasswordHash ?? null,
      generations: {
        participant: s.secrets?.generations?.participant ?? 1,
        organizer: s.secrets?.generations?.organizer ?? 1,
        admin: s.secrets?.generations?.admin ?? 1,
      },
    },
    push: { ...keys, subscriptions: arr(s.push?.subscriptions) },
  };
}
