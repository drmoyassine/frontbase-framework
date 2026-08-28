/**
 * CookieAuthClient - Cookie-based Session Authentication
 *
 * Implementation for self-host mode using FastAPI session cookies.
 * Delegates to the existing Zustand auth store for compatibility.
 *
 * Characteristics:
 * - Uses HTTP-only cookies for session management
 * - Server-side session validation
 * - No JWT tokens (token is null/undefined)
 * - Compatible with existing auth store
 */

import type {
  AuthClient,
  AuthClientConfig,
  AuthResult,
  AuthSession,
  AuthUser,
  AuthTenant,
  LoginCredentials,
  SignupCredentials,
  MagicLinkRequest,
  OAuthProvider,
} from './AuthClient.interface';
import { AuthError, AuthErrorType } from './AuthClient.interface';
import { useAuthStore } from '@/stores/auth';

export class CookieAuthClient implements AuthClient {
  private config: AuthClientConfig;
  private initialized = false;
  private stateChangeListeners: Array<(session: AuthSession) => void> = [];

  constructor(config: AuthClientConfig) {
    this.config = {
      ...config,
      mode: 'cookie',
    };
    this.initialized = true;

    // Sync with global Zustand store logouts
    useAuthStore.subscribe((state, prevState) => {
      if (prevState.isAuthenticated && !state.isAuthenticated) {
        this.notifyStateChange({
          user: null,
          tenant: null,
          token: null,
          isAuthenticated: false
        });
      }
    });
  }

  // ---------------------------------------------------------
  // Core Authentication Methods
  // ---------------------------------------------------------

  async login(credentials: LoginCredentials): Promise<AuthResult> {
    // Fetch directly — MUST NOT delegate to useAuthStore.login(): the store's
    // login() itself constructs an auth client and calls client.login(), so
    // delegating from here recurses infinitely (Maximum call stack size
    // exceeded, surfaced to the user as "Network error during login").
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          website: credentials.website,
          turnstile_token: credentials.turnstileToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as any));
        const detail = typeof data.detail === 'string' ? data.detail : 'Login failed';
        return { success: false, error: detail };
      }

      const data = await response.json();

      // Sync the global Zustand store (the UI's source of truth).
      useAuthStore.setState({
        user: data.user || null,
        tenant: data.tenant || null,
        token: null,
        isAuthenticated: true,
        error: null,
      });

      const session = await this.getSession();
      this.notifyStateChange(session);
      return {
        success: true,
        user: session.user,
        tenant: session.tenant,
      };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during login',
        error
      );
    }
  }

  async signup(credentials: SignupCredentials): Promise<AuthResult> {
    try {
      const result = await useAuthStore.getState().signup(
        credentials.email,
        credentials.password,
        credentials.workspaceName,
        credentials.slug
      );

      if (result.success) {
        const session = await this.getSession();
        this.notifyStateChange(session);
        return {
          success: true,
          user: session.user,
          tenant: session.tenant,
        };
      }

      return {
        success: false,
        error: result.error || 'Signup failed',
      };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during signup',
        error
      );
    }
  }

  async logout(): Promise<void> {
    // Fetch directly — MUST NOT delegate to useAuthStore.logout(): the store's
    // logout() constructs an auth client and calls client.logout(), so
    // delegating from here recurses infinitely (same cycle as login()).
    try {
      await fetch(`${this.config.apiBaseUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Logout should never fail — clear local state regardless
    } finally {
      useAuthStore.setState({
        user: null,
        tenant: null,
        token: null,
        isAuthenticated: false,
        error: null,
        isImpersonating: false,
        _realUser: null,
        _realTenant: null,
      });
      this.notifyStateChange({
        user: null,
        tenant: null,
        token: null,
        isAuthenticated: false,
      });
    }
  }

  // ---------------------------------------------------------
  // Token Management
  // ---------------------------------------------------------

  async getToken(): Promise<string | null> {
    // Cookie mode doesn't use tokens
    return null;
  }

  async getSession(): Promise<AuthSession> {
    const state = useAuthStore.getState();
    return {
      user: state.user,
      tenant: state.tenant,
      token: null,
      isAuthenticated: state.isAuthenticated,
    };
  }

  async refreshToken(): Promise<AuthResult> {
    // Cookie sessions are server-managed - just check current auth
    const isValid = await this.verifySession();
    if (isValid) {
      const session = await this.getSession();
      return {
        success: true,
        user: session.user,
        tenant: session.tenant,
      };
    }
    return {
      success: false,
      error: 'Session expired',
    };
  }

  // ---------------------------------------------------------
  // Session Validation
  // ---------------------------------------------------------

  async verifySession(): Promise<boolean> {
    try {
      await useAuthStore.getState().checkAuth();
      return useAuthStore.getState().isAuthenticated;
    } catch {
      return false;
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      await this.verifySession();
      return useAuthStore.getState().user;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------
  // Alternative Authentication Methods
  // ---------------------------------------------------------

  async loginWithOAuth(providerId: string, redirectUrl?: string): Promise<void> {
    throw new AuthError(
      AuthErrorType.UNAUTHORIZED,
      'OAuth not supported in cookie mode'
    );
  }

  async handleOAuthCallback(code: string, state?: string): Promise<AuthResult> {
    throw new AuthError(
      AuthErrorType.UNAUTHORIZED,
      'OAuth not supported in cookie mode'
    );
  }

  async requestMagicLink(request: MagicLinkRequest): Promise<AuthResult> {
    throw new AuthError(
      AuthErrorType.UNAUTHORIZED,
      'Magic links not supported in cookie mode'
    );
  }

  async verifyMagicLink(token: string): Promise<AuthResult> {
    throw new AuthError(
      AuthErrorType.UNAUTHORIZED,
      'Magic links not supported in cookie mode'
    );
  }

  // ---------------------------------------------------------
  // Password Management
  // ---------------------------------------------------------

  async requestPasswordReset(email: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/password/reset-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'Reset request failed',
        };
      }

      return { success: true };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during password reset request',
        error
      );
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, new_password: newPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'Password reset failed',
        };
      }

      return { success: true };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during password reset',
        error
      );
    }
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/password/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'Password update failed',
        };
      }

      return { success: true };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during password update',
        error
      );
    }
  }

  // ---------------------------------------------------------
  // Account Management
  // ---------------------------------------------------------

  async updateProfile(updates: Partial<AuthUser>): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'Profile update failed',
        };
      }

      const data = await response.json();

      // Update store
      useAuthStore.getState().user = { ...useAuthStore.getState().user, ...data.user };

      return {
        success: true,
        user: data.user,
      };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during profile update',
        error
      );
    }
  }

  async deleteAccount(password: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'Account deletion failed',
        };
      }

      await this.logout();
      return { success: true };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during account deletion',
        error
      );
    }
  }

  // ---------------------------------------------------------
  // Multi-tenancy Support
  // ---------------------------------------------------------

  async switchTenant(tenantSlug: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/switch-tenant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tenant_slug: tenantSlug }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'Tenant switch failed',
        };
      }

      const data = await response.json();
      useAuthStore.getState().tenant = data.tenant;

      return {
        success: true,
        tenant: data.tenant,
      };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during tenant switch',
        error
      );
    }
  }

  async getAvailableTenants(): Promise<AuthTenant[]> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/tenants`, {
        credentials: 'include',
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.tenants || [];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------
  // State & Events
  // ---------------------------------------------------------

  onAuthStateChange(callback: (session: AuthSession) => void): () => void {
    this.stateChangeListeners.push(callback);

    // Return unsubscribe function
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(
        listener => listener !== callback
      );
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async getSupportedProviders(): Promise<OAuthProvider[]> {
    // Cookie mode typically doesn't support OAuth
    return [];
  }

  // ---------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------

  async cleanup(): Promise<void> {
    this.stateChangeListeners = [];
    await this.logout();
  }

  // ---------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------

  private notifyStateChange(session: AuthSession): void {
    this.stateChangeListeners.forEach(callback => {
      try {
        callback(session);
      } catch (error) {
        if (this.config.debug) {
          console.error('[CookieAuthClient] State change listener error:', error);
        }
      }
    });
  }
}
