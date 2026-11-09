import {
  CalendarDays,
  House,
  Info,
  ListChecks,
  Megaphone,
  RefreshCw,
  Settings,
  UserRound,
  Users,
  WifiOff,
} from 'lucide-react';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { canEditRole, isOrganizerRole } from '../../shared/visibility';
import { formatRelative } from '../lib/format';
import { applyUpdate, hasUpdate, onUpdate } from '../lib/install';
import { readJson, writeJson } from '../lib/storage';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';
import { useNow } from './domain';
import { PersonPicker } from './PersonPicker';
import { Button } from './ui';

interface ShellValue {
  openPicker(): void;
  newsSeenAt: number;
  markNewsSeen(): void;
}

const ShellContext = createContext<ShellValue | null>(null);

export function useShell(): ShellValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell outside Layout');
  return ctx;
}

function useAccent(color: string | undefined) {
  useEffect(() => {
    const c = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#0e7c86';
    document.documentElement.style.setProperty('--accent', c);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c);
  }, [color]);
}

export function Layout({ children }: { children: ReactNode }) {
  const { t, locale } = usePrefs();
  const snapshot = useSnapshot();
  const { offline, lastSync, refresh, role } = useData();
  const location = useLocation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newsSeenAt, setNewsSeenAt] = useState<number>(() => readJson<number>('newsSeen', 0));
  const [updateReady, setUpdateReady] = useState(hasUpdate());
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow(60_000);
  useAccent(snapshot.trip.accentColor);

  useEffect(() => onUpdate(() => setUpdateReady(true)), []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const organizer = isOrganizerRole(role);
  const canEdit = canEditRole(role, snapshot.trip.organizersCanEdit);
  const unread = snapshot.announcements.filter((a) => Date.parse(a.createdAt) > newsSeenAt).length;
  const openTasks = organizer ? snapshot.tasks.filter((x) => !x.done).length : 0;

  const shell = useMemo<ShellValue>(
    () => ({
      openPicker: () => setPickerOpen(true),
      newsSeenAt,
      markNewsSeen: () => {
        const ts = Date.now();
        writeJson('newsSeen', ts);
        // Keep the "new" markers visible during this visit; the badge clears next time.
        window.setTimeout(() => setNewsSeenAt(ts), 4000);
      },
    }),
    [newsSeenAt],
  );

  const mobileNav = organizer
    ? [
        { to: '/', icon: <House size={22} />, label: t('nav.today'), end: true },
        { to: '/schedule', icon: <CalendarDays size={22} />, label: t('nav.schedule') },
        { to: '/tasks', icon: <ListChecks size={22} />, label: t('nav.tasks'), badge: openTasks || undefined, quiet: true },
        { to: '/news', icon: <Megaphone size={22} />, label: t('nav.news'), badge: unread || undefined },
        { to: '/me', icon: <UserRound size={22} />, label: t('nav.more') },
      ]
    : [
        { to: '/', icon: <House size={22} />, label: t('nav.today'), end: true },
        { to: '/schedule', icon: <CalendarDays size={22} />, label: t('nav.schedule') },
        { to: '/news', icon: <Megaphone size={22} />, label: t('nav.news'), badge: unread || undefined },
        { to: '/info', icon: <Info size={22} />, label: t('nav.info') },
        { to: '/me', icon: <UserRound size={22} />, label: t('nav.me') },
      ];

  const sideNav = [
    { to: '/', icon: <House size={20} />, label: t('nav.today'), end: true },
    { to: '/schedule', icon: <CalendarDays size={20} />, label: t('nav.schedule') },
    ...(organizer ? [{ to: '/tasks', icon: <ListChecks size={20} />, label: t('nav.tasks'), badge: openTasks || undefined, quiet: true }] : []),
    { to: '/news', icon: <Megaphone size={20} />, label: t('nav.news'), badge: unread || undefined },
    { to: '/info', icon: <Info size={20} />, label: t('nav.info') },
    { to: '/people', icon: <Users size={20} />, label: t('nav.people') },
    { to: '/me', icon: <UserRound size={20} />, label: t('nav.me') },
    ...(canEdit ? [{ to: '/manage', icon: <Settings size={20} />, label: t('nav.manage') }] : []),
  ];

  const doRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ShellContext.Provider value={shell}>
      <div className="app-shell">
        <aside className="side-nav" aria-label="Main">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              ✈
            </span>
            <div>
              <div className="brand-name">{snapshot.trip.name}</div>
              {snapshot.trip.destination && <div className="brand-sub">{snapshot.trip.destination}</div>}
            </div>
          </div>
          <nav>
            {sideNav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                {item.icon}
                <span>{item.label}</span>
                {item.badge ? <span className={`nav-badge${item.quiet ? ' quiet' : ''}`}>{item.badge}</span> : null}
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            <button type="button" className="sync-button" onClick={doRefresh} title={t('sync.refresh')}>
              {offline ? <WifiOff size={16} /> : <RefreshCw size={16} className={refreshing ? 'spin' : ''} />}
              <span>{offline ? t('sync.offlineShort') : lastSync ? t('sync.updated', { time: formatRelative(lastSync, now, locale) }) : ''}</span>
            </button>
          </div>
        </aside>

        <div className="main-col">
          <header className="top-bar">
            <div className="top-bar-title">
              <span className="brand-mark small" aria-hidden>
                ✈
              </span>
              <span className="top-bar-name">{snapshot.trip.name}</span>
            </div>
            <button type="button" className={`sync-pill${offline ? ' offline' : ''}`} onClick={doRefresh} aria-label={t('sync.refresh')}>
              {offline ? <WifiOff size={16} /> : <RefreshCw size={16} className={refreshing ? 'spin' : ''} />}
              {offline && <span>{t('sync.offlineShort')}</span>}
            </button>
          </header>

          {offline && lastSync && (
            <div className="banner banner-offline" role="status">
              <WifiOff size={16} />
              <span>{t('sync.offline', { time: formatRelative(lastSync, now, locale) })}</span>
            </div>
          )}
          {updateReady && (
            <div className="banner banner-update" role="status">
              <span>{t('sync.newVersion')}</span>
              <Button size="sm" variant="primary" onClick={applyUpdate}>
                {t('sync.reload')}
              </Button>
            </div>
          )}

          <main className="content" id="main">
            {children}
          </main>
        </div>

        <nav className="bottom-nav" aria-label="Main">
          {mobileNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `bottom-link${isActive ? ' active' : ''}`}>
              <span className="bottom-icon">
                {item.icon}
                {item.badge ? <span className={`nav-badge${item.quiet ? ' quiet' : ''}`}>{item.badge > 99 ? '99+' : item.badge}</span> : null}
              </span>
              <span className="bottom-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <PersonPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
      </div>
    </ShellContext.Provider>
  );
}

export function useDocumentTitle(title: string) {
  const { snapshot } = useData();
  const name = snapshot?.trip.name ?? 'ProtoTrip';
  useEffect(() => {
    document.title = title ? `${title} · ${name}` : name;
  }, [title, name]);
}
