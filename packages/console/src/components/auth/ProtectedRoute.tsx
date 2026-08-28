/**
 * ProtectedRoute - Auth Guard Component
 *
 * Wraps routes that require authentication.
 * Redirects to login page if not authenticated.
 *
 * Uses the auth abstraction layer which supports:
 * - Cookie-based auth (self-host mode)
 * - JWT-based auth via SuperTokens/Supabase (cloud mode)
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/useAuth';
import { useEffect } from 'react';

interface ProtectedRouteProps {
    children?: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    // authCheck is handled automatically by useAuth(autoCheck = true) on mount

    // Show loading state while checking auth, but only if we don't know the state yet!
    // This prevents React Error #310 caused by unmounting <Outlet /> during transitions.
    if (isLoading && !isAuthenticated) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Render children or outlet
    return children ? <>{children}</> : <Outlet />;
}

export default ProtectedRoute;
