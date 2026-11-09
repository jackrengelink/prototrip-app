import { ChevronDown, Lock, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CATEGORIES, guessCategory } from '../../shared/categories';
import type { Audience, CategoryId, EventStatus, ScheduleEvent } from '../../shared/schemas';
import { todayInTz } from '../../shared/time';
import { canEditRole } from '../../shared/visibility';
import { CategoryIcon } from '../components/domain';
import { useFeedback } from '../components/feedback';
import { useDocumentTitle } from '../components/Layout';
import { Button, Chip, EmptyState, ErrorText, Field, IconButton, PageHeader, Segmented, Select, TextArea, TextInput, Toggle } from '../components/ui';
import { zoneCity } from '../hooks';
import { errorMessage } from '../lib/api';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';

interface FormState {
  title: string;
  category: CategoryId;
  date: string;
  startTime: string;
  endTime: string;
  endDate: string;
  timezone: string;
  audience: Audience;
  groupIds: string[];
  assigneeIds: string[];
  location: string;
  address: string;
  meetingPoint: string;
  description: string;
  organizerNotes: string;
  bring: string;
  cost: string;
  links: { label: string; url: string }[];
  status: EventStatus;
  changeNote: string;
}

function fromEvent(ev: ScheduleEvent): FormState {
  return {
    title: ev.title,
    category: ev.category,
    date: ev.date,
    startTime: ev.startTime ?? '',
    endTime: ev.endTime ?? '',
    endDate: ev.endDate ?? '',
    timezone: ev.timezone ?? '',
    audience: ev.audience,
    groupIds: ev.groupIds,
    assigneeIds: ev.assigneeIds,
    location: ev.location ?? '',
    address: ev.address ?? '',
    meetingPoint: ev.meetingPoint ?? '',
    description: ev.description ?? '',
    organizerNotes: ev.organizerNotes ?? '',
    bring: ev.bring ?? '',
    cost: ev.cost ?? '',
    links: ev.links,
    status: ev.status,
    changeNote: ev.changeNote ?? '',
  };
}

let zoneCache: string[] | null = null;
export function allTimeZones(): string[] {
  if (zoneCache) return zoneCache;
  try {
    zoneCache = (Intl as typeof Intl & { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    zoneCache = ['Europe/Amsterdam', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo', 'UTC'];
  }
  return zoneCache;
}

export function EventEditPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t } = usePrefs();
  const snapshot = useSnapshot();
  const { role, mutate } = useData();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const existing = id ? snapshot.events.find((e) => e.id === id) : undefined;
  const copyOf = params.get('copy') ? snapshot.events.find((e) => e.id === params.get('copy')) : undefined;
  const isNew = !id;
  useDocumentTitle(isNew ? t('eventForm.newTitle') : t('eventForm.editTitle'));

  const initial = useMemo<FormState>(() => {
    if (existing) return fromEvent(existing);
    if (copyOf) return { ...fromEvent(copyOf), title: `${copyOf.title} ${t('event.copySuffix')}`, changeNote: '', status: 'scheduled' };
    const tz = snapshot.trip.timezone;
    const today = todayInTz(tz);
    const date = params.get('date') || (snapshot.trip.startDate && today < snapshot.trip.startDate ? snapshot.trip.startDate : today);
    return {
      title: '',
      category: 'other',
      date,
      startTime: '',
      endTime: '',
      endDate: '',
      timezone: '',
      audience: params.get('audience') === 'organizers' ? 'organizers' : 'everyone',
      groupIds: [],
      assigneeIds: [],
      location: '',
      address: '',
      meetingPoint: '',
      description: '',
      organizerNotes: '',
      bring: '',
      cost: '',
      links: [],
      status: 'scheduled',
      changeNote: '',
    };
  }, [existing?.id, copyOf?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState<FormState>(initial);
  const [categoryTouched, setCategoryTouched] = useState(!isNew || !!copyOf);
  const [showMore, setShowMore] = useState(() => !!(initial.endDate || initial.timezone || initial.links.length || initial.cost || initial.status !== 'scheduled'));
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEditRole(role, snapshot.trip.organizersCanEdit)) {
    return (
      <div className="page">
        <PageHeader title={t('eventForm.editTitle')} back />
        <EmptyState title={t('manage.editorOnly')} />
      </div>
    );
  }
  if (id && !existing) {
    return (
      <div className="page">
        <PageHeader title="" back="/schedule" />
        <EmptyState title={t('event.notFound')} />
      </div>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleIn = (key: 'groupIds' | 'assigneeIds', value: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));

  const onTitle = (value: string) => {
    setForm((f) => {
      const next = { ...f, title: value };
      if (!categoryTouched) next.category = guessCategory(value) ?? 'other';
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...form,
      endTime: form.startTime ? form.endTime : '',
      groupIds: form.audience === 'everyone' ? form.groupIds : [],
      links: form.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim(), url: /^https?:\/\//i.test(l.url.trim()) ? l.url.trim() : `https://${l.url.trim()}` })),
      notify,
    };
    try {
      const res = await mutate((api) => (existing ? api.put(`/events/${existing.id}`, payload) : api.post('/events', payload)));
      toast(t('eventForm.saved'));
      navigate(`/event/${existing?.id ?? res.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err, t('common.offline')));
      setBusy(false);
    }
  };

  const organizers = snapshot.people.filter((p) => p.role === 'organizer');
  const assigneeCandidates = organizers.length ? organizers : snapshot.people;

  return (
    <div className="page form-page">
      <PageHeader title={isNew ? t('eventForm.newTitle') : t('eventForm.editTitle')} back />
      <form onSubmit={submit} className="form">
        <Field label={t('eventForm.title')} htmlFor="ev-title">
          <TextInput id="ev-title" value={form.title} onChange={(e) => onTitle(e.target.value)} required maxLength={200} autoFocus={isNew} />
        </Field>

        <Field label={t('eventForm.category')}>
          <div className="chip-row">
            {CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                selected={form.category === c.id}
                icon={<CategoryIcon category={c.id} size={14} />}
                onClick={() => {
                  setCategoryTouched(true);
                  set('category', c.id);
                }}
              >
                {t(`cat.${c.id}`)}
              </Chip>
            ))}
          </div>
        </Field>

        <div className="grid-3">
          <Field label={t('eventForm.date')} htmlFor="ev-date">
            <TextInput id="ev-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
          </Field>
          <Field label={t('eventForm.start')} htmlFor="ev-start">
            <TextInput id="ev-start" type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
          <Field label={t('eventForm.end')} htmlFor="ev-end">
            <TextInput id="ev-end" type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} disabled={!form.startTime} />
          </Field>
        </div>
        <p className="field-hint">{t('eventForm.timeHint')}</p>

        <Field label={t('eventForm.audience')}>
          <Segmented<Audience>
            value={form.audience}
            onChange={(v) => set('audience', v)}
            options={[
              { value: 'everyone', label: t('eventForm.audienceEveryone') },
              {
                value: 'organizers',
                label: (
                  <>
                    <Lock size={14} /> {t('eventForm.audienceOrganizers')}
                  </>
                ),
              },
            ]}
          />
        </Field>

        {form.audience === 'everyone' && snapshot.groups.length > 0 && (
          <Field label={t('eventForm.groups')} hint={t('eventForm.groupsHint')}>
            <div className="chip-row">
              {snapshot.groups.map((g) => (
                <Chip key={g.id} color={g.color} selected={form.groupIds.includes(g.id)} onClick={() => toggleIn('groupIds', g.id)}>
                  {g.name}
                </Chip>
              ))}
            </div>
          </Field>
        )}

        {assigneeCandidates.length > 0 && (
          <Field label={t('eventForm.assignees')} optional={t('common.optional')}>
            <div className="chip-row">
              {assigneeCandidates.map((p) => (
                <Chip key={p.id} selected={form.assigneeIds.includes(p.id)} onClick={() => toggleIn('assigneeIds', p.id)}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </Field>
        )}

        <div className="grid-2">
          <Field label={t('eventForm.location')} htmlFor="ev-loc" optional={t('common.optional')}>
            <TextInput id="ev-loc" value={form.location} onChange={(e) => set('location', e.target.value)} maxLength={200} />
          </Field>
          <Field label={t('eventForm.address')} htmlFor="ev-addr" optional={t('common.optional')}>
            <TextInput id="ev-addr" value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={300} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label={t('eventForm.meetingPoint')} htmlFor="ev-meet" optional={t('common.optional')}>
            <TextInput id="ev-meet" value={form.meetingPoint} onChange={(e) => set('meetingPoint', e.target.value)} maxLength={200} />
          </Field>
          <Field label={t('eventForm.bring')} htmlFor="ev-bring" optional={t('common.optional')}>
            <TextInput id="ev-bring" value={form.bring} onChange={(e) => set('bring', e.target.value)} maxLength={1000} />
          </Field>
        </div>

        <Field label={t('eventForm.description')} hint={t('eventForm.markdownHint')} htmlFor="ev-desc" optional={t('common.optional')}>
          <TextArea id="ev-desc" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={5000} />
        </Field>

        <Field
          label={
            <>
              <Lock size={14} /> {t('eventForm.organizerNotes')}
            </>
          }
          hint={t('eventForm.organizerNotesHint')}
          htmlFor="ev-onotes"
          className="orga-field"
        >
          <TextArea id="ev-onotes" value={form.organizerNotes} onChange={(e) => set('organizerNotes', e.target.value)} maxLength={5000} rows={2} />
        </Field>

        {!isNew && (
          <Field label={t('eventForm.changeNote')} hint={t('eventForm.changeNoteHint')} htmlFor="ev-change" optional={t('common.optional')}>
            <TextInput id="ev-change" value={form.changeNote} onChange={(e) => set('changeNote', e.target.value)} maxLength={300} />
          </Field>
        )}

        <button type="button" className={`disclosure${showMore ? ' open' : ''}`} onClick={() => setShowMore((s) => !s)} aria-expanded={showMore}>
          <ChevronDown size={18} /> {t('eventForm.moreOptions')}
        </button>

        {showMore && (
          <div className="more-options">
            <Field label={t('eventForm.status')}>
              <Segmented<EventStatus>
                value={form.status}
                onChange={(v) => set('status', v)}
                options={[
                  { value: 'scheduled', label: t('eventForm.statusScheduled') },
                  { value: 'tentative', label: t('eventForm.statusTentative') },
                  { value: 'cancelled', label: t('eventForm.statusCancelled') },
                ]}
              />
            </Field>
            <div className="grid-2">
              <Field label={t('eventForm.endDate')} htmlFor="ev-enddate" optional={t('common.optional')}>
                <TextInput id="ev-enddate" type="date" value={form.endDate} min={form.date} onChange={(e) => set('endDate', e.target.value)} />
              </Field>
              <Field label={t('eventForm.cost')} htmlFor="ev-cost" optional={t('common.optional')}>
                <TextInput id="ev-cost" value={form.cost} onChange={(e) => set('cost', e.target.value)} maxLength={100} placeholder="€" />
              </Field>
            </div>
            <Field label={t('eventForm.timezone')} hint={t('eventForm.timezoneHint')} htmlFor="ev-tz">
              <Select id="ev-tz" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                <option value="">{t('eventForm.tripTimezone', { tz: zoneCity(snapshot.trip.timezone) })}</option>
                {allTimeZones().map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('eventForm.links')}>
              <div className="stack" style={{ gap: 8 }}>
                {form.links.map((l, i) => (
                  <div key={i} className="link-edit-row">
                    <TextInput
                      value={l.label}
                      placeholder={t('eventForm.linkLabel')}
                      onChange={(e) => set('links', form.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    />
                    <TextInput
                      value={l.url}
                      placeholder="https://…"
                      type="url"
                      inputMode="url"
                      onChange={(e) => set('links', form.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                    />
                    <IconButton label={t('common.delete')} icon={<Trash2 size={18} />} onClick={() => set('links', form.links.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={<Plus size={16} />} onClick={() => set('links', [...form.links, { label: '', url: '' }])}>
                  {t('eventForm.addLink')}
                </Button>
              </div>
            </Field>
          </div>
        )}

        <div className="notify-box">
          <Toggle checked={notify} onChange={setNotify} label={t('eventForm.notify')} hint={t('eventForm.notifyHint')} />
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="form-actions sticky">
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
