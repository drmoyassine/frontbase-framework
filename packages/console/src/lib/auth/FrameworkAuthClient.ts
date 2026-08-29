/**
 * FrameworkAuthClient - Cloud-mode session auth over the framework's /api/auth
 *
 * The cloud console's default AuthClient (A-25 Phase 4). The product's cloud
 * build reached for SuperTokens here; the framework's cloud worker instead
 * issues the SAME `frontbase_session` HttpOnly-cookie session self-host uses
 * (login/signup/me/logout/forgot/reset are plain fetches — verifySession's
 * fallthrough to /api/auth/me already matched), so this client is that
 * contract with no third-party SDK in the middle.
 *
 * Characteristics:
 * - Session lives in an HttpOnly cookie set by the server — `token` stays null
 * - Session restore reads /api/auth/me (user carries tenant_id/tenant_slug)
 * - Password reset rides /api/auth/forgot-password + /api/auth/reset-password
 *   (the e-mailed link lands on /admin/reset-password, whose page fetches the
 *   framework endpoint directly with the email+token it was given)
 * - Every product error `detail` passes through verbatim (slug rules, 409s,
 *   rate limits) so the signup/login forms never lie about what happened
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

export class FrameworkAuthClient implements AuthClient {
  private config: AuthClientConfig;
  private initialized = false;
  private stateChangeListeners: Array<(session: AuthSession) => void> = [];
  private sessionCache: AuthSession | null = null;

  constructor(config: AuthClientConfig) {
    this.config = {
      ...config,
      // The framework session IS a cookie session (JWT-encoded, HttpOnly) —
      // the honest label for how requests authenticate.
      mode: 'cookie',
    };
    this.initialized = true;
  }

  // ---------------------------------------------------------
  // Core Authentication Methods
  // ---------------------------------------------------------

  async login(credentials: LoginCredentials): Promise<AuthResult> {
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

      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        return {
          success: false,
          error: response.status === 401
            ? 'Invalid email or password.'
            : (data.detail as string || data.error as string || 'Login failed'),
        };
      }

      return this.adoptSession(data);
    } catch (error) {
      throw new AuthError(AuthErrorType.NETWORK_ERROR, 'Network error during login', error);
    }
  }

  async signup(credentials: SignupCredentials): Promise<AuthResult> {
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

      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        // Product validation messages (slug grammar/reserved/taken, email
        // taken, rate_limited) pass through verbatim — the form renders them.
        return { success: false, error: data.detail as string || 'Signup failed' };
      }

      return this.adoptSession(data);
    } catch (error) {
      throw new AuthError(AuthErrorType.NETWORK_ERROR, 'Network error during signup', error);
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${this.config.apiBaseUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      // Logout must always clear local state, even when the call fails.
      console.error('[FrameworkAuthClient] Logout error:', error);
    }

    this.sessionCache = null;
    this.notifyStateChange({ user: null, tenant: null, token: null, isAuthenticated: false });
  }

  // ---------------------------------------------------------
  // Token Management
  // ---------------------------------------------------------

  async getToken(): Promise<string | null> {
    // Cookie sessions: the browser holds an HttpOnly cookie it can't read.
    return null;
  }

  async getSession(): Promise<AuthSession> {
    if (this.sessionCache) return this.sessionCache;
    const valid = await this.verifySession();
    if (valid && this.sessionCache) return this.sessionCache;
    return { user: null, tenant: null, token: null, isAuthenticated: false };
  }

  async refreshToken(): Promise<AuthResult> {
    // Server-managed cookie: "refresh" is just re-validating the session.
    const valid = await this.verifySession();
    if (valid && this.sessionCache) {
      return { success: true, user: this.sessionCache.user, tenant: this.sessionCache.tenant };
    }
    return { success: false, error: 'Session expired' };
  }

  // ---------------------------------------------------------
  // Session Validation
  // ---------------------------------------------------------

  async verifySession(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/me`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        this.sessionCache = {
          user: data.user ?? null,
          tenant: data.tenant || null,
          token: null,
          isAuthenticated: true,
        };
        return true;
      }
    } catch {
      // fall through to the signed-out state below
    }
    this.sessionCache = null;
    this.notifyStateChange({ user: null, tenant: null, token: null, isAuthenticated: false });
    return false;
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const session = await this.getSession();
    return session.user;
  }

  // ---------------------------------------------------------
  // Alternative Authentication Methods (not served by the framework)
  // ---------------------------------------------------------

  async loginWithOAuth(_providerId: string, _redirectUrl?: string): Promise<void> {
    throw new AuthError(AuthErrorType.UNAUTHORIZED, 'OAuth is not available on this deployment');
  }

  async handleOAuthCallback(_code: string, _state?: string): Promise<AuthResult> {
    throw new AuthError(AuthErrorType.UNAUTHORIZED, 'OAuth is not available on this deployment');
  }

  async requestMagicLink(_request: MagicLinkRequest): Promise<AuthResult> {
    throw new AuthError(AuthErrorType.UNAUTHORIZED, 'Magic links are not available on this deployment');
  }

  async verifyMagicLink(_token: string): Promise<AuthResult> {
    throw new AuthError(AuthErrorType.UNAUTHORIZED, 'Magic links are not available on this deployment');
  }

  // ---------------------------------------------------------
  // Password Management
  // ---------------------------------------------------------

  async requestPasswordReset(email: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        return { success: false, error: data.detail as string || 'Reset request failed' };
      }
      // Non-enumerating by design: the same response for known/unknown emails.
      return { success: true };
    } catch (error) {
      throw new AuthError(AuthErrorType.NETWORK_ERROR, 'Network error during password reset request', error);
    }
  }

  async resetPassword(token: string, newPassword: string, email?: string): Promise<AuthResult> {
    if (!email) {
      // The framework's reset consumes the (email, token) pair the e-mailed
      // link carried — callers must pass the email through.
      return { success: false, error: 'Email is required to reset your password' };
    }
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, token, password: newPassword }),
      });
      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        return { success: false, error: data.detail as string || 'Password reset failed' };
      }
      return { success: true };
    } catch (error) {
      throw new AuthError(AuthErrorType.NETWORK_ERROR, 'Network error during password reset', error);
    }
  }

  async updatePassword(_currentPassword: string, _newPassword: string): Promise<AuthResult> {
    throw new AuthError(AuthErrorType.UNAUTHORIZED, 'Password change is not available on this deployment');
  }

  // ---------------------------------------------------------
  // Account Management
  // ---------------------------------------------------------

  async updateProfile(_updates: Partial<AuthUser>): Promise<AuthResult> {
    throw new AuthError(AuthErrorType.UNAUTHORIZED, 'Profile updates are not available on this deployment');
  }

  async deleteAccount(_password: string): Promise<AuthResult> {
    throw new AuthError(AuthErrorType.UNAUTHORIZED, 'Account deletion is not available on this deployment');
  }

  // ---------------------------------------------------------
  // Multi-tenancy Support
  // ---------------------------------------------------------

  async switchTenant(_tenantSlug: string): Promise<AuthResult> {
    // One workspace per account on the free tier; impersonation in the
    // console is local state and never needs a server round trip.
    return { success: false, error: 'Tenant switching is not available on this deployment' };
  }

  async getAvailableTenants(): Promise<AuthTenant[]> {
    return [];
  }

  // ---------------------------------------------------------
  // State & Events
  // ---------------------------------------------------------

  onAuthStateChange(callback: (session: AuthSession) => void): () => void {
    this.stateChangeListeners.push(callback);
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
    return [];
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

  /** Cache + broadcast a login/signup response ({user, tenant?}). */
  private adoptSession(data: Record<string, unknown>): AuthResult {
    const user = (data.user ?? null) as AuthUser | null;
    const tenant = (data.tenant || null) as AuthTenant | null;
    this.sessionCache = { user, tenant, token: null, isAuthenticated: !!user };
    this.notifyStateChange(this.sessionCache);
    return { success: true, user: user ?? undefined, tenant: tenant ?? undefined };
  }

  private notifyStateChange(session: AuthSession): void {
    this.stateChangeListeners.forEach(callback => {
      try {
        callback(session);
      } catch (error) {
        if (this.config.debug) {
          console.error('[FrameworkAuthClient] State change listener error:', error);
        }
      }
    });
  }
}
