import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Pages } from '@/pages/Pages';
import { Tenants } from '@/pages/Tenants';
import { Automations } from '@/pages/Automations';
import { EdgeResources } from '@/pages/EdgeResources';
import { Storage } from '@/pages/Storage';
import { Settings } from '@/pages/Settings';
import { Users } from '@/pages/Users';
import { DataStudio } from '@/pages/DataStudio';
import { Plans } from '@/pages/Plans';

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
                <Route path="/automations" element={<Automations />} />
                <Route path="/edge" element={<EdgeResources />} />
                <Route path="/storage" element={<Storage />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/users" element={<Users />} />
                <Route path="/data-studio" element={<DataStudio />} />
                <Route path="/plans" element={<Plans />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
}
