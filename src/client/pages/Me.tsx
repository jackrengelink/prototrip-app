import { Bell, BellOff, CalendarDays, ChevronRight, Copy, Download, Info, LogOut, Settings, Smartphone, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildIcs } from '../../shared/ics';
import { eventRelevantForPerson, isOrganizerRole, canEditRole } from '../../shared/visibility';
import { GroupChips } from '../components/domain';
import { useFeedback } from '../components/feedback';
import { useDocumentTitle, useShell } from '../components/Layout';
import { Avatar, Button, Card, PageHeader, Section, Segmented, Toggle } from '../components/ui';
import { copyText, downloadText, safeFilename } from '../lib/download';
import { canPromptInstall, onInstallChange, promptInstall } from '../lib/install';
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupport, syncPush } from '../lib/push';
import { useData, useSnapshot } from '../state/data';
import { type Lang, type Theme, usePrefs } from '../state/prefs';

function NotificationsCard() {
  const { t } = usePrefs();
  const snapshot = useSnapshot();
  const { api, meId } = useData();
  const { toast } = useFeedback();
  const support = pushSupport();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';

  useEffect(() => {
    if (support !== 'supported') return;
    currentSubscription().then((s) => setEnabled(!!s && Notification.permission === 'granted'));
  }, [support]);

  // Keep the server in sync with who this device belongs to.
  useEffect(() => {
    if (enabled) void syncPush(api, meId);
  }, [enabled, meId, api]);

  const turnOn = async () => {
    if (!snapshot.pushPublicKey) return;
    setBusy(true);
    try {
      const res = await enablePush(api, snapshot.pushPublicKey, meId);
      if (res === 'ok') setEnabled(true);
      else toast(res === 'denied' ? t('me.notifyDenied') : t('me.notifyFailed'), 'error');
    } catch {
      toast(t('me.notifyFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush(api);
    setEnabled(false);
    setBusy(false);
  };

  return (
    <Section title={t('me.notifications')}>
      <Card>
        {support === 'unsupported' && <p className="muted">{t('me.notifyUnsupported')}</p>}
        {support === 'ios-needs-install' && <p className="muted">{t('me.notifyIos')}</p>}
        {support === 'supported' && (
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            {enabled ? <Bell size={22} className="accent" /> : <BellOff size={22} className="muted" />}
            <p className="grow">{permission === 'denied' ? t('me.notifyDenied') : enabled ? t('me.notifyOn') : t('me.notifyOff')}</p>
            {enabled ? (
              <Button size="sm" variant="ghost" onClick={turnOff} loading={busy}>
                {t('me.notifyDisable')}
              </Button>
            ) : (
              permission !== 'denied' && (
                <Button size="sm" variant="primary" onClick={turnOn} loading={busy || enabled === null}>
                  {t('me.notifyEnable')}
                </Button>
              )
            )}
          </div>
        )}
      </Card>
    </Section>
  );
}

function CalendarCard() {
  const { t } = usePrefs();
  const snapshot = useSnapshot();
  const { me, role } = useData();
  const { toast } = useFeedback();
  const organizer = isOrganizerRole(role);
  const [onlyMine, setOnlyMine] = useState(!!me && !organizer);
  const [remind, setRemind] = useState(false);
  const [includeOrga, setIncludeOrga] = useState(true);

  const params = new URLSearchParams();
  if (onlyMine && me) params.set('person', me.id);
  if (remind) params.set('remind', '15');
  if (organizer && !includeOrga) params.set('scope', 'participants');
  const qs = params.toString();
  const httpsUrl = `${window.location.origin}/api/calendar/${snapshot.calendarToken}.ics${qs ? `?${qs}` : ''}`;
  const webcalUrl = httpsUrl.replace(/^https?:/, 'webcal:');
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;

  const download = () => {
    let events = snapshot.events;
    if (organizer && !includeOrga) events = events.filter((e) => e.audience === 'everyone');
    if (onlyMine && me) events = events.filter((e) => eventRelevantForPerson(e, me));
    const ics = buildIcs({
      calendarName: snapshot.trip.name,
      tripTimezone: snapshot.trip.timezone,
      events,
      baseUrl: window.location.origin,
      includeOrganizerNotes: organizer,
      reminderMinutes: remind ? 15 : undefined,
      peopleNames: Object.fromEntries(snapshot.people.map((p) => [p.id, p.name])),
      groupNames: Object.fromEntries(snapshot.groups.map((g) => [g.id, g.name])),
    });
    downloadText(`${safeFilename(snapshot.trip.name)}.ics`, ics, 'text/calendar');
  };

  return (
    <Section title={t('me.calendar')}>
      <Card>
        <p className="muted">{t('me.calendarText')}</p>
        <div className="stack" style={{ gap: 4, margin: '8px 0 12px' }}>
          {me && <Toggle checked={onlyMine} onChange={setOnlyMine} label={t('me.calendarOnlyMine')} />}
          {organizer && <Toggle checked={includeOrga} onChange={setIncludeOrga} label={t('me.calendarOrganizerItems')} />}
          <Toggle checked={remind} onChange={setRemind} label={t('me.calendarReminders')} />
        </div>
        <div className="button-grid">
          <Button href={webcalUrl} icon={<CalendarDays size={18} />}>
            {t('me.subscribe')}
          </Button>
          <Button href={googleUrl} icon={<CalendarDays size={18} />}>
            {t('me.google')}
          </Button>
          <Button variant="ghost" icon={<Download size={18} />} onClick={download}>
            {t('me.downloadIcs')}
          </Button>
          <Button
            variant="ghost"
            icon={<Copy size={18} />}
            onClick={async () => {
              if (await copyText(httpsUrl)) toast(t('common.copied'));
            }}
          >
            {t('me.copyLink')}
          </Button>
        </div>
      </Card>
    </Section>
  );
}

function InstallCard() {
  const { t } = usePrefs();
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  useEffect(() => onInstallChange(() => setCanInstall(canPromptInstall())), []);
  const installed = isStandalone();
  return (
    <Section title={t('me.install')}>
      <Card>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <Smartphone size={22} className="accent" />
          <p className="grow">{installed ? t('me.installed') : canInstall ? t('me.installText') : isIos() ? t('me.installIos') : `${t('me.installText')} ${t('me.installOther')}`}</p>
          {!installed && canInstall && (
            <Button size="sm" variant="primary" onClick={() => void promptInstall()}>
              {t('me.installButton')}
            </Button>
          )}
        </div>
      </Card>
    </Section>
  );
}

export function MePage() {
  const { t, langChoice, setLang, theme, setTheme } = usePrefs();
  useDocumentTitle(t('me.title'));
  const snapshot = useSnapshot();
  const { role, me, logout } = useData();
  const { openPicker } = useShell();
  const { confirm } = useFeedback();
  const canEdit = canEditRole(role, snapshot.trip.organizersCanEdit);

  const signOut = async () => {
    if (await confirm({ title: t('me.signOut'), message: t('me.signOutConfirm'), confirmLabel: t('me.signOut'), danger: true })) logout();
  };

  return (
    <div className="page me-page">
      <PageHeader title={t('me.title')} subtitle={t('me.signedInAs', { role: t(`me.role.${role ?? 'participant'}`) })} />

      <Card className="identity">
        {me ? <Avatar name={me.name} size={48} /> : <span className="avatar empty" style={{ width: 48, height: 48 }} />}
        <div className="grow">
          <div className="muted small">{t('me.identity')}</div>
          <strong className="identity-name">{me?.name ?? t('me.notSet')}</strong>
          {me && (
            <div className="chips-inline">
              <GroupChips ids={me.groupIds} groups={snapshot.groups} />
            </div>
          )}
        </div>
        {snapshot.people.length > 0 && (
          <Button size="sm" variant={me ? 'ghost' : 'primary'} onClick={openPicker}>
            {me ? t('me.change') : t('me.choose')}
          </Button>
        )}
      </Card>
      <p className="muted small">{t('me.identityHint')}</p>

      <nav className="menu-list" aria-label={t('me.links')}>
        <Link to="/people">
          <Users size={20} /> <span className="grow">{t('nav.people')}</span> <ChevronRight size={18} />
        </Link>
        <Link to="/info">
          <Info size={20} /> <span className="grow">{t('nav.info')}</span> <ChevronRight size={18} />
        </Link>
        {canEdit && (
          <Link to="/manage">
            <Settings size={20} /> <span className="grow">{t('me.manage')}</span> <ChevronRight size={18} />
          </Link>
        )}
      </nav>

      <NotificationsCard />
      <CalendarCard />
      <InstallCard />

      <Section title={t('me.language')}>
        <Segmented<'auto' | Lang>
          value={langChoice ?? 'auto'}
          onChange={(v) => setLang(v === 'auto' ? null : v)}
          options={[
            { value: 'auto', label: t('me.theme.system') },
            { value: 'en', label: 'English' },
            { value: 'nl', label: 'Nederlands' },
          ]}
        />
      </Section>
      <Section title={t('me.theme')}>
        <Segmented<Theme>
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: t('me.theme.system') },
            { value: 'light', label: t('me.theme.light') },
            { value: 'dark', label: t('me.theme.dark') },
          ]}
        />
      </Section>

      <Button variant="ghost" icon={<LogOut size={18} />} onClick={signOut} className="danger-text sign-out">
        {t('me.signOut')}
      </Button>
      <p className="muted small center">{t('me.privacy')}</p>
    </div>
  );
}
