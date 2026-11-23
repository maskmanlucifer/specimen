import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toasts } from './components/Toasts';
import { Spinner } from './components/ui';
import { useTheme } from './lib/theme';
import { useSession } from './store/session';

const Landing = lazy(() => import('./pages/Landing'));
const SignIn = lazy(() => import('./pages/SignIn'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const BoardPage = lazy(() => import('./pages/BoardPage'));
const PreviewPage = lazy(() => import('./pages/PreviewPage'));
const PluginLibrary = lazy(() => import('./pages/PluginLibrary'));
const PluginEditor = lazy(() => import('./pages/PluginEditor'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Loading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <Spinner />
    </div>
  );
}

/** Sends signed-out visitors to sign-in, and new instances through onboarding first. */
function Private({ children }: { children: ReactNode }) {
  const session = useSession((s) => s.session);
  const loc = useLocation();
  if (!session) return <Loading />;
  if (!session.user) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!session.onboarded && !loc.pathname.startsWith('/onboarding')) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function App() {
  const load = useSession((s) => s.load);
  useTheme();
  useEffect(() => {
    load();
  }, [load]);

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/onboarding" element={<Private><Onboarding /></Private>} />
        <Route path="/boards" element={<Private><Dashboard /></Private>} />
        <Route path="/b/:sid/:slug" element={<Private><BoardPage /></Private>} />
        <Route path="/b/:sid/:slug/preview" element={<Private><PreviewPage /></Private>} />
        <Route path="/plugins" element={<Private><PluginLibrary /></Private>} />
        <Route path="/plugins/new" element={<Private><PluginEditor /></Private>} />
        <Route path="/plugins/:id/edit" element={<Private><PluginEditor /></Private>} />
        <Route path="/settings" element={<Private><SettingsPage /></Private>} />
        <Route path="/settings/:tab" element={<Private><SettingsPage /></Private>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toasts />
    </Suspense>
  );
}
