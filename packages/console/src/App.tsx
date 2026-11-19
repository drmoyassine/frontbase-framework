import { AuthenticatorRecovery,AuthenticatorSetup,authenticatorRequest } from '@/components/auth/Authenticator';
import { MyAccount } from '@/modules/dbsync/components/MyAccount';
import { MenusPanel } from '@/components/dashboard/MenusPanel';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useEffect,useRef,useState,useSyncExternalStore } from "react";
import {SessionDataGate,recoverySnapshot,subscribeRecovery} from "@/lib/sessionRecovery";
import { useDashboardStore } from "@/stores/dashboard";
import { useBuilderStore } from "@/stores/builder";
import { useShallow } from 'zustand/react/shallow';
import { useAuth } from "@/lib/auth/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlobalAgentChat } from "@/components/agent/GlobalAgentChat";
import { MasterAdminImpersonator } from "@/components/dashboard/admin/MasterAdminImpersonator";
import { ConsentBanner } from "@/components/dashboard/ConsentBanner";
import { BASE_PATH, isCloud } from "@/lib/edition";

// Unified Shell & DB-Sync Pages
import { Layout as UnifiedShell } from "./modules/dbsync/components/Layout";
import { Dashboard as Overview } from "./modules/dbsync/pages/Dashboard";
import { DataStudio } from "./modules/dbsync/pages/DataStudio";
import {SavedViews} from "./modules/dbsync/pages/SavedViews";
import { Datasources } from "./modules/dbsync/pages/Datasources";

// Frontbase Panels
import { PagesPanel } from "@/components/dashboard/PagesPanel";
import { UsersPanel } from "@/components/dashboard/UsersPanel";
import { StoragePanel } from "@/components/dashboard/StoragePanel";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { EdgeInfrastructurePanel } from "@/components/dashboard/EdgeInfrastructurePanel";

// Auth Pages
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import AcceptInvitePage from "./pages/auth/AcceptInvitePage";

// Other Pages
import BuilderPage from "./pages/BuilderPage";
import ActionsPage from "./pages/ActionsPage";
import VariablesPage from "./pages/VariablesPage";
import EmbedAuthPage from "./pages/EmbedAuthPage";
import PrivacyPage from "./pages/PrivacyPage";
import NotFound from "./pages/NotFound";
import { AdminRoute } from "./routes/adminRoutes";
import { TenantsDirectory } from "./modules/admin/pages/TenantsDirectory";
import { PlansManager } from "./modules/admin/pages/PlansManager";


// Create QueryClient with cacheTime for persistence
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - data kept in localStorage
      refetchOnWindowFocus: false, // Don't refetch when switching browser tabs
      retry: 1, // Only retry once on failure (prevents terminal flooding)
    },
  },
});

// Create localStorage persister
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'frontbase-query-cache',
  // Bump this version to invalidate stale caches after schema changes
  serialize: (data) => JSON.stringify(data),
  deserialize: (cached) => {
    try {
      const parsed = JSON.parse(cached);
      // Scrub corrupted query entries (e.g. error objects persisted as data)
      if (parsed?.clientState?.queries) {
        parsed.clientState.queries = parsed.clientState.queries.filter((q: any) => {
          // Remove pages queries where data is not an array
          if (q.queryKey?.[0] === 'pages' && q.state?.data && !Array.isArray(q.state.data)) {
            console.warn('[Cache] Scrubbed corrupted pages query from persisted cache');
            return false;
          }
          return true;
        });
      }
      return parsed;
    } catch {
      return { buster: '', timestamp: 0, clientState: { mutations: [], queries: [] } };
    }
  },
});

const AdminApp = () => {
  const { fetchConnections } = useDashboardStore();
  const { loadPagesFromDatabase, loadVariablesFromDatabase, loadProjectFromDatabase } = useBuilderStore(useShallow(s => ({ loadPagesFromDatabase: s.loadPagesFromDatabase, loadVariablesFromDatabase: s.loadVariablesFromDatabase, loadProjectFromDatabase: s.loadProjectFromDatabase })));
  const { isAuthenticated, user } = useAuth();
  const recovery=useSyncExternalStore(subscribeRecovery,recoverySnapshot,recoverySnapshot);
  const sessionDataGate=useRef(new SessionDataGate());
  const [mailAvailable,setMailAvailable] = useState(false);
  const [enrollment,setEnrollment] = useState<'loading'|'required'|'ready'|'error'>('loading');
  useEffect(() => {
    let active = true;
    if (!isAuthenticated || isCloud()) {
      setEnrollment(isCloud() ? 'ready' : 'loading');
      return;
    }
    void authenticatorRequest().then(status=>{if(active){setMailAvailable(Boolean(status.mailAvailable));setEnrollment(status.required ? 'required' : 'ready');}})
      .catch(()=>{if(active)setEnrollment('error');});
    return ()=>{active=false;};
  },[isAuthenticated]);

    // authCheck is handled automatically by useAuth(autoCheck = true) on mount

  // Initialize app data only when authenticated
  useEffect(() => {
    if (isAuthenticated && enrollment !== 'ready') return;
    const sessionAction=sessionDataGate.current.decide(isAuthenticated,recovery.status);
    if(sessionAction==='hold')return;
    if (sessionAction==='clear') {
      useDashboardStore.getState().reset();
      useBuilderStore.getState().reset();
      queryClient.clear();
      return;
    }

    const initializeApp = async () => {
      try {
        await Promise.all([
          fetchConnections(),
          loadProjectFromDatabase(),
          loadPagesFromDatabase(),
          loadVariablesFromDatabase()
        ]);
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    // Fix for React #310 - Push fetchers out of the concurrent mount phase
    const timeoutId = setTimeout(() => {
      initializeApp();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [isAuthenticated, enrollment, recovery.status, fetchConnections, loadProjectFromDatabase, loadPagesFromDatabase, loadVariablesFromDatabase]);

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister }}
      >
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter basename={BASE_PATH}>
            {/* GDPR consent banner — EU users only, dismissible (Sprint 3D) */}
            <ConsentBanner />
            {/* Global Chat Overlay (Protected via state) */}
            {isAuthenticated && enrollment === 'ready' && (
              <>
                <GlobalAgentChat />
                <MasterAdminImpersonator />
              </>
            )}
            <Routes>
              {/* Admin root redirects to dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              {!isCloud() && <Route path="/recover-with-authenticator" element={<AuthenticatorRecovery />} />}
              {isCloud() && <Route path="/signup" element={<SignupPage />} />}
              {isCloud() && <Route path="/accept-invite" element={<AcceptInvitePage />} />}
              <Route path="/embed/auth/:formId" element={<EmbedAuthPage />} />

              {/* Protected Routes - Require Authentication */}
              <Route element={<ProtectedRoute />}>
                <Route element={enrollment === 'ready' ? <Outlet /> :
                  <main className="flex min-h-screen items-center justify-center p-4">
                    {enrollment === 'required' ? <AuthenticatorSetup required mailAvailable={mailAvailable} accountEmail={user?.email} /> :
                        enrollment === 'error' ? <p role="alert">Could not check account setup. Reload to try again.</p> :
                        <p role="status">Checking account setup…</p>}
                  </main>}>
                {/* Unified App Shell */}
                <Route element={<UnifiedShell />}>
                  <Route path="/dashboard" element={<Overview />} />
                  <Route path="/pages" element={<PagesPanel />} />
                  <Route path="/menus" element={<MenusPanel />} />
                  <Route path="/automations" element={<ActionsPage />} />
                  <Route path="/automations/:id" element={<ActionsPage />} />

                  {/* Data Studio (Tabbed Interface) */}
                  <Route path="/data-studio" element={<DataStudio />}>
                    <Route index element={<Navigate to="datasources" replace />} />
                    <Route path="datasources" element={<Datasources />} />
                    <Route path="saved-views" element={<SavedViews />} />
                  </Route>

                  <Route path="/users" element={<UsersPanel />} />
                  <Route path="/storage" element={<StoragePanel />} />
                  <Route path="/edge" element={<EdgeInfrastructurePanel />} />
                  <Route path="/settings" element={<SettingsPanel />} />
                  <Route path="/my-account" element={<MyAccount />} />

                  {/* Admin Tools Gated Routes */}
                  <Route element={<AdminRoute />}>
                    <Route path="/admin/tenants" element={<TenantsDirectory />} />
                    <Route path="/admin/plans" element={<PlansManager />} />
                  </Route>
                </Route>

                {/* Standalone / Fullscreen Pages (Protected) */}
                <Route path="/builder/:pageId" element={<BuilderPage />} />
                <Route path="/variables" element={<VariablesPage />} />
                </Route>
              </Route>

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
};

const App=()=>window.location.pathname.startsWith(`${BASE_PATH}/embed/auth/`)
  ? <BrowserRouter basename={BASE_PATH}><Routes><Route path="/embed/auth/:formId" element={<EmbedAuthPage/>}/></Routes></BrowserRouter>
  : <AdminApp/>;
export default App;

