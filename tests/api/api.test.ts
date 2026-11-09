import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../../src/shared/schemas';
import { ADMIN_PASSWORD, setup } from './helpers';

/** Calendar apps unfold long lines before reading them; do the same in tests. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('authentication', () => {
  it('signs in with the right role for each code', async () => {
    const { agent, codes } = await setup();
    for (const [code, role] of [
      [codes().participant, 'participant'],
      [codes().participant.toLowerCase(), 'participant'],
      [codes().organizer, 'organizer'],
      [ADMIN_PASSWORD, 'admin'],
    ]) {
      const res = await agent.post('/api/auth/login').send({ code });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe(role);
    }
  });

  it('rejects wrong codes and rate limits brute force', async () => {
    const { agent } = await setup();
    for (let i = 0; i < 5; i++) expect((await agent.post('/api/auth/login').send({ code: `wrong-${i}` })).status).toBe(401);
    const res = await agent.post('/api/auth/login').send({ code: 'wrong-again' });
    expect(res.status).toBe(429);
  });

  it('requires a session for data', async () => {
    const { agent } = await setup();
    expect((await agent.get('/api/data')).status).toBe(401);
    expect((await agent.get('/api/data').set('Authorization', 'Bearer nonsense')).status).toBe(401);
  });

  it('exposes only harmless public info', async () => {
    const { agent } = await setup();
    const res = await agent.get('/api/public-info');
    expect(Object.keys(res.body).sort()).toEqual(['accentColor', 'defaultLanguage', 'name', 'tagline'].filter((k) => k in res.body).sort());
    expect(JSON.stringify(res.body)).not.toMatch(/TRIP-|ORGA-/);
  });
});

describe('what each role sees', () => {
  it('participants never see organizer items, notes, tasks, codes or private details', async () => {
    const { as } = await setup({ demo: true });
    const snap = (await as('participant').get('/api/data')).body as Snapshot;
    expect(snap.role).toBe('participant');
    expect(snap.canEdit).toBe(false);
    expect(snap.events.length).toBeGreaterThan(10);
    expect(snap.events.every((e) => e.audience === 'everyone')).toBe(true);
    expect(snap.events.some((e) => 'organizerNotes' in e)).toBe(false);
    expect(snap.tasks).toEqual([]);
    expect(snap.announcements.every((a) => a.audience === 'everyone')).toBe(true);
    expect(snap.infoPages.every((p) => p.audience === 'everyone')).toBe(true);
    expect(snap.trip.participantCode).toBeUndefined();
    expect(snap.trip.organizerCode).toBeUndefined();
    const participants = snap.people.filter((p) => p.role === 'participant');
    expect(participants.every((p) => !p.phone && !p.dietary && !p.emergencyContact && !p.notes)).toBe(true);
    expect(snap.people.filter((p) => p.role === 'organizer').some((p) => p.phone)).toBe(true);
    expect(JSON.stringify(snap)).not.toContain('CPH-48213'); // booking ref in organizer notes
  });

  it('organizers see everything except the organizer code', async () => {
    const { as } = await setup({ demo: true });
    const snap = (await as('organizer').get('/api/data')).body as Snapshot;
    expect(snap.canEdit).toBe(true);
    expect(snap.events.some((e) => e.audience === 'organizers')).toBe(true);
    expect(snap.events.some((e) => e.organizerNotes)).toBe(true);
    expect(snap.tasks.length).toBeGreaterThan(0);
    expect(snap.trip.participantCode).toBeTruthy();
    expect(snap.trip.organizerCode).toBeUndefined();
    expect(snap.people.some((p) => p.dietary)).toBe(true);
  });

  it('admins also get the organizer code', async () => {
    const { as } = await setup();
    const snap = (await as('admin').get('/api/data')).body as Snapshot;
    expect(snap.trip.organizerCode).toBeTruthy();
    expect(snap.adminPasswordFromEnv).toBe(true);
  });

  it('supports conditional requests', async () => {
    const { as } = await setup();
    const first = await as('participant').get('/api/data');
    const etag = first.headers.etag;
    expect(etag).toBeTruthy();
    const second = await as('participant').get('/api/data').set('If-None-Match', etag);
    expect(second.status).toBe(304);
  });
});

describe('editing the schedule', () => {
  it('lets editors create, update and delete events', async () => {
    const { as } = await setup();
    const created = await as('admin').post('/api/events', { title: 'Lunch', date: '2027-03-01', startTime: '12:00', endTime: '13:00', category: 'meal' });
    expect(created.status).toBe(200);
    const id = created.body.id;
    const upd = await as('organizer').put(`/api/events/${id}`, { title: 'Lunch', date: '2027-03-01', startTime: '12:30', endTime: '13:30', category: 'meal', changeNote: 'Half an hour later' });
    expect(upd.status).toBe(200);
    let snap = (await as('participant').get('/api/data')).body as Snapshot;
    expect(snap.events.find((e) => e.id === id)).toMatchObject({ startTime: '12:30', changeNote: 'Half an hour later' });
    expect((await as('admin').del(`/api/events/${id}`)).status).toBe(200);
    snap = (await as('participant').get('/api/data')).body as Snapshot;
    expect(snap.events.find((e) => e.id === id)).toBeUndefined();
  });

  it('returns readable validation errors', async () => {
    const { as } = await setup();
    const res = await as('admin').post('/api/events', { title: '', date: 'tomorrow' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title|date/i);
  });

  it('keeps participants read-only', async () => {
    const { as } = await setup();
    expect((await as('participant').post('/api/events', { title: 'x', date: '2027-03-01' })).status).toBe(403);
    expect((await as('participant').post('/api/tasks', { title: 'x' })).status).toBe(403);
    expect((await as('participant').post('/api/announcements', { title: 'x' })).status).toBe(403);
    expect((await as('participant').get('/api/admin/overview')).status).toBe(403);
  });

  it('can restrict editing to the admin', async () => {
    const { as, db } = await setup();
    const settings = { ...db.state.settings, organizersCanEdit: false };
    expect((await as('admin').put('/api/admin/settings', settings)).status).toBe(200);
    expect((await as('organizer').post('/api/events', { title: 'x', date: '2027-03-01' })).status).toBe(403);
    // Tasks stay open to all organizers.
    expect((await as('organizer').post('/api/tasks', { title: 'Buy tape' })).status).toBe(200);
    expect((await as('organizer').put('/api/admin/settings', settings)).status).toBe(403);
  });

  it('drops references to unknown groups and people', async () => {
    const { as, db } = await setup();
    const g = await as('admin').post('/api/groups', { name: 'Group A', color: '#ff0000' });
    const res = await as('admin').post('/api/events', { title: 'x', date: '2027-03-01', groupIds: [g.body.id, 'nope'], assigneeIds: ['ghost'] });
    const ev = db.state.events.find((e) => e.id === res.body.id)!;
    expect(ev.groupIds).toEqual([g.body.id]);
    expect(ev.assigneeIds).toEqual([]);
  });

  it('removes a deleted group from events and people', async () => {
    const { as, db } = await setup();
    const g = await as('admin').post('/api/groups', { name: 'Bus 1' });
    const p = await as('admin').post('/api/people', { name: 'Sam', groupIds: [g.body.id] });
    await as('admin').post('/api/events', { title: 'x', date: '2027-03-01', groupIds: [g.body.id] });
    expect((await as('admin').post('/api/groups', { name: 'bus 1' })).status).toBe(400);
    await as('admin').del(`/api/groups/${g.body.id}`);
    expect(db.state.people.find((x) => x.id === p.body.id)!.groupIds).toEqual([]);
    expect(db.state.events[0].groupIds).toEqual([]);
  });
});

describe('imports', () => {
  it('imports events, creating groups and linking organizers by name', async () => {
    const { as, db } = await setup();
    await as('admin').post('/api/people', { name: 'Noor de Vries', role: 'organizer' });
    const res = await as('organizer').post('/api/events/import', {
      mode: 'append',
      events: [
        { title: 'Breakfast', date: '2027-03-01', startTime: '08:00', category: 'meal', groupNames: [], assigneeNames: [] },
        { title: 'Visit', date: '2027-03-01', startTime: '10:00', groupNames: ['Group A'], assigneeNames: ['noor', 'Unknown Person'] },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ imported: 2, createdGroups: ['Group A'], unknownPeople: ['Unknown Person'] });
    const visit = db.state.events.find((e) => e.title === 'Visit')!;
    expect(visit.groupIds).toHaveLength(1);
    expect(visit.assigneeIds).toHaveLength(1);
  });

  it('rejects the whole import when a row is invalid', async () => {
    const { as, db } = await setup();
    const res = await as('admin').post('/api/events/import', { events: [{ title: 'ok', date: '2027-03-01' }, { title: '', date: 'x' }] });
    expect(res.status).toBe(400);
    expect(res.body.details[0].index).toBe(1);
    expect(db.state.events).toHaveLength(0);
  });

  it('replaces the schedule and keeps a backup', async () => {
    const { as, db, store } = await setup({ demo: true });
    const before = db.state.events.length;
    const res = await as('admin').post('/api/events/import', { mode: 'replace', events: [{ title: 'Only', date: '2027-03-01' }] });
    expect(res.status).toBe(200);
    expect(db.state.events).toHaveLength(1);
    expect(before).toBeGreaterThan(1);
    expect(store.backups.some((b) => b.reason === 'before-import')).toBe(true);
  });

  it('merges people by name on re-import', async () => {
    const { as, db } = await setup();
    await as('admin').post('/api/people/import', { people: [{ name: 'Sam', phone: '1', groupNames: ['Room 1'] }] });
    const res = await as('admin').post('/api/people/import', { people: [{ name: 'sam', dietary: 'Vegan', groupNames: ['Group B'] }] });
    expect(res.body).toMatchObject({ added: 0, updated: 1 });
    expect(db.state.people).toHaveLength(1);
    expect(db.state.people[0]).toMatchObject({ phone: '1', dietary: 'Vegan' });
    expect(db.state.people[0].groupIds).toHaveLength(2);
  });
});

describe('tasks', () => {
  it('lets organizers tick off tasks', async () => {
    const { as, db } = await setup();
    const p = await as('admin').post('/api/people', { name: 'Olly', role: 'organizer' });
    const t = await as('organizer').post('/api/tasks', { title: 'Buy tickets', assigneeIds: [p.body.id], dueDate: '2027-03-01' });
    await as('organizer').patch(`/api/tasks/${t.body.id}/done`, { done: true, by: p.body.id });
    expect(db.state.tasks[0]).toMatchObject({ done: true, doneBy: p.body.id });
    expect(db.state.tasks[0].doneAt).toBeTruthy();
    await as('organizer').patch(`/api/tasks/${t.body.id}/done`, { done: false });
    expect(db.state.tasks[0].doneAt).toBeUndefined();
  });

  it('unlinks tasks when their event is deleted', async () => {
    const { as, db } = await setup();
    const e = await as('admin').post('/api/events', { title: 'x', date: '2027-03-01' });
    await as('organizer').post('/api/tasks', { title: 'prep', eventId: e.body.id });
    expect(db.state.tasks[0].eventId).toBe(e.body.id);
    await as('admin').del(`/api/events/${e.body.id}`);
    expect(db.state.tasks[0].eventId).toBeUndefined();
  });
});

describe('calendar feeds', () => {
  it('serves role-appropriate ics feeds', async () => {
    const { as, agent } = await setup({ demo: true });
    const pSnap = (await as('participant').get('/api/data')).body as Snapshot;
    const oSnap = (await as('organizer').get('/api/data')).body as Snapshot;
    const pFeed = await agent.get(`/api/calendar/${pSnap.calendarToken}.ics`);
    const pText = unfold(pFeed.text);
    expect(pFeed.status).toBe(200);
    expect(pFeed.headers['content-type']).toMatch(/text\/calendar/);
    expect(pText).not.toContain('Organizer evaluation');
    expect(pText).not.toContain('CPH-48213');
    const oFeed = await agent.get(`/api/calendar/${oSnap.calendarToken}.ics`);
    expect(unfold(oFeed.text)).toContain('Organizer evaluation');
    expect(unfold(oFeed.text)).toContain('CPH-48213');
    const oFeedParticipantsOnly = await agent.get(`/api/calendar/${oSnap.calendarToken}.ics?scope=participants`);
    expect(unfold(oFeedParticipantsOnly.text)).not.toContain('Organizer evaluation');
    expect((await agent.get('/api/calendar/pwrongtoken.ics')).status).toBe(404);
  });

  it('filters a personal feed by group', async () => {
    const { as, agent } = await setup({ demo: true });
    const snap = (await as('participant').get('/api/data')).body as Snapshot;
    const groupA = snap.groups.find((g) => g.name === 'Group A')!;
    const personA = snap.people.find((p) => p.role === 'participant' && p.groupIds.includes(groupA.id))!;
    const feed = await agent.get(`/api/calendar/${snap.calendarToken}.ics?person=${personA.id}&remind=15`);
    expect(unfold(feed.text)).toContain('Company visit: design studio');
    expect(unfold(feed.text)).not.toContain('University lab visit');
    expect(feed.text).toContain('TRIGGER:-PT15M');
  });
});

describe('admin tools', () => {
  it('signs out all participants', async () => {
    const { as, agent } = await setup();
    const feedBefore = ((await as('participant').get('/api/data')).body as Snapshot).calendarToken;
    expect((await as('admin').post('/api/admin/sign-out', { role: 'participant' })).status).toBe(200);
    expect((await as('participant').get('/api/data')).status).toBe(401);
    expect((await as('organizer').get('/api/data')).status).toBe(200);
    expect((await agent.get(`/api/calendar/${feedBefore}.ics`)).status).toBe(404);
  });

  it('refuses trip codes equal to the admin password', async () => {
    const { as, db } = await setup();
    const res = await as('admin').put('/api/admin/settings', { ...db.state.settings, participantCode: ADMIN_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('exports and re-imports the whole trip', async () => {
    const { as, db } = await setup({ demo: true });
    const exported = (await as('admin').get('/api/admin/export')).body;
    expect(exported.format).toBe('prototrip-export');
    expect(JSON.stringify(exported)).not.toContain(db.state.secrets.sessionSecret);
    await as('admin').post('/api/admin/reset', { scope: 'everything' });
    expect(db.state.events).toHaveLength(0);
    const res = await as('admin').post('/api/admin/import', { data: exported });
    expect(res.status).toBe(200);
    expect(db.state.events).toHaveLength(exported.events.length);
    expect(db.state.people).toHaveLength(exported.people.length);
    expect((await as('admin').post('/api/admin/import', { data: { hello: 'world' } })).status).toBe(400);
  });

  it('restores a backup', async () => {
    const { as, db } = await setup({ demo: true });
    const count = db.state.events.length;
    await as('admin').post('/api/admin/reset', { scope: 'schedule' });
    expect(db.state.events).toHaveLength(0);
    const overview = (await as('admin').get('/api/admin/overview')).body;
    const backup = overview.backups.find((b: { reason: string }) => b.reason === 'before-reset-schedule');
    expect(backup).toBeTruthy();
    expect((await as('admin').post(`/api/admin/backups/${backup.id}/restore`)).status).toBe(200);
    expect(db.state.events).toHaveLength(count);
  });

  it('loads the demo trip', async () => {
    const { as, db } = await setup();
    const codes = { ...db.state.settings };
    await as('admin').post('/api/admin/demo');
    expect(db.state.events.length).toBeGreaterThan(10);
    expect(db.state.settings.participantCode).toBe(codes.participantCode);
  });

  it('serves a manifest with the trip name', async () => {
    const { agent } = await setup({ demo: true });
    const res = await agent.get('/manifest.webmanifest');
    expect(JSON.parse(res.text).name).toBe('ProtoTrip Demo');
  });
});

describe('admin password stored in the database', () => {
  it('can be changed and old admin sessions end', async () => {
    const { agent, tokens } = await setup({ envPassword: false });
    const token = tokens.admin;
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const bad = await agent.post('/api/admin/password').set(auth(token)).send({ current: 'nope', next: 'second-password' });
    expect(bad.status).toBe(400);
    const ok = await agent.post('/api/admin/password').set(auth(token)).send({ current: ADMIN_PASSWORD, next: 'second-password' });
    expect(ok.status).toBe(200);
    expect((await agent.get('/api/data').set(auth(token))).status).toBe(401);
    expect((await agent.get('/api/data').set(auth(ok.body.token))).status).toBe(200);
    expect((await agent.post('/api/auth/login').send({ code: 'second-password' })).body.role).toBe('admin');
    expect((await agent.post('/api/auth/login').send({ code: ADMIN_PASSWORD })).status).toBe(401);
  });

  it('cannot be changed in the app when it comes from the environment', async () => {
    const { as } = await setup();
    const res = await as('admin').post('/api/admin/password', { current: ADMIN_PASSWORD, next: 'something-else' });
    expect(res.status).toBe(400);
  });
});
