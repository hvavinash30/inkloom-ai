import { RefreshCw, ServerOff } from 'lucide-react';
import { SessionProvider, useSession } from './context/SessionContext';
import { ToastProvider } from './components/Toast';
import { AssistantDrawer } from './components/AssistantDrawer';
import { Shell } from './components/Shell';
import { Button, Card } from './components/ui';
import { useHashRoute, type Route } from './lib/router';
import { routeRequirement } from './lib/navigation';
import { DashboardPage } from './pages/DashboardPage';
import { ContentListPage } from './pages/ContentListPage';
import { NewContentPage } from './pages/NewContentPage';
import { DocumentPage } from './pages/DocumentPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { CampaignDetailPage } from './pages/CampaignDetailPage';
import { BrandLibraryPage } from './pages/BrandLibraryPage';
import { PoliciesPage } from './pages/PoliciesPage';
import { HistoryPage } from './pages/HistoryPage';
import { InsightsPage } from './pages/InsightsPage';
import { ResearchPage } from './pages/ResearchPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { TeamPage } from './pages/TeamPage';
import { SettingsPage } from './pages/SettingsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { AccessDeniedPage, NotFoundPage } from './pages/Errors';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="flex flex-col items-center text-center" aria-busy="true" aria-label="Loading workspace">
        <span className="glow-brand relative flex h-12 w-12 animate-pulse items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-400 via-brand-500 to-violet-500">
          <svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden>
            <path d="M9 8v16M23 8v16M9 16h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="9" cy="8" r="1.6" fill="#EAF2FF" />
            <circle cx="23" cy="24" r="1.6" fill="#EAF2FF" />
          </svg>
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-100">Loading the Inkloom workspace</p>
        <p className="mt-1 text-xs text-slate-400">Preparing your workspace…</p>
      </div>
    </div>
  );
}

function ApiUnavailable({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/10 text-amber-300">
            <ServerOff className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-white">Inkloom is not reachable</h1>
            <p className="mt-1.5 text-sm leading-6 text-slate-300">{message}</p>
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 text-xs leading-5 text-slate-400">
              Workspace records could not be loaded. Make sure the Inkloom service is running, then retry. If the
              problem continues, contact your workspace administrator.
            </div>
            <Button className="mt-4" onClick={retry}>
              <RefreshCw className="h-4 w-4" />
              Retry connection
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function renderRoute(route: Route) {
  switch (route.key) {
    case 'onboarding':
      return null;
    case 'dashboard':
      return <DashboardPage />;
    case 'content':
      return <ContentListPage />;
    case 'new-content':
      return <NewContentPage />;
    case 'document':
      return <DocumentPage id={route.id} />;
    case 'reviews':
      return <ReviewsPage />;
    case 'campaigns':
      return <CampaignsPage />;
    case 'campaign':
      return <CampaignDetailPage id={route.id} />;
    case 'brand':
      return <BrandLibraryPage />;
    case 'policies':
      return <PoliciesPage />;
    case 'history':
      return <HistoryPage />;
    case 'insights':
      return <InsightsPage />;
    case 'research':
      return <ResearchPage />;
    case 'evaluation':
      return <EvaluationPage />;
    case 'team':
      return <TeamPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <NotFoundPage path={route.path} />;
  }
}

function AppContent() {
  const route = useHashRoute();
  const { session, loading, error, reload, can, workspaceId } = useSession();

  if (loading) return <LoadingScreen />;

  if (!session) {
    if (!error && !workspaceId) return <LoadingScreen />;
    return (
      <ApiUnavailable
        message={error || 'A demo session could not be established. The workspace may not be seeded yet.'}
        retry={reload}
      />
    );
  }

  if (route.key === 'onboarding') return <OnboardingPage />;

  const requirement = routeRequirement(route);
  const permitted = !requirement || can(requirement);

  return (
    <>
      <Shell route={route}>
        {permitted ? renderRoute(route) : <AccessDeniedPage requirement={requirement} />}
      </Shell>
      <AssistantDrawer />
    </>
  );
}

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </SessionProvider>
  );
}

export default App;
