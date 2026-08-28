/**
 * SuperTokensAuthClient - JWT Token Authentication
 *
 * Implementation for cloud mode using JWT tokens with refresh token support.
 * Integrates with SuperTokens for automatic token refresh.
 *
 * Characteristics:
 * - Uses JWT access tokens (short-lived)
 * - Uses refresh tokens for token renewal
 * - Tokens stored in memory/secure storage
 * - Automatic token refresh via SuperTokens
 * - Supports multi-tenancy
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
import { initSuperTokens } from '@/lib/supertokens';
import Session from 'supertokens-web-js/recipe/session';

export class SuperTokensAuthClient implements AuthClient {
  private config: AuthClientConfig;
  private initialized = false;
  private stateChangeListeners: Array<(session: AuthSession) => void> = [];
  private sessionCache: AuthSession | null = null;

  constructor(config: AuthClientConfig) {
    this.config = {
      ...config,
      mode: 'jwt',
      autoRefresh: config.autoRefresh ?? true,
      refreshInterval: config.refreshInterval ?? 300000, // 5 minutes
    };
  }

  // ---------------------------------------------------------
  // Core Authentication Methods
  // ---------------------------------------------------------

  async login(credentials: LoginCredentials): Promise<AuthResult> {
    await this.ensureInitialized();

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
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'Login failed',
        };
      }

      const data = await response.json();

      // Update session cache
      this.sessionCache = {
        user: data.user,
        tenant: data.tenant || null,
        token: data.token || null,
        isAuthenticated: true,
      };

      this.notifyStateChange(this.sessionCache);

      return {
        success: true,
        user: data.user,
        tenant: data.tenant,
        token: data.token,
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
    await this.ensureInitialized();

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          workspace_name: credentials.workspaceName,
          slug: credentials.slug,
          invite_code: credentials.inviteCode,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'Signup failed',
        };
      }

      const data = await response.json();

      // Update session cache
      this.sessionCache = {
        user: data.user,
        tenant: data.tenant || null,
        token: data.token || null,
        isAuthenticated: true,
      };

      this.notifyStateChange(this.sessionCache);

      return {
        success: true,
        user: data.user,
        tenant: data.tenant,
        token: data.token,
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
    await this.ensureInitialized();

    try {
      // Let SuperTokens handle logout
      if (this.config.enableSuperTokens) {
        await Session.signOut();
      }

      // Also call backend logout
      await fetch(`${this.config.apiBaseUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('[SuperTokensAuthClient] Logout error:', error);
      // Ignore logout errors to ensure local state is still cleared
    }

    this.sessionCache = null;
    this.notifyStateChange({
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
    });
  }

  // ---------------------------------------------------------
  // Token Management
  // ---------------------------------------------------------

  async getToken(): Promise<string | null> {
    await this.ensureInitialized();

    if (this.config.enableSuperTokens) {
      try {
        // SuperTokens will handle access token retrieval
        const accessToken = await Session.getAccessToken();
        if (accessToken) {
          return accessToken;
        }
      } catch {
        // Session might be expired
      }
    }

    // Fallback to cached token
    return this.sessionCache?.token || null;
  }

  async getSession(): Promise<AuthSession> {
    await this.ensureInitialized();

    // Return cached session if available
    if (this.sessionCache) {
      return this.sessionCache;
    }

    // Fetch session from server
    const isValid = await this.verifySession();
    if (isValid && this.sessionCache) {
      return this.sessionCache;
    }

    return {
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
    };
  }

  async refreshToken(): Promise<AuthResult> {
    await this.ensureInitialized();

    if (this.config.enableSuperTokens) {
      try {
        // SuperTokens handles refresh automatically
        // Just verify the session is still valid
        const isValid = await Session.doesSessionExist({
          overrideGlobalClaimValidators: () => undefined,
        });

        if (isValid) {
          const token = await this.getToken();
          return {
            success: true,
            token: token || undefined,
          };
        }
      } catch {
        // Refresh failed
      }
    }

    return {
      success: false,
      error: 'Token refresh failed',
    };
  }

  // ---------------------------------------------------------
  // Session Validation
  // ---------------------------------------------------------

  async verifySession(): Promise<boolean> {
    await this.ensureInitialized();

    try {
      if (this.config.enableSuperTokens) {
        // We do NOT return false immediately if there is no SuperTokens session.
        // A master admin logging into cloud mode will not have a SuperTokens session,
        // but will have a master admin cookie. We must fall through and check
        // the backend /api/auth/me to verify if ANY valid session exists.
        await Session.doesSessionExist({
          overrideGlobalClaimValidators: () => undefined,
        });
      }

      // Verify with backend
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/me`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        this.sessionCache = {
          user: data.user,
          tenant: data.tenant || null,
          token: data.token || null,
          isAuthenticated: true,
        };
        return true;
      }

      this.sessionCache = null;
      this.notifyStateChange({
        user: null,
        tenant: null,
        token: null,
        isAuthenticated: false,
      });
      return false;
    } catch {
      this.sessionCache = null;
      this.notifyStateChange({
        user: null,
        tenant: null,
        token: null,
        isAuthenticated: false,
      });
      return false;
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const session = await this.getSession();
    return session.user;
  }

  // ---------------------------------------------------------
  // Alternative Authentication Methods
  // ---------------------------------------------------------

  async loginWithOAuth(providerId: string, redirectUrl?: string): Promise<void> {
    await this.ensureInitialized();

    const params = new URLSearchParams({
      provider: providerId,
      redirect_url: redirectUrl || window.location.origin + '/admin/auth/callback',
    });

    window.location.href = `${this.config.apiBaseUrl}/api/auth/oauth?${params.toString()}`;
  }

  async handleOAuthCallback(code: string, state?: string): Promise<AuthResult> {
    await this.ensureInitialized();

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/oauth/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, state }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'OAuth callback failed',
        };
      }

      const data = await response.json();

      this.sessionCache = {
        user: data.user,
        tenant: data.tenant || null,
        token: data.token || null,
        isAuthenticated: true,
      };

      this.notifyStateChange(this.sessionCache);

      return {
        success: true,
        user: data.user,
        tenant: data.tenant,
        token: data.token,
      };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during OAuth callback',
        error
      );
    }
  }

  async requestMagicLink(request: MagicLinkRequest): Promise<AuthResult> {
    await this.ensureInitialized();

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/magic-link/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: request.email,
          redirect_url: request.redirectUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'Magic link request failed',
        };
      }

      return { success: true };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during magic link request',
        error
      );
    }
  }

  async verifyMagicLink(token: string): Promise<AuthResult> {
    await this.ensureInitialized();

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/magic-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.detail || 'Magic link verification failed',
        };
      }

      const data = await response.json();

      this.sessionCache = {
        user: data.user,
        tenant: data.tenant || null,
        token: data.token || null,
        isAuthenticated: true,
      };

      this.notifyStateChange(this.sessionCache);

      return {
        success: true,
        user: data.user,
        tenant: data.tenant,
        token: data.token,
      };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during magic link verification',
        error
      );
    }
  }

  // ---------------------------------------------------------
  // Password Management
  // ---------------------------------------------------------

  async requestPasswordReset(email: string): Promise<AuthResult> {
    await this.ensureInitialized();

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
    await this.ensureInitialized();

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
    await this.ensureInitialized();

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
    await this.ensureInitialized();

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

      if (this.sessionCache?.user) {
        this.sessionCache.user = { ...this.sessionCache.user, ...data.user };
        this.notifyStateChange(this.sessionCache);
      }

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
    await this.ensureInitialized();

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
    await this.ensureInitialized();

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

      if (this.sessionCache) {
        this.sessionCache.tenant = data.tenant;
        this.sessionCache.user = data.user || this.sessionCache.user;
        this.notifyStateChange(this.sessionCache);
      }

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
    await this.ensureInitialized();

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
    await this.ensureInitialized();

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/oauth/providers`, {
        credentials: 'include',
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.providers || [];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------

  async cleanup(): Promise<void> {
    this.stateChangeListeners = [];
    this.sessionCache = null;
    await this.logout();
  }

  // ---------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    if (this.config.enableSuperTokens) {
      initSuperTokens();
    }

    this.initialized = true;
  }

  private notifyStateChange(session: AuthSession): void {
    this.stateChangeListeners.forEach(callback => {
      try {
        callback(session);
      } catch (error) {
        if (this.config.debug) {
          console.error('[SuperTokensAuthClient] State change listener error:', error);
        }
      }
    });
  }
}
