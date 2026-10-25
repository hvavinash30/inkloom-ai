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
import { WelcomePage } from './pages/WelcomePage';
import { OnboardingPage } from './pages/OnboardingPage';
import { AccessDeniedPage, NotFoundPage } from './pages/Errors';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F8FB] px-6">
      <div className="flex flex-col items-center text-center" aria-busy="true" aria-label="Loading workspace">
        <span className="flex h-11 w-11 animate-pulse items-center justify-center rounded-xl bg-[#0B1B33] shadow-elevated">
          <svg viewBox="0 0 32 32" width="24" height="24" fill="none" aria-hidden>
            <path d="M9 8v16M23 8v16M9 16h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="9" cy="8" r="1.6" fill="#BFDBFE" />
            <circle cx="23" cy="24" r="1.6" fill="#BFDBFE" />
          </svg>
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-800">Loading the Inkloom workspace</p>
        <p className="mt-1 text-xs text-slate-400">Checking the session and server capabilities…</p>
      </div>
    </div>
  );
}

function ApiUnavailable({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F8FB] px-4 py-10">
      <Card className="w-full max-w-lg p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <ServerOff className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-950">The Inkloom API is not reachable</h1>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">{message}</p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
              This interface reads workspace records from the FastAPI server. Start the backend on port 8000, then
              retry. The frontend is configured with <code className="font-mono text-slate-700">VITE_API_BASE_URL</code>{' '}
              and a development proxy.
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
    case 'welcome':
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
    if (!error && !workspaceId) {
      return <LoadingScreen />;
    }
    return (
      <ApiUnavailable
        message={error || 'A demo session could not be established. The workspace may not be seeded yet.'}
        retry={reload}
      />
    );
  }

  if (route.key === 'welcome') return <WelcomePage />;
  if (route.key === 'onboarding') return <OnboardingPage />;
  if (!workspaceId) return <WelcomePage />;

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
