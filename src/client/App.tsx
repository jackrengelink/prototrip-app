import { AlertTriangle } from 'lucide-react';
import { type ComponentType, Component, type ErrorInfo, lazy, type ReactNode, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { FeedbackProvider } from './components/feedback';
import { Layout } from './components/Layout';
import { Button, EmptyState, Spinner } from './components/ui';
import { AnnouncementEditPage, NewsPage } from './pages/News';
import { EventDetailPage } from './pages/EventDetail';
import { EventEditPage } from './pages/EventEdit';
import { HomePage } from './pages/Home';
import { InfoEditPage, InfoPage, InfoPageView } from './pages/Info';
import { JoinPage, LoginPage } from './pages/Login';
import { MePage } from './pages/Me';
import { PeoplePage, PersonEditPage } from './pages/People';
import { SchedulePage } from './pages/Schedule';
import { TaskEditPage } from './pages/TaskEdit';
import { TasksPage } from './pages/Tasks';
import { DataProvider, useData } from './state/data';

// Admin tools are only needed by a few people, so they load on demand (and are still cached for offline use).
const ManagePage = lazy(() => import('./pages/Manage').then((m) => ({ default: m.ManagePage })));
import { PrefsProvider, usePrefs } from './state/prefs';

/** Remount a page when its :id changes so form state never leaks between items. */
function Keyed({ page: Page }: { page: ComponentType }) {
  const { id } = useParams();
  return <Page key={id ?? 'new'} />;
}

function NotFound() {
  const { t } = usePrefs();
  return <EmptyState title={t('common.notFound')} action={<Button to="/">{t('common.goHome')}</Button>} />;
}

function SignedInApp() {
  const { snapshot, loading, error, refresh, logout } = useData();
  const { t } = usePrefs();
  if (!snapshot) {
    if (loading || !error) {
      return (
        <div className="login-page">
          <Spinner label={t('common.loading')} />
        </div>
      );
    }
    return (
      <div className="login-page">
        <EmptyState
          icon={<AlertTriangle size={32} />}
          title={t('sync.loadFailed')}
          text={error}
          action={
            <>
              <Button variant="primary" onClick={() => void refresh()}>
                {t('common.retry')}
              </Button>
              <Button variant="ghost" onClick={logout}>
                {t('me.signOut')}
              </Button>
            </>
          }
        />
      </div>
    );
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/event/new" element={<EventEditPage key="new" />} />
        <Route path="/event/:id" element={<Keyed page={EventDetailPage} />} />
        <Route path="/event/:id/edit" element={<Keyed page={EventEditPage} />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/new" element={<TaskEditPage key="new" />} />
        <Route path="/tasks/:id" element={<Keyed page={TaskEditPage} />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/news/new" element={<AnnouncementEditPage key="new" />} />
        <Route path="/news/:id/edit" element={<Keyed page={AnnouncementEditPage} />} />
        <Route path="/info" element={<InfoPage />} />
        <Route path="/info/new" element={<InfoEditPage key="new" />} />
        <Route path="/info/:id" element={<Keyed page={InfoPageView} />} />
        <Route path="/info/:id/edit" element={<Keyed page={InfoEditPage} />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/people/new" element={<PersonEditPage key="new" />} />
        <Route path="/people/:id/edit" element={<Keyed page={PersonEditPage} />} />
        <Route path="/me" element={<MePage />} />
        <Route
          path="/manage"
          element={
            <Suspense fallback={<Spinner />}>
              <ManagePage />
            </Suspense>
          }
        />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

function Root() {
  const { session } = useData();
  if (!session) {
    return (
      <Routes>
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return <SignedInApp />;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="login-page">
          <div className="empty">
            <div className="empty-icon">
              <AlertTriangle size={32} />
            </div>
            <p className="empty-title">Something went wrong / Er ging iets mis</p>
            <p className="empty-text">{this.state.error.message}</p>
            <div className="empty-action">
              <button type="button" className="btn btn-primary btn-md" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <PrefsProvider>
        <FeedbackProvider>
          <DataProvider>
            <BrowserRouter>
              <Root />
            </BrowserRouter>
          </DataProvider>
        </FeedbackProvider>
      </PrefsProvider>
    </ErrorBoundary>
  );
}
