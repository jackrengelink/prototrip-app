/**
 * Example trip used for demos, screenshots and "Load example data" in the admin
 * section. Dates are relative to today so the "Now" screen always has something to show.
 */
import type { Announcement, EventInput, Group, InfoPage, Person, ScheduleEvent, Task, TripSettings } from '../shared/schemas';
import { addDays, todayInTz } from '../shared/time';
import { newId, nowIso } from './ids';

type EventSeed = Partial<EventInput> & Pick<EventInput, 'title' | 'category'> & { day: number; start?: string; end?: string };

export function buildDemoContent(current: TripSettings, opts: { startOffsetDays?: number; now?: number } = {}) {
  const timezone = 'Europe/Copenhagen';
  const today = todayInTz(timezone, opts.now);
  const start = addDays(today, opts.startOffsetDays ?? -1);
  const ts = nowIso();
  const earlier = new Date((opts.now ?? Date.now()) - 3 * 86_400_000).toISOString();
  const stamp = { createdAt: earlier, updatedAt: earlier };

  const settings: TripSettings = {
    ...current,
    name: 'ProtoTrip Demo',
    tagline: 'Study trip to Copenhagen & Malmö',
    destination: 'Copenhagen, Denmark',
    startDate: start,
    endDate: addDays(start, 4),
    timezone,
    welcomeMessage:
      'Welcome to the trip app! Everything you need is here: the **schedule**, **news** from the organizers and **practical info**. Install the app on your home screen so it also works without internet.',
    emergencyNumber: '112',
  };

  const group = (name: string, color: string, description?: string): Group => ({ id: newId('g_'), name, color, description, ...stamp });
  const groupA = group('Group A', '#e11d48', 'Company visit track');
  const groupB = group('Group B', '#2563eb', 'University lab track');
  const groups = [groupA, groupB];

  const person = (name: string, role: Person['role'], extra: Partial<Person> = {}): Person => ({
    id: newId('u_'),
    name,
    role,
    groupIds: [],
    ...extra,
    ...stamp,
  });
  const noor = person('Noor de Vries', 'organizer', { roleTitle: 'Chair', phone: '+31 6 1234 5678', email: 'noor@example.org' });
  const daan = person('Daan Jansen', 'organizer', { roleTitle: 'Treasurer', phone: '+31 6 2345 6789', groupIds: [groupA.id] });
  const sophie = person('Sophie Bakker', 'organizer', { roleTitle: 'Logistics', phone: '+31 6 3456 7890', groupIds: [groupB.id] });
  const participants = [
    ['Lucas Visser', groupA, 'Vegetarian'],
    ['Emma Smit', groupA, undefined],
    ['Milan de Boer', groupA, 'Nut allergy'],
    ['Julia Mulder', groupA, undefined],
    ['Sem Meijer', groupA, undefined],
    ['Tess de Groot', groupB, 'Vegan'],
    ['Finn Bos', groupB, undefined],
    ['Sara Vos', groupB, undefined],
    ['Levi Peters', groupB, 'Lactose intolerant'],
    ['Lotte Hendriks', groupB, undefined],
  ].map(([name, g, dietary]) =>
    person(name as string, 'participant', {
      groupIds: [(g as Group).id],
      dietary: dietary as string | undefined,
      phone: '+31 6 0000 0000',
      emergencyContact: 'Parent: +31 6 9999 9999',
    }),
  );
  const people = [noor, daan, sophie, ...participants];

  const seeds: EventSeed[] = [
    // Day 1 – travel
    { day: 0, start: '06:45', end: '07:15', title: 'Check attendance & hand out tickets', category: 'briefing', audience: 'organizers', assigneeIds: [noor.id, sophie.id], location: 'Enschede station', organizerNotes: 'Attendance list is in the shared drive. Call anyone missing at 07:20.' },
    { day: 0, start: '07:30', title: 'Meet at the station', category: 'briefing', location: 'Enschede station', meetingPoint: 'Main hall, under the big clock', bring: 'Passport/ID, student card, packed lunch', description: 'Please be **on time** – the train leaves at 08:05 and will not wait for us.' },
    { day: 0, start: '08:05', end: '17:40', title: 'Train to Copenhagen', category: 'travel', location: 'Enschede → København H', description: 'Change in Hamburg (about 45 minutes). Seats are reserved in coach 7.', bring: 'Snacks and something to do', assigneeIds: [sophie.id] },
    { day: 0, start: '18:15', end: '19:00', title: 'Check-in at the hostel', category: 'accommodation', location: 'Copenhagen Downtown Hostel', address: 'Vandkunsten 5, 1467 København', description: 'Room keys are handed out per room. Room lists are on the info page.' },
    { day: 0, start: '17:50', end: '18:15', title: 'Collect room keys at reception', category: 'accommodation', audience: 'organizers', assigneeIds: [daan.id], organizerNotes: 'Booking ref CPH-48213. Deposit already paid.' },
    { day: 0, start: '19:30', end: '21:30', title: 'Welcome dinner', category: 'meal', location: 'Restaurant Kødbyens', address: 'Flæsketorvet 27, 1711 København', cost: 'Included' },
    { day: 0, start: '22:30', end: '23:00', title: 'Organizer evaluation', category: 'briefing', audience: 'organizers', location: 'Hostel lounge' },

    // Day 2 – visits
    { day: 1, start: '08:00', end: '09:00', title: 'Breakfast', category: 'meal', location: 'Hostel restaurant', cost: 'Included' },
    { day: 1, start: '09:15', title: 'Meet in the lobby', category: 'briefing', location: 'Hostel lobby' },
    { day: 1, start: '10:00', end: '12:30', title: 'Company visit: design studio', category: 'company', groupIds: [groupA.id], location: 'Nordic Design Studio', address: 'Refshalevej 163A, 1432 København', description: 'Tour of the studio and a talk about interaction design for public spaces. Prepare one question for the Q&A!', assigneeIds: [daan.id], links: [{ label: 'About the studio', url: 'https://example.org/design-studio' }] },
    { day: 1, start: '10:00', end: '12:30', title: 'University lab visit', category: 'company', groupIds: [groupB.id], location: 'IT University of Copenhagen', address: 'Rued Langgaards Vej 7, 2300 København', description: 'Demo of the robotics and play lab, followed by a student panel.', assigneeIds: [sophie.id] },
    { day: 1, start: '09:30', end: '09:45', title: 'Pay museum tickets for tomorrow', category: 'other', audience: 'organizers', assigneeIds: [daan.id], organizerNotes: 'Group rate: 24 tickets. Pay with the trip credit card.' },
    { day: 1, start: '13:00', end: '14:00', title: 'Lunch', category: 'meal', location: 'Reffen Street Food', address: 'Refshalevej 167, 1432 København', cost: 'Own expense (~€15)' },
    { day: 1, start: '14:30', end: '17:00', title: 'Canal & city walking tour', category: 'culture', location: 'Nyhavn', meetingPoint: 'Nyhavn 1, at the anchor', bring: 'Rain jacket', description: 'A local guide shows us the old harbour, the royal palace and Christiansborg.' },
    { day: 1, start: '17:00', end: '19:30', title: 'Free time', category: 'free', description: 'Explore the city on your own. Stay in groups of at least three.' },
    { day: 1, start: '19:30', end: '21:00', title: 'Dinner', category: 'meal', location: 'Hostel restaurant', cost: 'Included' },
    { day: 1, start: '21:30', end: '01:00', title: 'Pub quiz night', category: 'party', location: 'The Old Irish Pub', address: 'Vesterbrogade 2B, 1620 København', description: 'Teams are mixed – organizers make the teams on the spot.' },

    // Day 3 – culture & bikes
    { day: 2, start: '08:00', end: '09:00', title: 'Breakfast', category: 'meal', location: 'Hostel restaurant', cost: 'Included' },
    { day: 2, start: '09:30', end: '12:00', title: 'Design Museum Denmark', category: 'culture', location: 'Designmuseum Danmark', address: 'Bredgade 68, 1260 København', cost: 'Included' },
    { day: 2, start: '12:00', end: '13:00', title: 'Lunch', category: 'meal', description: 'Packed lunch from the hostel.' },
    { day: 2, start: '13:30', end: '16:30', title: 'Bike tour', category: 'activity', location: 'Donkey Republic hub', meetingPoint: 'Kongens Nytorv', bring: 'Comfortable clothes', description: 'We cycle along the harbour to the Opera, Christiania and Superkilen park.', assigneeIds: [noor.id] },
    { day: 2, start: '13:00', end: '13:20', title: 'Pick up rental bikes & check helmets', category: 'activity', audience: 'organizers', assigneeIds: [noor.id, sophie.id] },
    { day: 2, start: '19:00', end: '21:00', title: 'Group dinner', category: 'meal', location: 'Mother Pizza', address: 'Høkerboderne 9, 1712 København', cost: 'Included' },

    // Day 4 – Malmö
    { day: 3, start: '08:00', end: '08:45', title: 'Breakfast', category: 'meal', location: 'Hostel restaurant' },
    { day: 3, start: '09:12', end: '09:52', title: 'Train to Malmö', category: 'travel', location: 'København H → Malmö C', bring: 'Passport/ID – there can be border checks!', status: 'scheduled', changeNote: 'Now leaving at 09:12 instead of 09:00' },
    { day: 3, start: '10:30', end: '12:00', title: 'Visit Malmö University', category: 'company', location: 'Malmö University, Niagara building', address: 'Nordenskiöldsgatan 1, 211 19 Malmö' },
    { day: 3, start: '12:00', end: '17:00', title: 'Explore Malmö', category: 'free', description: 'Free afternoon. Recommended: Turning Torso, Ribersborg beach, Lilla Torg.' },
    { day: 3, start: '17:30', end: '18:10', title: 'Train back to Copenhagen', category: 'travel', location: 'Malmö C → København H', meetingPoint: 'Malmö C, platform 2b' },
    { day: 3, start: '20:00', title: 'Farewell party', category: 'party', location: 'Hostel bar', status: 'tentative' },

    // Day 5 – home
    { day: 4, start: '08:00', end: '09:00', title: 'Breakfast & pack your bags', category: 'meal' },
    { day: 4, start: '09:30', end: '10:00', title: 'Check-out', category: 'accommodation', description: 'Strip your bed and hand in your keys at reception. Lost keys cost €25.' },
    { day: 4, start: '09:00', end: '09:30', title: 'Room inspection', category: 'accommodation', audience: 'organizers', assigneeIds: [daan.id, sophie.id] },
    { day: 4, start: '10:45', end: '20:10', title: 'Train home', category: 'travel', location: 'København H → Enschede' },
    // All-day item
    { day: 0, title: 'Copenhagen Card valid', category: 'other', endDate: addDays(start, 2), description: 'Free public transport and entry to many museums with your card.' },
  ];

  const events: ScheduleEvent[] = seeds.map((s) => {
    const { day, start: st, end, ...rest } = s;
    return {
      audience: 'everyone',
      groupIds: [],
      assigneeIds: [],
      links: [],
      status: 'scheduled',
      ...rest,
      date: addDays(start, day),
      startTime: st,
      endTime: end,
      endDate: rest.endDate,
      id: newId('e_'),
      ...stamp,
      // Events with a change note were "edited" just now, so they show as updated.
      updatedAt: rest.changeNote ? ts : stamp.updatedAt,
    } as ScheduleEvent;
  });

  const tasks: Task[] = [
    { title: 'Book restaurant for day 3 (17 people)', assigneeIds: [noor.id], priority: 'high', dueDate: addDays(start, 1), done: false },
    { title: 'Collect deposits from late sign-ups', assigneeIds: [daan.id], priority: 'normal', dueDate: addDays(start, -3), done: true, notes: 'Two people still paying in cash on the train.' },
    { title: 'Buy first-aid kit', assigneeIds: [sophie.id], priority: 'normal', dueDate: addDays(start, -2), done: true },
    { title: 'Print emergency cards with hostel address', assigneeIds: [sophie.id], priority: 'high', dueDate: start, done: false },
    { title: 'Make pub quiz teams', assigneeIds: [noor.id, daan.id], priority: 'low', dueDate: addDays(start, 1), dueTime: '21:00', done: false },
    { title: 'Send thank-you emails to the hosts', assigneeIds: [], priority: 'normal', dueDate: addDays(start, 7), done: false },
  ].map((t) => ({ ...t, id: newId('t_'), ...stamp, doneAt: t.done ? ts : undefined }) as Task);

  const announcements: Announcement[] = [
    { title: 'Welcome to ProtoTrip! 🎉', body: 'Great to have you all here. Check the schedule every morning – changes show up with an **Updated** label.', audience: 'everyone', level: 'info', pinned: true, author: 'Noor' },
    { title: 'Train to Malmö leaves 12 minutes later', body: 'New departure time is **09:12**. Meet at the hostel lobby at 08:45.', audience: 'everyone', level: 'important', pinned: false, author: 'Sophie' },
    { title: 'Orga meeting tonight at 22:30', body: 'In the hostel lounge. Agenda: budget update and pub quiz teams.', audience: 'organizers', level: 'info', pinned: false, author: 'Noor' },
  ].map((a) => ({ ...a, id: newId('a_'), ...stamp })) as Announcement[];

  const infoPages: InfoPage[] = [
    {
      title: 'Accommodation',
      icon: '🏨',
      order: 1,
      body: [
        '## Copenhagen Downtown Hostel',
        'Vandkunsten 5, 1467 København',
        '',
        '📞 +45 70 23 21 10',
        '',
        '- Reception is open 24/7',
        '- Breakfast 07:30 – 10:00 in the restaurant',
        '- Towels are included, lockers need your own padlock',
        '- Quiet hours from 23:00',
        '',
        '[Open in Google Maps](https://maps.google.com/?q=Vandkunsten+5+Copenhagen)',
      ].join('\n'),
      audience: 'everyone',
    },
    {
      title: 'Packing list',
      icon: '🎒',
      order: 2,
      body: ['- [ ] Passport or ID card', '- [ ] Student card', '- [ ] Phone charger + power bank', '- [ ] Rain jacket', '- [ ] Comfortable shoes', '- [ ] Padlock for the locker', '- [ ] Danish kroner or a card that works abroad'].join('\n'),
      audience: 'everyone',
    },
    {
      title: 'Emergency',
      icon: '🆘',
      order: 3,
      body: ['**Emergency number in Denmark and Sweden: 112**', '', 'Medical helpline (non-urgent): 1813', '', 'Call Noor (chair) at any time: +31 6 1234 5678'].join('\n'),
      audience: 'everyone',
    },
    {
      title: 'Organizer handbook',
      icon: '🧭',
      order: 4,
      body: ['## Bookings', '- Hostel: CPH-48213 (paid)', '- Museum: group booking, pay on day 2', '- Bike rental: 20 bikes reserved on Noor’s name', '', '## Budget', 'Petty cash is with Daan. Keep all receipts!'].join('\n'),
      audience: 'organizers',
    },
  ].map((p) => ({ ...p, id: newId('p_'), ...stamp })) as InfoPage[];

  return { settings, events, tasks, announcements, people, groups, infoPages, checkins: {} };
}
