import { ChevronDown, Lock, Mail, MessageCircle, Pencil, Phone, Plus, Search, Trash2, Upload, Utensils } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Group, PersonRole, PublicPerson } from '../../shared/schemas';
import { canEditRole, isOrganizerRole } from '../../shared/visibility';
import { GroupChips } from '../components/domain';
import { useFeedback } from '../components/feedback';
import { useDocumentTitle } from '../components/Layout';
import { Avatar, Badge, Button, Card, Chip, EmptyState, ErrorText, Field, IconButton, Modal, PageHeader, Section, Segmented, TextArea, TextInput } from '../components/ui';
import { errorMessage } from '../lib/api';
import { telHref, whatsappHref } from '../lib/format';
import { normalizeText } from '../lib/schedule';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';

const GROUP_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#059669'];

function PersonRow({ p, groups, canEdit, isMe, organizerView }: { p: PublicPerson; groups: Group[]; canEdit: boolean; isMe: boolean; organizerView: boolean }) {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const wa = p.phone ? whatsappHref(p.phone) : null;
  const hasPrivate = organizerView && (p.dietary || p.emergencyContact || p.notes || p.email);
  return (
    <li className={`person-row${open ? ' open' : ''}`}>
      <div className="person-main">
        <Avatar name={p.name} color={groups.find((g) => p.groupIds.includes(g.id))?.color} />
        <button type="button" className="person-text" onClick={() => hasPrivate && setOpen((o) => !o)} aria-expanded={hasPrivate ? open : undefined}>
          <span className="person-name">
            {p.name}
            {isMe && <Badge tone="accent">{t('people.you')}</Badge>}
            {organizerView && p.dietary && (
              <span title={p.dietary} className="diet-icon">
                <Utensils size={13} />
              </span>
            )}
          </span>
          <span className="person-sub">
            {p.roleTitle && <span>{p.roleTitle}</span>}
            <GroupChips ids={p.groupIds} groups={groups} />
          </span>
        </button>
        <div className="person-actions">
          {p.phone && (
            <a className="icon-btn icon-btn-subtle" href={telHref(p.phone)} aria-label={`${t('people.call')} ${p.name}`} title={p.phone}>
              <Phone size={18} />
            </a>
          )}
          {wa && (
            <a className="icon-btn icon-btn-subtle hide-tiny" href={wa} target="_blank" rel="noopener noreferrer" aria-label={`${t('people.whatsapp')} ${p.name}`}>
              <MessageCircle size={18} />
            </a>
          )}
          {canEdit && <IconButton label={t('common.edit')} icon={<Pencil size={16} />} to={`/people/${p.id}/edit`} />}
          {hasPrivate && <IconButton label={t('common.more')} icon={<ChevronDown size={18} className={open ? 'rot180' : ''} />} onClick={() => setOpen((o) => !o)} />}
        </div>
      </div>
      {open && hasPrivate && (
        <dl className="person-details">
          {p.phone && (
            <>
              <dt>{t('people.phone')}</dt>
              <dd>
                <a href={telHref(p.phone)}>{p.phone}</a>
              </dd>
            </>
          )}
          {p.email && (
            <>
              <dt>{t('people.emailField')}</dt>
              <dd>
                <a href={`mailto:${p.email}`}>
                  <Mail size={13} /> {p.email}
                </a>
              </dd>
            </>
          )}
          {p.dietary && (
            <>
              <dt>{t('people.dietary')}</dt>
              <dd>{p.dietary}</dd>
            </>
          )}
          {p.emergencyContact && (
            <>
              <dt>{t('people.emergency')}</dt>
              <dd>{p.emergencyContact}</dd>
            </>
          )}
          {p.notes && (
            <>
              <dt>{t('people.notes')}</dt>
              <dd>{p.notes}</dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
}

function GroupEditor({ group, open, onClose }: { group?: Group; open: boolean; onClose(): void }) {
  const { t } = usePrefs();
  const snapshot = useSnapshot();
  const { mutate } = useData();
  const { toast } = useFeedback();
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState(group?.color ?? GROUP_COLORS[snapshot.groups.length % GROUP_COLORS.length]);
  const [description, setDescription] = useState(group?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { name, color, description };
      await mutate((api) => (group ? api.put(`/groups/${group.id}`, payload) : api.post('/groups', payload)));
      toast(t('common.saved'));
      onClose();
    } catch (err) {
      setError(errorMessage(err, t('common.offline')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={group ? t('people.editGroup') : t('people.addGroup')}>
      <form className="form" onSubmit={submit}>
        <Field label={t('people.groupName')} htmlFor="group-name">
          <TextInput id="group-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </Field>
        <Field label={t('people.groupColor')}>
          <div className="color-row">
            {GROUP_COLORS.map((c) => (
              <button key={c} type="button" className={`color-swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label={t('people.groupColor')} />
          </div>
        </Field>
        <Field label={t('people.groupDescription')} htmlFor="group-desc" optional={t('common.optional')}>
          <TextInput id="group-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="form-actions">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function GroupsSection({ canEdit }: { canEdit: boolean }) {
  const { t } = usePrefs();
  const snapshot = useSnapshot();
  const { mutate } = useData();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<Group | 'new' | null>(null);

  const remove = async (g: Group) => {
    const ok = await confirm({ title: t('common.delete'), message: t('people.deleteGroupConfirm', { name: g.name }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await mutate((api) => api.del(`/groups/${g.id}`));
      toast(t('common.deleted'));
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    }
  };

  return (
    <Section title={t('people.groups')} actions={canEdit && <Button size="sm" variant="ghost" icon={<Plus size={16} />} onClick={() => setEditing('new')}>{t('people.addGroup')}</Button>}>
      {snapshot.groups.length === 0 ? (
        <p className="muted">{t('people.noGroups')}</p>
      ) : (
        <ul className="group-list">
          {snapshot.groups.map((g) => {
            const count = snapshot.people.filter((p) => p.groupIds.includes(g.id)).length;
            return (
              <li key={g.id} className="group-row" style={{ '--chip-color': g.color } as React.CSSProperties}>
                <span className="group-swatch" />
                <span className="grow">
                  <strong>{g.name}</strong>
                  <span className="muted small"> · {t('people.members', { n: count })}</span>
                  {g.description && <span className="muted small block">{g.description}</span>}
                </span>
                {canEdit && (
                  <>
                    <IconButton label={t('common.edit')} icon={<Pencil size={16} />} onClick={() => setEditing(g)} />
                    <IconButton label={t('common.delete')} icon={<Trash2 size={16} />} onClick={() => remove(g)} />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && <GroupEditor key={editing === 'new' ? 'new' : editing.id} group={editing === 'new' ? undefined : editing} open onClose={() => setEditing(null)} />}
    </Section>
  );
}

function DietaryOverview({ people }: { people: PublicPerson[] }) {
  const { t } = usePrefs();
  const withDiet = people.filter((p) => p.dietary);
  const [open, setOpen] = useState(false);
  if (!withDiet.length) return null;
  return (
    <Card className="diet-card">
      <button type="button" className="disclosure" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Utensils size={16} /> {t('people.dietaryOverview')} ({withDiet.length}) <ChevronDown size={16} className={open ? 'rot180' : ''} />
      </button>
      {open && (
        <ul className="diet-list">
          {withDiet.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong>: {p.dietary}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function PeoplePage() {
  const { t } = usePrefs();
  useDocumentTitle(t('people.title'));
  const snapshot = useSnapshot();
  const { role, meId } = useData();
  const organizerView = isOrganizerRole(role);
  const canEdit = canEditRole(role, snapshot.trip.organizersCanEdit);
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const nq = normalizeText(q.trim());
    return [...snapshot.people]
      .filter((p) => !nq || normalizeText(`${p.name} ${p.roleTitle ?? ''}`).includes(nq))
      .filter((p) => !groupFilter || p.groupIds.includes(groupFilter))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [snapshot.people, q, groupFilter]);
  const organizers = filtered.filter((p) => p.role === 'organizer');
  const participants = filtered.filter((p) => p.role === 'participant');

  return (
    <div className="page people-page">
      <PageHeader
        title={t('people.title')}
        subtitle={`${snapshot.people.length}`}
        actions={
          canEdit && (
            <>
              <IconButton label={t('people.import')} icon={<Upload size={20} />} to="/manage#import-people" />
              <IconButton label={t('people.add')} icon={<Plus size={22} />} to="/people/new" />
            </>
          )
        }
      />
      {snapshot.people.length === 0 ? (
        <EmptyState
          title={t('people.empty')}
          action={canEdit ? <Button variant="primary" to="/people/new" icon={<Plus size={18} />}>{t('people.add')}</Button> : undefined}
        />
      ) : (
        <>
          <div className="search-box">
            <Search size={18} aria-hidden />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('people.search')} aria-label={t('people.search')} type="search" />
          </div>
          {snapshot.groups.length > 0 && (
            <div className="chip-row">
              {snapshot.groups.map((g) => (
                <Chip key={g.id} color={g.color} selected={groupFilter === g.id} onClick={() => setGroupFilter(groupFilter === g.id ? null : g.id)}>
                  {g.name}
                </Chip>
              ))}
            </div>
          )}
          {organizerView && <DietaryOverview people={filtered} />}
          {organizers.length > 0 && (
            <Section title={`${t('people.organizers')} (${organizers.length})`}>
              <ul className="person-list">
                {organizers.map((p) => (
                  <PersonRow key={p.id} p={p} groups={snapshot.groups} canEdit={canEdit} isMe={p.id === meId} organizerView={organizerView} />
                ))}
              </ul>
            </Section>
          )}
          {participants.length > 0 && (
            <Section title={`${t('people.participants')} (${participants.length})`}>
              <ul className="person-list">
                {participants.map((p) => (
                  <PersonRow key={p.id} p={p} groups={snapshot.groups} canEdit={canEdit} isMe={p.id === meId} organizerView={organizerView} />
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      {(organizerView || snapshot.groups.length > 0) && <GroupsSection canEdit={canEdit} />}
      {organizerView && (
        <p className="muted small privacy-note">
          <Lock size={13} /> {t('people.privateHint')}
        </p>
      )}
    </div>
  );
}

export function PersonEditPage() {
  const { id } = useParams();
  const { t } = usePrefs();
  const snapshot = useSnapshot();
  const { role, mutate } = useData();
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const existing = id ? snapshot.people.find((p) => p.id === id) : undefined;
  useDocumentTitle(existing ? t('people.edit') : t('people.add'));
  const [name, setName] = useState(existing?.name ?? '');
  const [personRole, setPersonRole] = useState<PersonRole>(existing?.role ?? 'participant');
  const [roleTitle, setRoleTitle] = useState(existing?.roleTitle ?? '');
  const [groupIds, setGroupIds] = useState<string[]>(existing?.groupIds ?? []);
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [dietary, setDietary] = useState(existing?.dietary ?? '');
  const [emergencyContact, setEmergencyContact] = useState(existing?.emergencyContact ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEditRole(role, snapshot.trip.organizersCanEdit)) {
    return (
      <div className="page">
        <EmptyState title={t('manage.editorOnly')} />
      </div>
    );
  }
  if (id && !existing) {
    return (
      <div className="page">
        <PageHeader title="" back="/people" />
        <EmptyState title={t('people.notFound')} />
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { name, role: personRole, roleTitle, groupIds, phone, email, dietary, emergencyContact, notes };
    try {
      await mutate((api) => (existing ? api.put(`/people/${existing.id}`, payload) : api.post('/people', payload)));
      toast(t('common.saved'));
      navigate('/people', { replace: true });
    } catch (err) {
      setError(errorMessage(err, t('common.offline')));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({ title: t('common.delete'), message: t('common.confirmDelete', { name: existing.name }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await mutate((api) => api.del(`/people/${existing.id}`));
      toast(t('common.deleted'));
      navigate('/people', { replace: true });
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    }
  };

  return (
    <div className="page form-page">
      <PageHeader title={existing ? t('people.edit') : t('people.add')} back />
      <form className="form" onSubmit={submit}>
        <Field label={t('people.name')} htmlFor="p-name">
          <TextInput id="p-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus={!existing} />
        </Field>
        <Field label={t('people.role')}>
          <Segmented<PersonRole>
            value={personRole}
            onChange={setPersonRole}
            options={[
              { value: 'participant', label: t('people.roleParticipant') },
              { value: 'organizer', label: t('people.roleOrganizer') },
            ]}
          />
        </Field>
        <Field label={t('people.roleTitle')} htmlFor="p-title" optional={t('common.optional')}>
          <TextInput id="p-title" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} maxLength={80} />
        </Field>
        {snapshot.groups.length > 0 && (
          <Field label={t('people.groupsField')}>
            <div className="chip-row">
              {snapshot.groups.map((g) => (
                <Chip key={g.id} color={g.color} selected={groupIds.includes(g.id)} onClick={() => setGroupIds((ids) => (ids.includes(g.id) ? ids.filter((x) => x !== g.id) : [...ids, g.id]))}>
                  {g.name}
                </Chip>
              ))}
            </div>
          </Field>
        )}
        <div className="grid-2">
          <Field label={t('people.phone')} htmlFor="p-phone" optional={t('common.optional')} hint="+31 6 12345678">
            <TextInput id="p-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
          </Field>
          <Field label={t('people.emailField')} htmlFor="p-email" optional={t('common.optional')}>
            <TextInput id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </Field>
        </div>
        <div className="orga-field-group">
          <p className="muted small">
            <Lock size={13} /> {t('people.privateHint')}
          </p>
          <Field label={t('people.dietary')} htmlFor="p-diet" optional={t('common.optional')}>
            <TextInput id="p-diet" value={dietary} onChange={(e) => setDietary(e.target.value)} maxLength={300} />
          </Field>
          <Field label={t('people.emergency')} htmlFor="p-ice" optional={t('common.optional')}>
            <TextInput id="p-ice" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} maxLength={200} />
          </Field>
          <Field label={t('people.notes')} htmlFor="p-notes" optional={t('common.optional')}>
            <TextArea id="p-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} />
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="form-actions sticky">
          {existing && (
            <Button variant="ghost" className="danger-text" icon={<Trash2 size={18} />} onClick={remove}>
              {t('common.delete')}
            </Button>
          )}
          <span className="grow" />
          <Button variant="ghost" onClick={() => navigate(-1)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
