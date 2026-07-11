import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Pages } from '@/pages/Pages';
import { Tenants } from '@/pages/Tenants';
import { ComingSoon } from '@/pages/ComingSoon';

function Splash() {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
}

function Protected({ children }: { children: ReactNode }) {
    const { user, loading } = useAuthStore();
    const location = useLocation();
    if (loading) return <Splash />;
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
    return <>{children}</>;
}

export function App() {
    const refresh = useAuthStore((s) => s.refresh);
    useEffect(() => { void refresh(); }, [refresh]);

    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<Protected><Layout /></Protected>}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/pages" element={<Pages />} />
                <Route path="/tenants" element={<Tenants />} />
                <Route path="/plans" element={<ComingSoon title="Plans" />} />
                <Route path="/data-studio" element={<ComingSoon title="Data Studio" />} />
                <Route path="/users" element={<ComingSoon title="App Users" />} />
                <Route path="/storage" element={<ComingSoon title="File Storage" />} />
                <Route path="/automations" element={<ComingSoon title="Automations" />} />
                <Route path="/edge" element={<ComingSoon title="Edge Resources" />} />
                <Route path="/settings" element={<ComingSoon title="Settings" />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
}
