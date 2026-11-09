/**
 * Spreadsheet import helpers: CSV / TSV parsing (works with Excel, Google Sheets and
 * Numbers exports, including the semicolon-separated files Dutch Excel produces) and
 * mapping rows to schedule events and people. Header names are matched loosely in
 * English and Dutch.
 */
import { guessCategory, parseCategory } from './categories';
import type { CategoryId, EventStatus, PersonRole } from './schemas';
import { isValidDateString } from './validation';

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ',';
}

/** RFC-4180-ish CSV parser. Returns rows of trimmed cells, skipping fully empty rows. */
export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      inQuotes = true;
      cell = '';
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

function toCsvCell(value: string): string {
  if (/[",;\n\r\t]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => toCsvCell(c ?? '')).join(',')).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ */
/* Value parsing                                                       */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januari: 1,
  feb: 2, february: 2, februari: 2,
  mar: 3, march: 3, mrt: 3, maart: 3,
  apr: 4, april: 4,
  may: 5, mei: 5,
  jun: 6, june: 6, juni: 6,
  jul: 7, july: 7, juli: 7,
  aug: 8, august: 8, augustus: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, okt: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Parse common date notations. Numeric dates are read day-first (European style) unless
 * the first part is a 4-digit year. `fallbackYear` is used for dates like "3 March".
 */
export function parseDateValue(raw: string, fallbackYear?: number): string | undefined {
  const v = raw
    .trim()
    .toLowerCase()
    .replace(
      /^(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun|maandag|ma|dinsdag|di|woensdag|wo|donderdag|do|vrijdag|vr|zaterdag|za|zondag|zo)\.?,?\s+/,
      '',
    );
  if (!v) return undefined;
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const s = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
    return isValidDateString(s) ? s : undefined;
  }
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (m) {
    let year = m[3] ? Number(m[3]) : fallbackYear;
    if (!year) return undefined;
    if (year < 100) year += 2000;
    const s = `${year}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    return isValidDateString(s) ? s : undefined;
  }
  m = v.match(/^(\d{1,2})(?:st|nd|rd|th|e)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/);
  if (m && MONTHS[m[2]]) {
    const year = m[3] ? Number(m[3]) : fallbackYear;
    if (!year) return undefined;
    const s = `${year}-${pad(MONTHS[m[2]])}-${pad(Number(m[1]))}`;
    return isValidDateString(s) ? s : undefined;
  }
  m = v.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/);
  if (m && MONTHS[m[1]]) {
    const year = m[3] ? Number(m[3]) : fallbackYear;
    if (!year) return undefined;
    const s = `${year}-${pad(MONTHS[m[1]])}-${pad(Number(m[2]))}`;
    return isValidDateString(s) ? s : undefined;
  }
  return undefined;
}

/** Parse "9:00", "09.30", "0930", "9u", "9:30 pm", "21h15". */
export function parseTimeValue(raw: string): string | undefined {
  const v = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!v) return undefined;
  const m = v.match(/^(\d{1,2})(?:[:.hu](\d{2})?)?(?:u|h)?(am|pm|a\.m\.|p\.m\.)?$/) || v.match(/^(\d{2})(\d{2})$/);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3];
  if (ampm) {
    if (h < 1 || h > 12) return undefined;
    const pm = ampm.startsWith('p');
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  if (h === 24 && min === 0) h = 0;
  if (h > 23 || min > 59) return undefined;
  return `${pad(h)}:${pad(min)}`;
}

/** Split "09:00 - 10:30" / "9.00–10.30" into two times. */
export function parseTimeRange(raw: string): { start?: string; end?: string } | undefined {
  const parts = raw.split(/\s*(?:-|–|—|tot|to|until)\s*/i).filter(Boolean);
  if (parts.length !== 2) return undefined;
  const start = parseTimeValue(parts[0]);
  const end = parseTimeValue(parts[1]);
  if (!start || !end) return undefined;
  return { start, end };
}

export function splitList(raw: string | undefined): string[] {
  return (raw || '')
    .split(/[,;|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAudience(raw: string | undefined): 'everyone' | 'organizers' | undefined {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return undefined;
  if (/^(orga|organi[sz]er|organisator|organisatie|committee|commissie|staff|crew|leiding|begeleid)/.test(v)) {
    return 'organizers';
  }
  return 'everyone';
}

function parseStatus(raw: string | undefined): EventStatus | undefined {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return undefined;
  if (/(cancel|geannuleerd|afgelast|vervalt)/.test(v)) return 'cancelled';
  if (/(tentative|tbc|tbd|onder voorbehoud|voorlopig|maybe|misschien|\?)/.test(v)) return 'tentative';
  return 'scheduled';
}

/* ------------------------------------------------------------------ */
/* Header mapping                                                      */
/* ------------------------------------------------------------------ */

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ]+/g, ' ')
    .trim();
}

type EventField =
  | 'date' | 'start' | 'end' | 'endDate' | 'title' | 'location' | 'address' | 'category' | 'audience'
  | 'groups' | 'assignees' | 'description' | 'organizerNotes' | 'bring' | 'meetingPoint' | 'cost'
  | 'link' | 'status' | 'timezone' | 'time';

const EVENT_HEADERS: Record<EventField, string[]> = {
  date: ['date', 'datum', 'day', 'dag', 'start date', 'startdatum'],
  time: ['time', 'tijd', 'times', 'tijden', 'when', 'wanneer'],
  start: ['start', 'start time', 'starttijd', 'begin', 'begintijd', 'from', 'van', 'begins'],
  end: ['end', 'end time', 'eind', 'eindtijd', 'einde', 'to', 'tot', 'until', 'ends'],
  endDate: ['end date', 'einddatum', 'until date', 'tot datum'],
  title: ['title', 'titel', 'name', 'naam', 'activity', 'activiteit', 'what', 'wat', 'event', 'programma', 'program', 'onderdeel', 'item'],
  location: ['location', 'locatie', 'where', 'waar', 'place', 'plaats', 'venue'],
  address: ['address', 'adres'],
  category: ['category', 'categorie', 'type', 'soort', 'kind'],
  audience: ['audience', 'for', 'voor', 'doelgroep', 'visibility', 'zichtbaarheid', 'zichtbaar voor', 'visible to', 'who sees'],
  groups: ['group', 'groups', 'groep', 'groepen', 'team', 'teams'],
  assignees: ['assignees', 'assignee', 'responsible', 'verantwoordelijke', 'verantwoordelijk', 'in charge', 'lead', 'organizer', 'organiser', 'organisator', 'contact person', 'contactpersoon', 'who', 'wie'],
  description: ['description', 'beschrijving', 'details', 'omschrijving', 'info', 'information', 'informatie', 'notes', 'notities', 'opmerkingen', 'remarks'],
  organizerNotes: ['organizer notes', 'organiser notes', 'orga notes', 'internal notes', 'interne notities', 'interne opmerkingen', 'notes organizers', 'notities organisatie', 'private notes'],
  bring: ['bring', 'meenemen', 'what to bring', 'wat meenemen', 'mee te nemen'],
  meetingPoint: ['meeting point', 'meetingpoint', 'verzamelpunt', 'verzamelplek', 'verzamelen', 'meet at', 'meet'],
  cost: ['cost', 'costs', 'kosten', 'price', 'prijs'],
  link: ['link', 'url', 'website', 'site', 'tickets'],
  status: ['status'],
  timezone: ['timezone', 'time zone', 'tijdzone', 'tz'],
};

function buildHeaderMap<F extends string>(headers: string[], aliases: Record<F, string[]>): Partial<Record<F, number>> {
  const map: Partial<Record<F, number>> = {};
  const normalized = headers.map(normHeader);
  // Exact matches first, then "starts with" matches, so "end date" doesn't get mistaken for "end".
  for (const pass of ['exact', 'prefix'] as const) {
    (Object.keys(aliases) as F[]).forEach((field) => {
      if (map[field] !== undefined) return;
      const idx = normalized.findIndex((h, i) => {
        if (Object.values(map).includes(i)) return false;
        return aliases[field].some((a) => (pass === 'exact' ? h === a : h.startsWith(a + ' ')));
      });
      if (idx >= 0) map[field] = idx;
    });
  }
  return map;
}

export interface ImportedEvent {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  endDate?: string;
  timezone?: string;
  category: CategoryId;
  audience: 'everyone' | 'organizers';
  groupNames: string[];
  assigneeNames: string[];
  location?: string;
  address?: string;
  meetingPoint?: string;
  description?: string;
  organizerNotes?: string;
  bring?: string;
  cost?: string;
  links: { label: string; url: string }[];
  status: EventStatus;
}

export interface RowIssue {
  /** 1-based row number in the sheet (header = row 1). */
  row: number;
  message: string;
}

export interface EventImportResult {
  events: ImportedEvent[];
  errors: RowIssue[];
  warnings: RowIssue[];
  recognizedColumns: string[];
  ignoredColumns: string[];
}

export const EVENT_TEMPLATE_HEADERS = [
  'Date', 'Start', 'End', 'Title', 'Location', 'Address', 'Category', 'Audience', 'Groups',
  'In charge', 'Description', 'Organizer notes', 'Bring', 'Meeting point', 'Cost', 'Link',
];

export function eventTemplateCsv(): string {
  return toCsv([
    EVENT_TEMPLATE_HEADERS,
    ['2027-03-01', '07:30', '08:00', 'Meet at the station', 'Central Station', '', 'briefing', 'everyone', '', '', 'Be on time – the train leaves at 08:05!', '', 'Passport, ticket', 'Platform 5', '', ''],
    ['2027-03-01', '06:45', '07:15', 'Check attendance list', 'Central Station', '', 'briefing', 'organizers', '', '', 'Use the list in the shared drive', '', '', '', '', ''],
    ['2027-03-01', '12:30', '13:30', 'Lunch', 'Café Central', 'Main Street 1', 'meal', 'everyone', '', '', '', 'Reservation under "ProtoTrip"', '', '', '€12', ''],
    ['2027-03-02', '10:00', '12:00', 'Museum tour', 'City Museum', '', 'culture', 'everyone', 'Group A', '', '', '', '', '', '', 'https://example.org'],
  ]);
}

export function importEventsFromRows(rows: string[][], opts: { fallbackYear?: number } = {}): EventImportResult {
  const result: EventImportResult = { events: [], errors: [], warnings: [], recognizedColumns: [], ignoredColumns: [] };
  if (rows.length < 2) {
    result.errors.push({ row: 1, message: 'The sheet needs a header row and at least one row with an event.' });
    return result;
  }
  const headers = rows[0];
  const map = buildHeaderMap(headers, EVENT_HEADERS);
  result.recognizedColumns = headers.filter((_, i) => Object.values(map).includes(i));
  result.ignoredColumns = headers.filter((h, i) => h && !Object.values(map).includes(i));
  if (map.title === undefined) {
    result.errors.push({ row: 1, message: 'Could not find a "Title" column.' });
    return result;
  }
  if (map.date === undefined) {
    result.errors.push({ row: 1, message: 'Could not find a "Date" column.' });
    return result;
  }

  const cell = (r: string[], f: EventField): string => {
    const i = map[f];
    return i === undefined ? '' : (r[i] ?? '').trim();
  };

  let lastDate: string | undefined;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 1;
    const title = cell(r, 'title');
    const dateRaw = cell(r, 'date');
    if (!title) {
      // A row that only holds a date acts as a day heading in many spreadsheets.
      if (dateRaw) {
        const d = parseDateValue(dateRaw, opts.fallbackYear);
        if (d) lastDate = d;
      }
      continue;
    }
    let date: string | undefined;
    if (dateRaw) {
      date = parseDateValue(dateRaw, opts.fallbackYear);
      if (!date) {
        result.errors.push({ row: rowNo, message: `Could not read the date "${dateRaw}". Use e.g. 2027-03-01 or 01-03-2027.` });
        continue;
      }
      lastDate = date;
    } else if (lastDate) {
      date = lastDate;
    } else {
      result.errors.push({ row: rowNo, message: `"${title}" has no date.` });
      continue;
    }

    let startRaw = cell(r, 'start');
    let endRaw = cell(r, 'end');
    const timeRaw = cell(r, 'time');
    if (!startRaw && timeRaw) startRaw = timeRaw;
    let startTime: string | undefined;
    let endTime: string | undefined;
    if (startRaw) {
      const range = parseTimeRange(startRaw);
      if (range) {
        startTime = range.start;
        endTime = range.end;
      } else {
        startTime = parseTimeValue(startRaw);
        if (!startTime) {
          result.errors.push({ row: rowNo, message: `Could not read the start time "${startRaw}". Use e.g. 09:30.` });
          continue;
        }
      }
    }
    if (endRaw) {
      const parsed = parseTimeValue(endRaw);
      if (!parsed) {
        result.errors.push({ row: rowNo, message: `Could not read the end time "${endRaw}". Use e.g. 17:00.` });
        continue;
      }
      endTime = parsed;
    }
    if (endTime && !startTime) {
      result.warnings.push({ row: rowNo, message: 'End time without a start time was ignored.' });
      endTime = undefined;
      endRaw = '';
    }
    let endDate: string | undefined;
    const endDateRaw = cell(r, 'endDate');
    if (endDateRaw) {
      endDate = parseDateValue(endDateRaw, opts.fallbackYear);
      if (!endDate) result.warnings.push({ row: rowNo, message: `Ignored unreadable end date "${endDateRaw}".` });
      if (endDate && endDate < date) {
        result.warnings.push({ row: rowNo, message: 'End date before start date was ignored.' });
        endDate = undefined;
      }
      if (endDate && startTime && !endTime) {
        result.warnings.push({ row: rowNo, message: 'End date without end time was ignored.' });
        endDate = undefined;
      }
    }

    const categoryRaw = cell(r, 'category');
    const category = parseCategory(categoryRaw) ?? guessCategory(title) ?? 'other';
    const linkRaw = cell(r, 'link');
    const links: { label: string; url: string }[] = [];
    if (linkRaw) {
      const url = /^https?:\/\//i.test(linkRaw) ? linkRaw : /^www\./i.test(linkRaw) ? `https://${linkRaw}` : '';
      if (url) links.push({ label: '', url });
      else result.warnings.push({ row: rowNo, message: `Ignored link "${linkRaw}" (must start with http:// or https://).` });
    }

    result.events.push({
      title: title.slice(0, 200),
      date,
      startTime,
      endTime,
      endDate,
      timezone: cell(r, 'timezone') || undefined,
      category,
      audience: parseAudience(cell(r, 'audience')) ?? 'everyone',
      groupNames: splitList(cell(r, 'groups')),
      assigneeNames: splitList(cell(r, 'assignees')),
      location: cell(r, 'location') || undefined,
      address: cell(r, 'address') || undefined,
      meetingPoint: cell(r, 'meetingPoint') || undefined,
      description: cell(r, 'description') || undefined,
      organizerNotes: cell(r, 'organizerNotes') || undefined,
      bring: cell(r, 'bring') || undefined,
      cost: cell(r, 'cost') || undefined,
      links,
      status: parseStatus(cell(r, 'status')) ?? 'scheduled',
    });
  }
  if (!result.events.length && !result.errors.length) {
    result.errors.push({ row: 2, message: 'No events found in the sheet.' });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

type PersonField = 'name' | 'firstName' | 'lastName' | 'role' | 'roleTitle' | 'groups' | 'phone' | 'email' | 'dietary' | 'emergencyContact' | 'notes';

const PERSON_HEADERS: Record<PersonField, string[]> = {
  name: ['name', 'naam', 'full name', 'volledige naam', 'participant', 'deelnemer'],
  firstName: ['first name', 'firstname', 'voornaam', 'given name'],
  lastName: ['last name', 'lastname', 'achternaam', 'surname', 'family name'],
  role: ['role', 'rol', 'type', 'organizer', 'organiser'],
  roleTitle: ['title', 'functie', 'position', 'task', 'taak', 'job'],
  groups: ['group', 'groups', 'groep', 'groepen', 'room', 'kamer', 'team'],
  phone: ['phone', 'telefoon', 'telefoonnummer', 'tel', 'mobile', 'mobiel', 'gsm', 'phone number', 'whatsapp'],
  email: ['email', 'e mail', 'mail', 'emailadres', 'e mailadres'],
  dietary: ['dietary', 'diet', 'dieet', 'allergies', 'allergieën', 'allergie', 'food', 'dieetwensen', 'dietary requirements'],
  emergencyContact: ['emergency contact', 'emergency', 'noodcontact', 'ice', 'in case of emergency', 'contact in case of emergency', 'noodnummer'],
  notes: ['notes', 'notities', 'opmerkingen', 'remarks', 'medical', 'medisch', 'comments'],
};

export interface ImportedPerson {
  name: string;
  role: PersonRole;
  roleTitle?: string;
  groupNames: string[];
  phone?: string;
  email?: string;
  dietary?: string;
  emergencyContact?: string;
  notes?: string;
}

export interface PeopleImportResult {
  people: ImportedPerson[];
  errors: RowIssue[];
  warnings: RowIssue[];
  recognizedColumns: string[];
  ignoredColumns: string[];
}

export const PEOPLE_TEMPLATE_HEADERS = ['Name', 'Role', 'Title', 'Groups', 'Phone', 'Email', 'Dietary', 'Emergency contact', 'Notes'];

export function peopleTemplateCsv(): string {
  return toCsv([
    PEOPLE_TEMPLATE_HEADERS,
    ['Alex Example', 'organizer', 'Chair', '', '+31 6 12345678', 'alex@example.org', '', '', ''],
    ['Sam Sample', 'participant', '', 'Group A, Room 12', '+31 6 87654321', '', 'Vegetarian', 'Parent: +31 6 11111111', ''],
  ]);
}

export function importPeopleFromRows(rows: string[][]): PeopleImportResult {
  const result: PeopleImportResult = { people: [], errors: [], warnings: [], recognizedColumns: [], ignoredColumns: [] };
  if (rows.length < 2) {
    result.errors.push({ row: 1, message: 'The sheet needs a header row and at least one person.' });
    return result;
  }
  const headers = rows[0];
  const map = buildHeaderMap(headers, PERSON_HEADERS);
  result.recognizedColumns = headers.filter((_, i) => Object.values(map).includes(i));
  result.ignoredColumns = headers.filter((h, i) => h && !Object.values(map).includes(i));
  if (map.name === undefined && map.firstName === undefined) {
    result.errors.push({ row: 1, message: 'Could not find a "Name" column.' });
    return result;
  }
  const cell = (r: string[], f: PersonField): string => {
    const i = map[f];
    return i === undefined ? '' : (r[i] ?? '').trim();
  };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = cell(r, 'name') || [cell(r, 'firstName'), cell(r, 'lastName')].filter(Boolean).join(' ');
    if (!name) continue;
    const roleRaw = cell(r, 'role').toLowerCase();
    const role: PersonRole =
      /^(orga|organi[sz]er|organisator|committee|commissie|staff|crew|leiding|begeleid|yes|ja|x|true)/.test(roleRaw)
        ? 'organizer'
        : 'participant';
    result.people.push({
      name: name.slice(0, 120),
      role,
      roleTitle: cell(r, 'roleTitle') || undefined,
      groupNames: splitList(cell(r, 'groups')),
      phone: cell(r, 'phone') || undefined,
      email: cell(r, 'email') || undefined,
      dietary: cell(r, 'dietary') || undefined,
      emergencyContact: cell(r, 'emergencyContact') || undefined,
      notes: cell(r, 'notes') || undefined,
    });
  }
  if (!result.people.length) result.errors.push({ row: 2, message: 'No people found in the sheet.' });
  return result;
}
