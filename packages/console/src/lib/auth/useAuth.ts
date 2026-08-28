/**
 * useAuth - React Hook for Authentication
 *
 * Provides a clean React hook interface for authentication operations.
 * Wraps the AuthClient and integrates with React lifecycle.
 *
 * Usage:
 * ```tsx
 * const { user, login, logout, isAuthenticated } = useAuth();
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  AuthSession,
  AuthUser,
  AuthTenant,
  LoginCredentials,
  SignupCredentials,
  AuthResult,
} from './AuthClient.interface';
import { getAuthClient, getAuthMode } from './AuthClientFactory';

/**
 * Authentication state for React components
 */
export interface UseAuthState {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  authMode: 'jwt' | 'cookie';
}

/**
 * Authentication actions for React components
 */
export interface UseAuthActions {
  login: (credentials: LoginCredentials) => Promise<AuthResult>;
  signup: (credentials: SignupCredentials) => Promise<AuthResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthResult>;
  checkAuth: () => Promise<boolean>;
  clearError: () => void;
}

/**
 * Combined authentication hook return type
 */
export type UseAuthReturn = UseAuthState & UseAuthActions;

/**
 * React hook for authentication
 *
 * Provides authentication state and actions in a single hook.
 * Automatically checks authentication status on mount and
 * subscribes to auth state changes.
 *
 * @param autoCheck - Whether to automatically check auth on mount (default: true)
 * @returns Authentication state and actions
 *
 * @example
 * ```tsx
 * function LoginForm() {
 *   const { login, isAuthenticated, error, isLoading } = useAuth();
 *
 *   if (isAuthenticated) {
 *     return <Redirect to="/dashboard" />;
 *   }
 *
 *   return (
 *     <form onSubmit={(e) => {
 *       e.preventDefault();
 *       login({ email: 'user@example.com', password: 'secret' });
 *     }}>
 *       {error && <div className="error">{error}</div>}
 *       <input name="email" type="email" />
 *       <input name="password" type="password" />
 *       <button disabled={isLoading}>Login</button>
 *     </form>
 *   );
 * }
 * ```
 */
export function useAuth(autoCheck = true): UseAuthReturn {
  const authClient = useMemo(() => getAuthClient(), []);

  const [session, setSession] = useState<AuthSession>({
    user: null,
    tenant: null,
    token: null,
    isAuthenticated: false,
  });

  const [isLoading, setIsLoading] = useState(autoCheck);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to auth state changes
  useEffect(() => {
    // Reset session synchronously on client change to prevent state leaks (Bug 11)
    setSession({
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
    });

    const unsubscribe = authClient.onAuthStateChange((newSession) => {
      setSession(newSession);
    });

    return unsubscribe;
  }, [authClient]);

  const checkAuth = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const isValid = await authClient.verifySession();
      const currentSession = await authClient.getSession();

      setSession(currentSession);
      setIsLoading(false);

      return isValid;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication check failed';
      setError(errorMessage);
      setIsLoading(false);
      return false;
    }
  }, [authClient]);

  // Check authentication on mount
  useEffect(() => {
    if (autoCheck) {
      checkAuth();
    }
  }, [autoCheck, checkAuth]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.login(credentials);

      if (!result.success) {
        setError(result.error || 'Login failed');
      }

      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      setIsLoading(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [authClient]);

  const signup = useCallback(async (credentials: SignupCredentials): Promise<AuthResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.signup(credentials);

      if (!result.success) {
        setError(result.error || 'Signup failed');
      }

      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Signup failed';
      setError(errorMessage);
      setIsLoading(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [authClient]);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await authClient.logout();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Logout failed';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [authClient]);

  const refresh = useCallback(async (): Promise<AuthResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.refreshToken();

      if (!result.success) {
        setError(result.error || 'Token refresh failed');
      }

      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Token refresh failed';
      setError(errorMessage);
      setIsLoading(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [authClient]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    user: session.user,
    tenant: session.tenant,
    isAuthenticated: session.isAuthenticated,
    isLoading,
    error,
    authMode: getAuthMode(),
    login,
    signup,
    logout,
    refresh,
    checkAuth,
    clearError,
  };
}

/**
 * Lightweight hook that only checks authentication status
 *
 * Does not provide login/logout actions - use useAuth for full functionality.
 *
 * @returns Authentication state (read-only)
 *
 * @example
 * ```tsx
 * function ProtectedRoute() {
 *   const { isAuthenticated, isLoading } = useAuthState();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (!isAuthenticated) return <Redirect to="/login" />;
 *   return <Outlet />;
 * }
 * ```
 */
export function useAuthState(): Omit<UseAuthReturn, 'login' | 'signup' | 'logout' | 'refresh' | 'checkAuth' | 'clearError'> {
  const authClient = useMemo(() => getAuthClient(), []);

  const [session, setSession] = useState<AuthSession>({
    user: null,
    tenant: null,
    token: null,
    isAuthenticated: false,
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Reset session synchronously on client change to prevent state leaks (Bug 11)
    setSession({
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
    });

    const unsubscribe = authClient.onAuthStateChange((newSession) => {
      setSession(newSession);
    });

    return unsubscribe;
  }, [authClient]);

  useEffect(() => {
    let cancelled = false;

    const verifyAndGetSession = async () => {
      await authClient.verifySession();
      if (cancelled) return;

      const currentSession = await authClient.getSession();
      if (cancelled) return;

      setSession(currentSession);
      setIsLoading(false);
    };

    verifyAndGetSession();

    return () => {
      cancelled = true;
    };
  }, [authClient]);

  return {
    user: session.user,
    tenant: session.tenant,
    isAuthenticated: session.isAuthenticated,
    isLoading,
    error: null,
    authMode: getAuthMode(),
  };
}

/**
 * Hook for accessing authenticated user
 *
 * Throws an error if user is not authenticated.
 *
 * @returns Authenticated user
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const user = useRequiredAuth();
 *   return <div>Welcome, {user.email}</div>;
 * }
 * ```
 */
export function useRequiredAuth(): AuthUser {
  const { user, isAuthenticated } = useAuthState();

  if (!isAuthenticated || !user) {
    throw new Error('useRequiredAuth must be used within an authenticated context');
  }

  return user;
}

/**
 * Hook for accessing authentication client directly
 *
 * Use this when you need direct access to the AuthClient
 * beyond what useAuth provides.
 *
 * @returns AuthClient instance
 */
export function useAuthClient() {
  return useMemo(() => getAuthClient(), []);
}
