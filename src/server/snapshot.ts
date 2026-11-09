import type { PublicTrip, Role, Snapshot } from '../shared/schemas';
import { canEditRole, eventForRole, eventVisibleTo, isOrganizerRole, personForRole } from '../shared/visibility';
import { calendarToken } from './auth';
import type { AppState } from './state';

export function publicTrip(state: AppState, role: Role): PublicTrip {
  const { participantCode, organizerCode, ...rest } = state.settings;
  const trip: PublicTrip = { ...rest };
  if (isOrganizerRole(role)) trip.participantCode = participantCode;
  if (role === 'admin') trip.organizerCode = organizerCode;
  return trip;
}

export function buildSnapshot(state: AppState, role: Role, opts: { adminPasswordFromEnv?: boolean } = {}): Snapshot {
  const organizer = isOrganizerRole(role);
  return {
    version: state.version,
    serverTime: new Date().toISOString(),
    role,
    canEdit: canEditRole(role, state.settings.organizersCanEdit),
    trip: publicTrip(state, role),
    events: state.events.filter((e) => eventVisibleTo(e, role)).map((e) => eventForRole(e, role)),
    tasks: organizer ? state.tasks : [],
    announcements: state.announcements.filter((a) => a.audience === 'everyone' || organizer),
    people: state.people.map((p) => personForRole(p, role)),
    groups: state.groups,
    infoPages: state.infoPages
      .filter((p) => p.audience === 'everyone' || organizer)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    checkins: organizer ? state.checkins : {},
    calendarToken: calendarToken(state, role),
    pushPublicKey: state.push.publicKey,
    adminPasswordFromEnv: role === 'admin' ? !!opts.adminPasswordFromEnv : undefined,
  };
}
