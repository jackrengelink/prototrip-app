import {
  Bell,
  Copy,
  Database,
  Download,
  History,
  KeyRound,
  Printer,
  QrCode,
  RefreshCw,
  Share2,
  ShieldAlert,
  Upload,
  Wand2,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { TripSettings } from '../../shared/schemas';
import { canEditRole } from '../../shared/visibility';
import { QrImage } from '../components/QrImage';
import { useFeedback } from '../components/feedback';
import { useDocumentTitle } from '../components/Layout';
import { Button, Card, EmptyState, ErrorText, Field, Modal, PageHeader, Select, Spinner, TextArea, TextInput, Toggle } from '../components/ui';
import { errorMessage } from '../lib/api';
import { copyText, downloadText, readFileAsText, safeFilename, shareOrCopy } from '../lib/download';
import { formatDateTime, formatRelative } from '../lib/format';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';
import { allTimeZones } from './EventEdit';
import { PeopleImport, ScheduleImport } from './Import';

interface Overview {
  settings: TripSettings;
  storage: 'file' | 'postgres' | 'memory';
  adminPasswordFromEnv: boolean;
  publicUrl?: string;
  pushSubscriptions: { total: number; organizers: number };
  counts: { events: number; tasks: number; announcements: number; people: number; groups: number; infoPages: number };
  backups: { id: string; createdAt: string; reason: string; size: number }[];
}

const ACCENTS = ['#0e7c86', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0f172a'];
const READABLE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(prefix: string, len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => READABLE[b % READABLE.length]).join('');
}

function TripForm({ settings, onSaved }: { settings: TripSettings; onSaved(): void }) {
  const { t } = usePrefs();
  const { mutate } = useData();
  const { toast } = useFeedback();
  const [s, setS] = useState<TripSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof TripSettings>(k: K, v: TripSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await mutate((api) => api.put('/admin/settings', s));
      toast(t('tripForm.saved'));
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t('common.offline')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field label={t('tripForm.name')} htmlFor="trip-name">
        <TextInput id="trip-name" value={s.name} onChange={(e) => set('name', e.target.value)} required maxLength={80} />
      </Field>
      <div className="grid-2">
        <Field label={t('tripForm.tagline')} htmlFor="trip-tag" optional={t('common.optional')}>
          <TextInput id="trip-tag" value={s.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} maxLength={160} />
        </Field>
        <Field label={t('tripForm.destination')} htmlFor="trip-dest" optional={t('common.optional')}>
          <TextInput id="trip-dest" value={s.destination ?? ''} onChange={(e) => set('destination', e.target.value)} maxLength={120} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label={t('tripForm.startDate')} htmlFor="trip-start">
          <TextInput id="trip-start" type="date" value={s.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label={t('tripForm.endDate')} htmlFor="trip-end">
          <TextInput id="trip-end" type="date" value={s.endDate ?? ''} min={s.startDate} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
      </div>
      <Field label={t('tripForm.timezone')} hint={t('tripForm.timezoneHint')} htmlFor="trip-tz">
        <Select id="trip-tz" value={s.timezone} onChange={(e) => set('timezone', e.target.value)}>
          {allTimeZones().map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('tripForm.welcome')} hint={t('eventForm.markdownHint')} htmlFor="trip-welcome" optional={t('common.optional')}>
        <TextArea id="trip-welcome" value={s.welcomeMessage ?? ''} onChange={(e) => set('welcomeMessage', e.target.value)} maxLength={5000} />
      </Field>
      <div className="grid-2">
        <Field label={t('tripForm.emergency')} htmlFor="trip-112">
          <TextInput id="trip-112" value={s.emergencyNumber ?? ''} onChange={(e) => set('emergencyNumber', e.target.value)} maxLength={30} inputMode="tel" />
        </Field>
        <Field label={t('tripForm.language')} htmlFor="trip-lang">
          <Select id="trip-lang" value={s.defaultLanguage} onChange={(e) => set('defaultLanguage', e.target.value as 'en' | 'nl')}>
            <option value="en">English</option>
            <option value="nl">Nederlands</option>
          </Select>
        </Field>
      </div>
      <Field label={t('tripForm.accent')}>
        <div className="color-row">
          {ACCENTS.map((c) => (
            <button key={c} type="button" className={`color-swatch${c === s.accentColor ? ' on' : ''}`} style={{ background: c }} onClick={() => set('accentColor', c)} aria-label={c} />
          ))}
          <input type="color" value={s.accentColor} onChange={(e) => set('accentColor', e.target.value)} aria-label={t('tripForm.accent')} />
        </div>
      </Field>
      <div className="grid-2">
        <Field label={t('tripForm.participantCode')} htmlFor="trip-pcode">
          <div className="input-with-button">
            <TextInput id="trip-pcode" value={s.participantCode} onChange={(e) => set('participantCode', e.target.value.replace(/\s/g, ''))} required minLength={4} maxLength={64} />
            <Button size="sm" variant="ghost" icon={<RefreshCw size={16} />} onClick={() => set('participantCode', randomCode('TRIP-', 5))}>
              {t('tripForm.generate')}
            </Button>
          </div>
        </Field>
        <Field label={t('tripForm.organizerCode')} htmlFor="trip-ocode">
          <div className="input-with-button">
            <TextInput id="trip-ocode" value={s.organizerCode} onChange={(e) => set('organizerCode', e.target.value.replace(/\s/g, ''))} required minLength={6} maxLength={64} />
            <Button size="sm" variant="ghost" icon={<RefreshCw size={16} />} onClick={() => set('organizerCode', `${randomCode('ORGA-', 4)}-${randomCode('', 4)}`)}>
              {t('tripForm.generate')}
            </Button>
          </div>
        </Field>
      </div>
      <Toggle checked={s.organizersCanEdit} onChange={(v) => set('organizersCanEdit', v)} label={t('tripForm.organizersCanEdit')} hint={t('tripForm.organizersCanEditHint')} />
      <ErrorText>{error}</ErrorText>
      <div className="form-actions">
        <Button type="submit" variant="primary" loading={busy}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

function CodeShare({ title, text, code, tripName, kind }: { title: string; text: string; code: string; tripName: string; kind: 'participants' | 'organizers' }) {
  const { t } = usePrefs();
  const { toast } = useFeedback();
  const [qrOpen, setQrOpen] = useState(false);
  const link = `${window.location.origin}/join/${encodeURIComponent(code)}`;

  const printPoster = () => {
    document.body.classList.add('printing-poster');
    const done = () => {
      document.body.classList.remove('printing-poster');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.setTimeout(() => window.print(), 250);
  };

  return (
    <div className={`code-share code-share-${kind}`}>
      <h3>{title}</h3>
      <p className="muted small">{text}</p>
      <div className="code-display">
        <code>{code}</code>
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy size={16} />}
          onClick={async () => {
            if (await copyText(code)) toast(t('common.copied'));
          }}
        >
          {t('common.copy')}
        </Button>
      </div>
      <Field label={t('access.joinLink')}>
        <div className="input-with-button">
          <TextInput value={link} readOnly onFocus={(e) => e.target.select()} />
          <Button
            size="sm"
            variant="ghost"
            icon={<Share2 size={16} />}
            onClick={async () => {
              const res = await shareOrCopy({ title: tripName, text: `${tripName}: ${link}`, url: link });
              if (res === 'copied') toast(t('common.copied'));
            }}
          >
            {t('common.share')}
          </Button>
        </div>
      </Field>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" icon={<QrCode size={16} />} onClick={() => setQrOpen(true)}>
          {t('access.showQr')}
        </Button>
      </div>
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title={title}>
        <div className="qr-modal">
          <QrImage value={link} size={260} />
          <code className="big-code">{code}</code>
          <Button icon={<Printer size={18} />} onClick={printPoster}>
            {t('access.printQr')}
          </Button>
        </div>
      </Modal>
      {qrOpen && (
        <div className="print-poster" aria-hidden>
          <h1>{tripName}</h1>
          <p>{t('access.scanToJoin')}</p>
          <QrImage value={link} size={420} />
          <p className="poster-code">{code}</p>
          <p className="poster-link">{link}</p>
        </div>
      )}
    </div>
  );
}

function AccessSection({ overview, reload }: { overview: Overview; reload(): void }) {
  const { t } = usePrefs();
  const { mutate, api, logout } = useData();
  const { toast, confirm } = useFeedback();
  const s = overview.settings;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOutAll = async (role: 'participant' | 'organizer') => {
    if (!(await confirm({ title: t('access.signOutAll'), message: t('access.signOutConfirm'), confirmLabel: t('access.signOutAll'), danger: true }))) return;
    try {
      await mutate((a) => a.post('/admin/sign-out', { role }));
      toast(t('access.signedOut'));
      reload();
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ token: string }>('/admin/password', { current, next });
      // The server signs out other admin sessions; keep this device signed in.
      const session = { token: res.token, role: 'admin' as const };
      try {
        window.localStorage.setItem('pt.session', JSON.stringify(session));
      } catch {
        /* ignore */
      }
      toast(t('access.passwordChanged'));
      setCurrent('');
      setNext('');
      window.setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setError(errorMessage(err, t('common.offline')));
      if ((err as { status?: number }).status === 401) logout();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="share-grid">
        <div>
          <CodeShare title={t('access.participants')} text={t('access.participantsText')} code={s.participantCode} tripName={s.name} kind="participants" />
          <Button size="sm" variant="ghost" className="danger-text" onClick={() => signOutAll('participant')}>
            {t('access.signOutAll')}
          </Button>
        </div>
        <div>
          <CodeShare title={t('access.organizers')} text={t('access.organizersText')} code={s.organizerCode} tripName={s.name} kind="organizers" />
          <Button size="sm" variant="ghost" className="danger-text" onClick={() => signOutAll('organizer')}>
            {t('access.signOutAll')}
          </Button>
        </div>
      </div>
      <p className="muted small">{t('access.changeCodes')}</p>
      <h3 className="sub-heading">
        <KeyRound size={18} /> {t('manage.security')}
      </h3>
      {overview.adminPasswordFromEnv ? (
        <p className="muted">{t('access.passwordEnv')}</p>
      ) : (
        <form className="form" onSubmit={changePassword}>
          <div className="grid-2">
            <Field label={t('access.passwordCurrent')} htmlFor="pw-current">
              <TextInput id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </Field>
            <Field label={t('access.passwordNew')} htmlFor="pw-new">
              <TextInput id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
            </Field>
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="form-actions">
            <Button type="submit" loading={busy}>
              {t('access.passwordChange')}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

function DataSection({ overview, reload }: { overview: Overview; reload(): void }) {
  const { t, locale } = usePrefs();
  const snapshot = useSnapshot();
  const { api, mutate } = useData();
  const { toast, confirm } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const exportJson = async () => {
    setBusy('export');
    try {
      const data = await api.get('/admin/export');
      downloadText(`${safeFilename(snapshot.trip.name)}-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    } finally {
      setBusy(null);
    }
  };

  const importJson = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await readFileAsText(file));
    } catch {
      toast('Invalid JSON file', 'error');
      return;
    }
    if (!(await confirm({ title: t('data.importJson'), message: t('data.importConfirm'), confirmLabel: t('data.restore'), danger: true }))) return;
    setBusy('import');
    try {
      await mutate((a) => a.post('/admin/import', { data, keepCodes: true }));
      toast(t('data.restored'));
      reload();
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    } finally {
      setBusy(null);
    }
  };

  const restore = async (id: string) => {
    if (!(await confirm({ title: t('data.restore'), message: t('data.restoreConfirm'), confirmLabel: t('data.restore'), danger: true }))) return;
    setBusy(id);
    try {
      await mutate((a) => a.post(`/admin/backups/${encodeURIComponent(id)}/restore`));
      toast(t('data.restored'));
      reload();
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    } finally {
      setBusy(null);
    }
  };

  const backupNow = async () => {
    setBusy('backup');
    try {
      await api.post('/admin/backups');
      toast(t('data.backupMade'));
      reload();
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <p className="muted small">
        <Database size={14} /> {t('data.storage', { kind: t(`data.storage.${overview.storage}`) })} ·{' '}
        {t('manage.counts', { events: overview.counts.events, people: overview.counts.people, tasks: overview.counts.tasks })}
      </p>
      <div className="button-grid">
        <Button icon={<Download size={18} />} onClick={exportJson} loading={busy === 'export'}>
          {t('data.exportJson')}
        </Button>
        <Button icon={<Upload size={18} />} onClick={() => fileRef.current?.click()} loading={busy === 'import'}>
          {t('data.importJson')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importJson(f);
          }}
        />
      </div>
      <h3 className="sub-heading">
        <History size={18} /> {t('data.backups')}
      </h3>
      <p className="muted small">{t('data.backupsHint')}</p>
      {overview.backups.length === 0 ? (
        <p className="muted">{t('data.noBackups')}</p>
      ) : (
        <ul className="backup-list">
          {overview.backups.slice(0, 15).map((b) => (
            <li key={b.id}>
              <span className="grow">
                {formatDateTime(Date.parse(b.createdAt), snapshot.trip.timezone, locale)}
                <span className="muted small">
                  {' '}
                  · {b.reason} · {formatRelative(Date.parse(b.createdAt), Date.now(), locale)} · {Math.max(1, Math.round(b.size / 1024))} KB
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => restore(b.id)} loading={busy === b.id}>
                {t('data.restore')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" onClick={backupNow} loading={busy === 'backup'}>
        {t('data.backupNow')}
      </Button>
    </>
  );
}

function NotificationsSection({ overview }: { overview: Overview }) {
  const { t } = usePrefs();
  const { api } = useData();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <p>{t('pushAdmin.subscribers', { n: overview.pushSubscriptions.total, o: overview.pushSubscriptions.organizers })}</p>
      <Button
        size="sm"
        icon={<Bell size={16} />}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await api.post<{ result: { sent: number } }>('/admin/push-test');
            toast(t('pushAdmin.testSent', { n: res.result.sent }));
          } catch (err) {
            toast(errorMessage(err, t('common.offline')), 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('pushAdmin.test')}
      </Button>
    </>
  );
}

function DangerSection({ reload }: { reload(): void }) {
  const { t } = usePrefs();
  const { mutate } = useData();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, title: string, path: string, body?: unknown) => {
    if (!(await confirm({ title, message: t('danger.confirm'), confirmLabel: title, danger: true }))) return;
    setBusy(key);
    try {
      await mutate((a) => a.post(path, body));
      toast(t('danger.done'));
      reload();
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="danger-list">
      <div>
        <div className="grow">
          <strong>{t('danger.demo')}</strong>
          <p className="muted small">{t('danger.demoText')}</p>
        </div>
        <Button size="sm" icon={<Wand2 size={16} />} loading={busy === 'demo'} onClick={() => act('demo', t('danger.demo'), '/admin/demo')}>
          {t('danger.demo')}
        </Button>
      </div>
      <div>
        <div className="grow">
          <strong>{t('danger.clearSchedule')}</strong>
          <p className="muted small">{t('danger.clearScheduleText')}</p>
        </div>
        <Button size="sm" variant="danger" loading={busy === 'clear'} onClick={() => act('clear', t('danger.clearSchedule'), '/admin/reset', { scope: 'schedule' })}>
          {t('danger.clearSchedule')}
        </Button>
      </div>
      <div>
        <div className="grow">
          <strong>{t('danger.resetAll')}</strong>
          <p className="muted small">{t('danger.resetAllText')}</p>
        </div>
        <Button size="sm" variant="danger" loading={busy === 'reset'} onClick={() => act('reset', t('danger.resetAll'), '/admin/reset', { scope: 'everything' })}>
          {t('danger.resetAll')}
        </Button>
      </div>
    </div>
  );
}

export function ManagePage() {
  const { t } = usePrefs();
  useDocumentTitle(t('manage.title'));
  const snapshot = useSnapshot();
  const { role, api } = useData();
  const location = useLocation();
  const isAdmin = role === 'admin';
  const canEdit = canEditRole(role, snapshot.trip.organizersCanEdit);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    api
      .get<Overview>('/admin/overview')
      .then((o) => {
        setOverview(o);
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorMessage(err, t('common.offline'))));
  }, [api, isAdmin, t]);

  useEffect(() => {
    load();
  }, [load, snapshot.version]);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    return () => window.clearTimeout(timer);
  }, [location.hash, overview !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canEdit) {
    return (
      <div className="page">
        <PageHeader title={t('manage.title')} back />
        <EmptyState icon={<ShieldAlert size={32} />} title={t('manage.editorOnly')} />
      </div>
    );
  }

  return (
    <div className="page manage-page">
      <PageHeader title={t('manage.title')} subtitle={!isAdmin ? t('manage.editorOnly') : undefined} />

      {isAdmin && !overview && !loadError && <Spinner />}
      {loadError && <ErrorText>{loadError}</ErrorText>}

      {isAdmin && overview && (
        <>
          <Card className="manage-card" accent="var(--accent)">
            <h2 className="card-title" id="trip">
              {t('manage.trip')}
            </h2>
            <TripForm key={JSON.stringify(overview.settings)} settings={overview.settings} onSaved={load} />
          </Card>
          <Card className="manage-card">
            <h2 className="card-title" id="access">
              {t('manage.access')}
            </h2>
            <AccessSection overview={overview} reload={load} />
          </Card>
        </>
      )}

      <Card className="manage-card">
        <h2 className="card-title" id="import">
          {t('manage.import')}
        </h2>
        <ScheduleImport />
        <hr />
        <PeopleImport />
      </Card>

      {isAdmin && overview && (
        <>
          <Card className="manage-card">
            <h2 className="card-title" id="data">
              {t('manage.data')}
            </h2>
            <DataSection overview={overview} reload={load} />
          </Card>
          <Card className="manage-card">
            <h2 className="card-title" id="notifications">
              {t('manage.notifications')}
            </h2>
            <NotificationsSection overview={overview} />
          </Card>
          <Card className="manage-card danger-card">
            <h2 className="card-title" id="danger">
              {t('manage.danger')}
            </h2>
            <DangerSection reload={load} />
          </Card>
        </>
      )}
    </div>
  );
}
