/**
 * Who may see and do what. Used by the server to filter data per role and by the
 * client to decide which controls to show.
 */
import type { Person, PublicPerson, Role, ScheduleEvent } from './schemas';

export function isOrganizerRole(role: Role | undefined | null): boolean {
  return role === 'organizer' || role === 'admin';
}

export function canEditRole(role: Role | undefined | null, organizersCanEdit: boolean): boolean {
  if (role === 'admin') return true;
  return role === 'organizer' && organizersCanEdit;
}

/** Strip organizer-only fields from an event for participants. */
export function eventForRole(ev: ScheduleEvent, role: Role): ScheduleEvent {
  if (isOrganizerRole(role)) return ev;
  const { organizerNotes: _omit, ...rest } = ev;
  return rest;
}

export function eventVisibleTo(ev: ScheduleEvent, role: Role): boolean {
  return ev.audience === 'everyone' || isOrganizerRole(role);
}

/**
 * Participants see names, roles and groups of everyone; organizers' contact details
 * (so they can reach them); but never other participants' phone numbers, dietary
 * information, emergency contacts or notes.
 */
export function personForRole(p: Person, role: Role): PublicPerson {
  if (isOrganizerRole(role)) return p;
  const base: PublicPerson = { id: p.id, name: p.name, role: p.role, roleTitle: p.roleTitle, groupIds: p.groupIds };
  if (p.role === 'organizer') {
    base.phone = p.phone;
    base.email = p.email;
  }
  return base;
}

/** Events relevant for a specific person (used for "my schedule" filters and personal calendar feeds). */
export function eventRelevantForPerson(
  ev: Pick<ScheduleEvent, 'audience' | 'groupIds' | 'assigneeIds'>,
  person: Pick<PublicPerson, 'id' | 'role' | 'groupIds'> | undefined,
): boolean {
  if (!person) return true;
  if (ev.assigneeIds.includes(person.id)) return true;
  if (ev.audience === 'organizers') {
    if (person.role !== 'organizer') return false;
    // Organizer items assigned to specific people are only "mine" if I'm one of them.
    return ev.assigneeIds.length === 0;
  }
  if (ev.groupIds.length === 0) return true;
  // Organizers without a specific group look after everyone, so every group's items are theirs.
  if (person.role === 'organizer' && person.groupIds.length === 0) return true;
  return ev.groupIds.some((g) => person.groupIds.includes(g));
}
