import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { isCloud } from '@/lib/edition';

interface AdminRouteProps {
    children?: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
    const { user, _realUser, isAuthenticated, isLoading } = useAuthStore();

    // Check master admin status
    const isMaster = user?.is_master || _realUser?.is_master;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-900">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    if (!isAuthenticated || !isCloud() || !isMaster) {
        return <Navigate to="/dashboard" replace />;
    }

    return children ? <>{children}</> : <Outlet />;
};

export default AdminRoute;
