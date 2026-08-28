/**
 * Auth Store - Dual-mode Authentication
 *
 * Self-host mode: Session-based auth via FastAPI cookies (existing behavior)
 * Cloud mode:     JWT-based auth with signup support
 *
 * Connects to FastAPI backend. Mode detection via edition.ts.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isCloud } from '@/lib/edition';
import { createAuthClient } from '@/lib/auth/AuthClientFactory';

// User interface — extended for cloud tenancy
export interface User {
  id: string;
  email: string;
  username?: string;
  tenant_id?: string;      // Cloud only
  tenant_slug?: string;    // Cloud only
  role?: string;           // Cloud only (owner | admin | editor | viewer | master)
  is_master?: boolean;     // Cloud only
  created_at: string;
  updated_at: string;
}

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
}

interface AuthState {
  user: User | null;
  tenant: TenantInfo | null;
  token: string | null;          // JWT token (cloud mode only)
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Master Admin Impersonation
  isImpersonating: boolean;
  _realUser: User | null;
  _realTenant: TenantInfo | null;
  setImpersonation: (plan: string, role: string) => void;
  clearImpersonation: () => void;

  // Auth actions
  login: (email: string, password: string, website?: string, turnstileToken?: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, workspaceName: string, slug: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;

  // Legacy compatibility
  cleanupAuthState: () => void;
  resetBackendConnection: () => Promise<boolean>;
  validateSession: () => boolean;
  forceReauth: () => void;
}

// API base URL - ALWAYS use relative URLs in production for proper HTTPS handling
const getApiBase = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl || envUrl === '') return '';
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'https:' || envUrl.includes(window.location.hostname)) {
      return '';
    }
  }
  return envUrl;
};

const API_BASE = getApiBase();

/**
 * Build fetch options — both modes use cookie-based sessions,
 * so credentials: 'include' is always required.
 */
function fetchOpts(_token: string | null, extra: RequestInit = {}): RequestInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra.headers as Record<string, string> || {}),
  };

  return {
    ...extra,
    headers,
    credentials: 'include',
  };
}

// Module-level dedup for checkAuth — App.tsx and ProtectedRoute.tsx both call it on mount
let _checkAuthPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      
      isImpersonating: false,
      _realUser: null,
      _realTenant: null,

      setImpersonation: (plan, role) => {
        const state = get();
        // Only Master Admins can impersonate
        if (!state.user?.is_master && !state._realUser?.is_master) return;
        
        // Save real state if not already impersonating
        const realUser = state.isImpersonating ? state._realUser : state.user;
        const realTenant = state.isImpersonating ? state._realTenant : state.tenant;
        
        if (!realUser || !realTenant) return;

        set({
          isImpersonating: true,
          _realUser: realUser,
          _realTenant: realTenant,
          user: { ...realUser, is_master: false, role: role },
          tenant: { ...realTenant, plan: plan },
        });
      },

      clearImpersonation: () => {
        const state = get();
        if (!state.isImpersonating) return;
        
        set({
          isImpersonating: false,
          user: state._realUser,
          tenant: state._realTenant,
          _realUser: null,
          _realTenant: null,
        });
      },

      login: async (email, password, website, turnstileToken) => {
        set({ isLoading: true, error: null });
        try {
          const authClient = createAuthClient({ apiBaseUrl: API_BASE });
          const result = await authClient.login({ email, password, website, turnstileToken });
          
          if (!result.success) {
            set({ isLoading: false, error: result.error || 'Login failed' });
            return { success: false, error: result.error };
          }

          set({
            user: result.user as User || null,
            tenant: result.tenant as TenantInfo || null,
            token: result.token || null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          return { success: true };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Network error';
          set({ isLoading: false, error });
          return { success: false, error };
        }
      },

      signup: async (email, password, workspaceName, slug) => {
        if (!isCloud()) {
          return { success: false, error: 'Signup is only available in cloud mode' };
        }

        set({ isLoading: true, error: null });
        try {
          const authClient = createAuthClient({ apiBaseUrl: API_BASE });
          const result = await authClient.signup({ email, password, workspaceName, slug });
          
          if (!result.success) {
            set({ isLoading: false, error: result.error || 'Signup failed' });
            return { success: false, error: result.error };
          }

          set({
            user: result.user as User || null,
            tenant: result.tenant as TenantInfo || null,
            token: result.token || null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          return { success: true };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Network error';
          set({ isLoading: false, error });
          return { success: false, error };
        }
      },

      logout: async () => {
        try {
          const authClient = createAuthClient({ apiBaseUrl: API_BASE });
          await authClient.logout();
        } catch {
          // Ignore logout errors
        }
        set({ 
          user: null, 
          tenant: null, 
          token: null, 
          isAuthenticated: false, 
          error: null,
          isImpersonating: false,
          _realUser: null,
          _realTenant: null
        });
      },

      checkAuth: async () => {
        // Dedup: if a check is already in-flight, wait for it
        if (_checkAuthPromise) {
          await _checkAuthPromise;
          return;
        }

        _checkAuthPromise = (async () => {
          set({ isLoading: true });
          try {
            const authClient = createAuthClient({ apiBaseUrl: API_BASE });
            const result = await authClient.getSession();

            if (result.isAuthenticated && result.user) {
              if (get().isImpersonating) {
                // If impersonating, background-sync the real identity without disturbing the fake UI
                set({
                  _realUser: result.user as User,
                  _realTenant: (result.tenant as TenantInfo) || get()._realTenant,
                  isAuthenticated: true,
                  isLoading: false,
                });
              } else {
                set({
                  user: result.user as User,
                  tenant: (result.tenant as TenantInfo) || get().tenant,
                  isAuthenticated: true,
                  isLoading: false,
                  token: result.token || get().token,
                });
              }
            } else {
              set({ user: null, tenant: null, token: null, isAuthenticated: false, isLoading: false });
            }
          } catch {
            set({ user: null, tenant: null, token: null, isAuthenticated: false, isLoading: false });
          } finally {
            _checkAuthPromise = null;
          }
        })();

        await _checkAuthPromise;
      },

      clearError: () => set({ error: null }),

      // Legacy compatibility methods
      cleanupAuthState: () => set({ 
        user: null, tenant: null, token: null, isAuthenticated: false, error: null,
        isImpersonating: false, _realUser: null, _realTenant: null
      }),
      resetBackendConnection: async () => {
        await get().checkAuth();
        return get().isAuthenticated;
      },
      validateSession: () => get().isAuthenticated,
      forceReauth: () => set({ 
        user: null, tenant: null, token: null, isAuthenticated: false,
        isImpersonating: false, _realUser: null, _realTenant: null
      }),
    }),
    {
      name: 'frontbase-auth',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        isImpersonating: state.isImpersonating,
        _realUser: state._realUser,
        _realTenant: state._realTenant,
      }),
    }
  )
);