import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicPerson, Role, Snapshot } from '../../shared/schemas';
import { ApiClient, ApiError, OfflineError } from '../lib/api';
import { readJson, removeKey, writeJson } from '../lib/storage';
import { usePrefs } from './prefs';

interface Session {
  token: string;
  role: Role;
}

interface CachedSnapshot {
  data: Snapshot;
  savedAt: number;
  etag?: string | null;
}

interface DataValue {
  session: Session | null;
  role: Role | null;
  snapshot: Snapshot | null;
  /** True while loading for the first time without anything cached. */
  loading: boolean;
  error: string | null;
  offline: boolean;
  lastSync: number | null;
  api: ApiClient;
  login(code: string): Promise<Role>;
  /** Sign out on this device. 'expired' when the server ended the session (e.g. "sign out all devices"). */
  logout(reason?: 'expired'): void;
  /** Fetch the latest data. `fresh` waits for any request already running and fetches again. */
  refresh(fresh?: boolean): Promise<void>;
  /** Run a change on the server and refresh the data afterwards. */
  mutate<T>(fn: (api: ApiClient) => Promise<T>): Promise<T>;
  meId: string | null;
  me: PublicPerson | undefined;
  setMeId(id: string | null): void;
}

const DataContext = createContext<DataValue | null>(null);

const POLL_MS = 30_000;

export function DataProvider({ children }: { children: ReactNode }) {
  const { setTripDefaultLang } = usePrefs();
  const [session, setSession] = useState<Session | null>(() => readJson<Session | null>('session', null));
  const cached = useMemo(() => (session ? readJson<CachedSnapshot | null>('snapshot', null) : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [snapshot, setSnapshot] = useState<Snapshot | null>(cached?.data ?? null);
  const [lastSync, setLastSync] = useState<number | null>(cached?.savedAt ?? null);
  const [loading, setLoading] = useState<boolean>(!!session && !cached);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState<boolean>(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [meId, setMeIdState] = useState<string | null>(() => readJson<string | null>('me', null));

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const etagRef = useRef<string | null>(cached?.etag ?? null);
  const inFlight = useRef<Promise<void> | null>(null);

  const logout = useCallback((reason?: 'expired') => {
    if (reason === 'expired' && sessionRef.current) writeJson('sessionEnded', true);
    sessionRef.current = null;
    setSession(null);
    setSnapshot(null);
    setLastSync(null);
    setError(null);
    etagRef.current = null;
    removeKey('session');
    removeKey('snapshot');
  }, []);

  const api = useMemo(() => new ApiClient(() => sessionRef.current?.token ?? null, () => logout('expired')), [logout]);

  const refresh = useCallback(async (fresh = false): Promise<void> => {
    if (!sessionRef.current) return;
    if (inFlight.current) {
      if (!fresh) return inFlight.current;
      // A poll that started before a change was saved may return old data: wait, then fetch again.
      await inFlight.current.catch(() => undefined);
      return refresh(true);
    }
    const run = (async () => {
      try {
        const res = await api.snapshot(etagRef.current);
        if (res.snapshot) {
          etagRef.current = res.etag ?? null;
          setSnapshot(res.snapshot);
          writeJson('snapshot', { data: res.snapshot, savedAt: Date.now(), etag: res.etag } satisfies CachedSnapshot);
          if (res.snapshot.role !== sessionRef.current?.role && sessionRef.current) {
            const next = { ...sessionRef.current, role: res.snapshot.role };
            setSession(next);
            writeJson('session', next);
          }
        }
        setLastSync(Date.now());
        setOffline(false);
        setError(null);
      } catch (err) {
        if (err instanceof OfflineError) setOffline(true);
        else if (err instanceof ApiError && err.status === 401) {
          /* logout() already ran */
        } else setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const login = useCallback(
    async (code: string) => {
      const res = await api.login(code);
      const next = { token: res.token, role: res.role };
      sessionRef.current = next;
      etagRef.current = null;
      removeKey('snapshot');
      writeJson('session', next);
      setSession(next);
      setSnapshot(null);
      setLoading(true);
      await refresh(true);
      return res.role;
    },
    [api, refresh],
  );

  const mutate = useCallback(
    async <T,>(fn: (api: ApiClient) => Promise<T>): Promise<T> => {
      const result = await fn(api);
      await refresh(true);
      return result;
    },
    [api, refresh],
  );

  const setMeId = useCallback((id: string | null) => {
    setMeIdState(id);
    writeJson('me', id);
  }, []);

  // Initial load + polling while the app is visible.
  useEffect(() => {
    if (!session) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onOnline = () => void refresh();
    const onOffline = () => setOffline(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onVisible);
    };
  }, [session?.token, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (snapshot?.trip.defaultLanguage) setTripDefaultLang(snapshot.trip.defaultLanguage);
  }, [snapshot?.trip.defaultLanguage, setTripDefaultLang]);

  const me = useMemo(() => (meId ? snapshot?.people.find((p) => p.id === meId) : undefined), [meId, snapshot]);

  const value = useMemo<DataValue>(
    () => ({
      session,
      role: snapshot?.role ?? session?.role ?? null,
      snapshot,
      loading,
      error,
      offline,
      lastSync,
      api,
      login,
      logout,
      refresh,
      mutate,
      meId,
      me,
      setMeId,
    }),
    [session, snapshot, loading, error, offline, lastSync, api, login, logout, refresh, mutate, meId, me, setMeId],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}

/** Snapshot that is guaranteed to exist (only use inside the signed-in app shell). */
export function useSnapshot(): Snapshot {
  const { snapshot } = useData();
  if (!snapshot) throw new Error('No snapshot loaded');
  return snapshot;
}
