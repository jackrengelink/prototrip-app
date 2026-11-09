import { describe, expect, it } from 'vitest';
import {
  detectDelimiter,
  eventTemplateCsv,
  importEventsFromRows,
  importPeopleFromRows,
  parseCsv,
  parseDateValue,
  parseTimeRange,
  parseTimeValue,
  peopleTemplateCsv,
  toCsv,
} from '../../src/shared/csv';
import { guessCategory } from '../../src/shared/categories';

describe('parseCsv', () => {
  it('parses quoted cells with commas, quotes and newlines', () => {
    const rows = parseCsv('a,b,c\r\n"x, y","He said ""hi""","line1\nline2"\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'He said "hi"', 'line1\nline2'],
    ]);
  });
  it('detects semicolons (Dutch Excel) and tabs (pasted from a sheet)', () => {
    expect(detectDelimiter('Datum;Titel;Begin')).toBe(';');
    expect(detectDelimiter('Date\tTitle\tStart')).toBe('\t');
    expect(parseCsv('﻿Datum;Titel\n01-03-2027;Lunch')).toEqual([
      ['Datum', 'Titel'],
      ['01-03-2027', 'Lunch'],
    ]);
  });
  it('skips empty rows and round-trips with toCsv', () => {
    const data = [
      ['a', 'b'],
      ['1', 'x,y'],
    ];
    expect(parseCsv(toCsv(data) + '\n\n')).toEqual(data);
  });
});

describe('value parsing', () => {
  it('reads many date formats', () => {
    expect(parseDateValue('2027-03-01')).toBe('2027-03-01');
    expect(parseDateValue('01-03-2027')).toBe('2027-03-01');
    expect(parseDateValue('1/3/2027')).toBe('2027-03-01');
    expect(parseDateValue('1.3.27')).toBe('2027-03-01');
    expect(parseDateValue('3 maart', 2027)).toBe('2027-03-03');
    expect(parseDateValue('ma 1 maart 2027')).toBe('2027-03-01');
    expect(parseDateValue('March 3', 2027)).toBe('2027-03-03');
    expect(parseDateValue('Monday, 1 March 2027')).toBe('2027-03-01');
    expect(parseDateValue('31-02-2027')).toBeUndefined();
    expect(parseDateValue('soon')).toBeUndefined();
  });
  it('reads many time formats', () => {
    expect(parseTimeValue('9:00')).toBe('09:00');
    expect(parseTimeValue('09.30')).toBe('09:30');
    expect(parseTimeValue('0930')).toBe('09:30');
    expect(parseTimeValue('9u')).toBe('09:00');
    expect(parseTimeValue('21h15')).toBe('21:15');
    expect(parseTimeValue('9:30 pm')).toBe('21:30');
    expect(parseTimeValue('12am')).toBe('00:00');
    expect(parseTimeValue('25:00')).toBeUndefined();
    expect(parseTimeRange('09:00 - 10:30')).toEqual({ start: '09:00', end: '10:30' });
    expect(parseTimeRange('9.00–17.00')).toEqual({ start: '09:00', end: '17:00' });
  });
  it('guesses categories from titles', () => {
    expect(guessCategory('Lunch at the hostel')).toBe('meal');
    expect(guessCategory('Trein naar Kopenhagen')).toBe('travel');
    expect(guessCategory('Museum tour')).toBe('culture');
    expect(guessCategory('Inchecken hostel')).toBe('accommodation');
    expect(guessCategory('Something')).toBeUndefined();
  });
});

describe('importEventsFromRows', () => {
  it('imports the template without problems', () => {
    const res = importEventsFromRows(parseCsv(eventTemplateCsv()));
    expect(res.errors).toEqual([]);
    expect(res.events).toHaveLength(4);
    expect(res.events[1].audience).toBe('organizers');
    expect(res.events[3].groupNames).toEqual(['Group A']);
  });

  it('understands Dutch headers, carries dates down and splits time ranges', () => {
    const csv = [
      'Datum;Tijd;Activiteit;Locatie;Voor;Groep;Verantwoordelijke',
      '1-3-2027;08:00-09:00;Ontbijt;Hostel;;;',
      ';09:30;Bedrijfsbezoek;Studio X;;Groep A;Noor',
      ';22:00;Evaluatie;Lounge;organisatie;;',
    ].join('\n');
    const res = importEventsFromRows(parseCsv(csv));
    expect(res.errors).toEqual([]);
    expect(res.events.map((e) => [e.date, e.startTime, e.endTime, e.title, e.category, e.audience])).toEqual([
      ['2027-03-01', '08:00', '09:00', 'Ontbijt', 'meal', 'everyone'],
      ['2027-03-01', '09:30', undefined, 'Bedrijfsbezoek', 'company', 'everyone'],
      ['2027-03-01', '22:00', undefined, 'Evaluatie', 'briefing', 'organizers'],
    ]);
    expect(res.events[1].groupNames).toEqual(['Groep A']);
    expect(res.events[1].assigneeNames).toEqual(['Noor']);
  });

  it('reports unreadable rows with their row number', () => {
    const res = importEventsFromRows(parseCsv('Date,Title,Start\nnot-a-date,Lunch,12:00\n2027-03-01,Dinner,7 o clock'));
    expect(res.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(res.events).toHaveLength(0);
  });

  it('needs title and date columns', () => {
    expect(importEventsFromRows(parseCsv('Foo,Bar\n1,2')).errors[0].message).toMatch(/Title/);
  });

  it('treats a date-only row as a day heading', () => {
    const res = importEventsFromRows(parseCsv('Date,Title,Start\n2027-03-02,,\n,Breakfast,08:00'));
    expect(res.events[0].date).toBe('2027-03-02');
  });

  it('accepts www links and rejects other link schemes', () => {
    const res = importEventsFromRows(parseCsv('Date,Title,Link\n2027-03-01,A,www.example.org\n2027-03-01,B,javascript:alert(1)'));
    expect(res.events[0].links).toEqual([{ label: '', url: 'https://www.example.org' }]);
    expect(res.events[1].links).toEqual([]);
    expect(res.warnings).toHaveLength(1);
  });
});

describe('importPeopleFromRows', () => {
  it('imports the template', () => {
    const res = importPeopleFromRows(parseCsv(peopleTemplateCsv()));
    expect(res.errors).toEqual([]);
    expect(res.people[0]).toMatchObject({ name: 'Alex Example', role: 'organizer', roleTitle: 'Chair' });
    expect(res.people[1]).toMatchObject({ role: 'participant', groupNames: ['Group A', 'Room 12'], dietary: 'Vegetarian' });
  });
  it('combines first and last name columns', () => {
    const res = importPeopleFromRows(parseCsv('Voornaam;Achternaam;Telefoon\nSam;de Vries;0612345678'));
    expect(res.people[0]).toMatchObject({ name: 'Sam de Vries', phone: '0612345678', role: 'participant' });
  });
});
