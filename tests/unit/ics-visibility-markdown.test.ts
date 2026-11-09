import { describe, expect, it } from 'vitest';
import { buildIcs, escapeIcsText, foldLine } from '../../src/shared/ics';
import type { Person, ScheduleEvent } from '../../src/shared/schemas';
import { eventInputSchema, settingsInputSchema } from '../../src/shared/schemas';
import { eventForRole, eventRelevantForPerson, personForRole } from '../../src/shared/visibility';
import { countChecklistItems, parseBlocks } from '../../src/client/lib/markdown';

const stamp = { createdAt: '2027-01-01T10:00:00.000Z', updatedAt: '2027-01-02T10:00:00.000Z' };

function ev(partial: Partial<ScheduleEvent>): ScheduleEvent {
  return {
    id: 'e1',
    title: 'Event',
    date: '2027-03-01',
    category: 'other',
    audience: 'everyone',
    groupIds: [],
    assigneeIds: [],
    links: [],
    status: 'scheduled',
    ...stamp,
    ...partial,
  };
}

describe('ics', () => {
  it('escapes text and folds long lines', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const folded = foldLine('DESCRIPTION:' + 'é'.repeat(80));
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('builds a calendar with timed, all-day and cancelled events', () => {
    const ics = buildIcs({
      calendarName: 'Trip',
      tripTimezone: 'Europe/Amsterdam',
      now: Date.UTC(2027, 0, 1),
      reminderMinutes: 15,
      events: [
        ev({ id: 'a', title: 'Lunch, food', startTime: '12:00', endTime: '13:00', location: 'Café' }),
        ev({ id: 'b', title: 'Card', endDate: '2027-03-03' }),
        ev({ id: 'c', title: 'Party', startTime: '21:00', status: 'cancelled' }),
      ],
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('UID:a@prototrip');
    expect(ics).toContain('DTSTART:20270301T110000Z');
    expect(ics).toContain('DTEND:20270301T120000Z');
    expect(ics).toContain('SUMMARY:Lunch\\, food');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270301');
    expect(ics).toContain('DTEND;VALUE=DATE:20270304');
    expect(ics).toContain('SUMMARY:CANCELLED: Party');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(1);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('only includes organizer notes when asked', () => {
    const e = ev({ startTime: '10:00', organizerNotes: 'Booking 123' });
    const base = { calendarName: 'T', tripTimezone: 'Europe/Amsterdam', events: [e] };
    expect(buildIcs(base)).not.toContain('Booking 123');
    expect(buildIcs({ ...base, includeOrganizerNotes: true })).toContain('Booking 123');
  });
});

describe('visibility', () => {
  const participant: Person = { id: 'p1', name: 'Pat', role: 'participant', groupIds: ['gA'], phone: '+31 6 1', dietary: 'Vegan', emergencyContact: 'Mum', notes: 'x', ...stamp };
  const organizer: Person = { id: 'o1', name: 'Olly', role: 'organizer', groupIds: [], phone: '+31 6 2', email: 'o@example.org', dietary: 'None', ...stamp };

  it('hides private fields of people from participants', () => {
    expect(personForRole(participant, 'participant')).toEqual({ id: 'p1', name: 'Pat', role: 'participant', roleTitle: undefined, groupIds: ['gA'] });
    expect(personForRole(organizer, 'participant')).toMatchObject({ phone: '+31 6 2', email: 'o@example.org' });
    expect(personForRole(organizer, 'participant')).not.toHaveProperty('dietary');
    expect(personForRole(participant, 'organizer')).toEqual(participant);
  });

  it('strips organizer notes for participants', () => {
    const e = ev({ organizerNotes: 'secret' });
    expect(eventForRole(e, 'participant')).not.toHaveProperty('organizerNotes');
    expect(eventForRole(e, 'admin').organizerNotes).toBe('secret');
  });

  it('decides which events are relevant for a person', () => {
    expect(eventRelevantForPerson(ev({}), participant)).toBe(true);
    expect(eventRelevantForPerson(ev({ groupIds: ['gA'] }), participant)).toBe(true);
    expect(eventRelevantForPerson(ev({ groupIds: ['gB'] }), participant)).toBe(false);
    expect(eventRelevantForPerson(ev({ audience: 'organizers' }), participant)).toBe(false);
    expect(eventRelevantForPerson(ev({ audience: 'organizers' }), organizer)).toBe(true);
    expect(eventRelevantForPerson(ev({ audience: 'organizers', assigneeIds: ['x'] }), organizer)).toBe(false);
    expect(eventRelevantForPerson(ev({ audience: 'organizers', assigneeIds: ['o1'] }), organizer)).toBe(true);
    expect(eventRelevantForPerson(ev({ groupIds: ['gB'] }), organizer)).toBe(true);
  });
});

describe('schemas', () => {
  it('validates events', () => {
    expect(eventInputSchema.safeParse({ title: 'x', date: '2027-02-30' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ title: 'x', date: '2027-03-01', endTime: '10:00' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ title: 'x', date: '2027-03-01', startTime: '10:00', endDate: '2027-03-02' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ title: 'x', date: '2027-03-01', links: [{ url: 'javascript:alert(1)' }] }).success).toBe(false);
    const ok = eventInputSchema.parse({ title: ' Lunch ', date: '2027-03-01', startTime: '12:00', location: '' });
    expect(ok).toMatchObject({ title: 'Lunch', category: 'other', audience: 'everyone', location: undefined });
  });
  it('requires different codes in settings', () => {
    const res = settingsInputSchema.safeParse({ name: 'T', timezone: 'Europe/Amsterdam', participantCode: 'SAMECODE', organizerCode: 'samecode' });
    expect(res.success).toBe(false);
  });
});

describe('markdown parser', () => {
  it('splits blocks and counts checklist items', () => {
    const src = '# Title\n\nSome **bold** text\nnext line\n\n- [ ] one\n- [x] two\n- plain\n\n1. first\n2. second\n\n> quote\n\n---';
    const blocks = parseBlocks(src);
    expect(blocks.map((b) => b.type)).toEqual(['h', 'p', 'ul', 'ol', 'quote', 'hr']);
    expect(countChecklistItems(src)).toBe(2);
  });
});
