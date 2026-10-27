/**
 * SupabaseAuthClient - Supabase Authentication Implementation
 *
 * Implementation for cloud mode using Supabase Auth.
 * Integrates with Supabase JS SDK for authentication operations
 * and backend API for tenant provisioning.
 *
 * Characteristics:
 * - Uses Supabase Auth for user authentication
 * - Uses Supabase JWT tokens for API authentication
 * - Tokens stored in memory/secure storage
 * - Automatic token refresh via Supabase SDK
 * - Supports multi-tenancy via backend API
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
import { supabase as supabaseClient, isSupabaseConfigured } from '@/lib/supabase';

let _verifyPromise: Promise<boolean> | null = null;

export class SupabaseAuthClient implements AuthClient {
  private config: AuthClientConfig;
  private initialized = false;
  private stateChangeListeners: Array<(session: AuthSession) => void> = [];
  private sessionCache: AuthSession | null = null;
  private authStateUnsubscribe: (() => void) | null = null;
  private isSupabaseAvailable: boolean;

  constructor(config: AuthClientConfig) {
    this.config = {
      ...config,
      mode: 'jwt',
      autoRefresh: config.autoRefresh ?? true,
      refreshInterval: config.refreshInterval ?? 300000, // 5 minutes
    };
    // Check if Supabase client is properly configured
    this.isSupabaseAvailable = this.checkSupabaseAvailable();
  }

  // ---------------------------------------------------------
  // Core Authentication Methods
  // ---------------------------------------------------------

  async login(credentials: LoginCredentials): Promise<AuthResult> {
    await this.ensureInitialized();

    // ── Master admin path (env-var, NOT a Supabase user) ────────────────
    // The backend checks the env-var master admin FIRST in /api/auth/login and
    // returns a cookie session. Supabase mode must try this before GoTrue,
    // otherwise the master admin (who has no Supabase account) can never log in.
    // A 401 here just means "not the master admin" → fall through to Supabase.
    try {
      const res = await fetch(`${this.config.apiBaseUrl}/api/auth/login`, {
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
      if (res.ok) {
        const body = await res.json();
        // A 200 from /api/auth/login in Supabase mode IS the master admin —
        // tenant users get 501 ("Supabase login is handled client-side"). The
        // backend's UserResponse doesn't set is_master on this path (it defaults
        // false), so we can't gate on body.user.is_master; mark it explicitly.
        if (body.user) {
          this.sessionCache = {
            user: { ...body.user, is_master: true, role: body.user.role || 'master' },
            tenant: body.tenant || null,
            token: null, // cookie session, no JWT
            isAuthenticated: true,
          };
          this.notifyStateChange(this.sessionCache);
          return { success: true, user: body.user, tenant: body.tenant };
        }
      }
      // Non-master or non-OK → fall through to Supabase below.
    } catch {
      // Network error on the master-admin probe is non-fatal; try Supabase.
    }

    try {
      // Authenticate with Supabase
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Login failed',
        };
      }

      if (!data.user || !data.session) {
        return {
          success: false,
          error: 'Invalid response from Supabase',
        };
      }

      // Get tenant claims from backend
      let tenantData = await this.getTenantData(data.user.id);

      // Deferred provisioning: if the user confirmed their email and is logging
      // in for the first time, they have an auth account but no tenant yet
      // (signup stashed workspace_name + slug in user_metadata). Provision now.
      if (!tenantData?.tenant_id) {
        tenantData = await this.provisionTenantFromMetadata(
          data.user,
          data.session.access_token,
        );
      }

      // Update session cache
      this.sessionCache = {
        user: {
          id: data.user.id,
          email: data.user.email || credentials.email,
          username: data.user.user_metadata?.username,
          tenant_id: tenantData?.tenant_id,
          tenant_slug: tenantData?.tenant_slug,
          role: tenantData?.role || 'owner',
          is_master: tenantData?.is_master || false,
          created_at: data.user.created_at,
          updated_at: data.user.updated_at,
        },
        tenant: tenantData?.tenant,
        token: data.session.access_token,
        expiresAt: data.session.expires_at
          ? data.session.expires_at * 1000
          : undefined,
        isAuthenticated: true,
      };

      this.notifyStateChange(this.sessionCache);

      return {
        success: true,
        user: this.sessionCache.user,
        tenant: this.sessionCache.tenant,
        token: this.sessionCache.token,
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
      // Create user in Supabase
      const { data, error } = await supabaseClient.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            workspace_name: credentials.workspaceName,
            slug: credentials.slug,
          },
        },
      });

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('User already registered')) {
          return {
            success: false,
            error: 'An account with this email already exists',
          };
        }
        return {
          success: false,
          error: error.message || 'Signup failed',
        };
      }

      if (!data.user) {
        return {
          success: false,
          error: 'Signup failed — no user returned by Supabase',
        };
      }

      // Email confirmation enabled: the auth user is created (visible in the
      // Supabase users table) but no session is returned until they confirm via
      // the email link. workspace_name + slug are already stashed in the user's
      // metadata (above), so tenant provisioning is deferred to first login
      // (see login() -> provisionTenantFromMetadata). Surface a success flag so
      // the UI can show "check your email" instead of an error.
      if (!data.session) {
        return {
          success: true,
          requiresVerification: true,
          user: {
            id: data.user.id,
            email: data.user.email || credentials.email,
            created_at: data.user.created_at,
            updated_at: data.user.updated_at,
          },
        };
      }

      // Store access token for subsequent calls
      const accessToken = data.session.access_token;
      const userId = data.user.id;

      // Provision tenant via backend API with retry logic
      let tenantData: {
        tenant_id?: string;
        tenant_slug?: string;
        role?: string;
        tenant?: AuthTenant;
      } | null = null;
      let lastError: Error | null = null;

      try {
        const response = await fetch(`${this.config.apiBaseUrl}/api/auth/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: 'include',
          body: JSON.stringify({
            user_id: userId,
            email: credentials.email,
            workspace_name: credentials.workspaceName,
            slug: credentials.slug,
            invite_code: credentials.inviteCode,
          }),
        });

        const responseData = await response.json();

        if (response.ok) {
          tenantData = {
            tenant_id: responseData.user?.tenant_id || responseData.tenant?.id,
            tenant_slug: responseData.user?.tenant_slug || responseData.tenant?.slug,
            role: responseData.user?.role || 'owner',
            tenant: responseData.tenant || undefined,
          };
        } else {
          lastError = new Error(responseData.detail || 'Tenant provisioning failed');
          console.error('[SupabaseAuthClient] Tenant provisioning failed:', responseData);
        }
      } catch (error) {
        lastError = error as Error;
        console.error('[SupabaseAuthClient] Tenant provisioning error:', error);
      }

      // If tenant provisioning failed, rollback Supabase user
      if (!tenantData && lastError) {
        console.error('[SupabaseAuthClient] Rolling back Supabase user due to tenant provisioning failure');
        try {
          // Attempt to delete the user from Supabase
          // Note: This requires admin privileges, so we might not be able to do this client-side
          // The backend should handle cleanup in this case
        } catch (deleteError) {
          console.error('[SupabaseAuthClient] Failed to rollback Supabase user:', deleteError);
        }

        return {
          success: false,
          error: `Workspace creation failed: ${lastError.message}. Please try again.`,
        };
      }

      // Update session cache
      this.sessionCache = {
        user: {
          id: userId,
          email: data.user.email || credentials.email,
          username: data.user.user_metadata?.username,
          tenant_id: tenantData?.tenant_id,
          tenant_slug: tenantData?.tenant_slug,
          role: tenantData?.role || 'owner',
          is_master: false,
          created_at: data.user.created_at,
          updated_at: data.user.updated_at,
        },
        tenant: tenantData?.tenant,
        token: accessToken,
        expiresAt: data.session.expires_at
          ? data.session.expires_at * 1000
          : undefined,
        isAuthenticated: true,
      };

      this.notifyStateChange(this.sessionCache);

      return {
        success: true,
        user: this.sessionCache.user,
        tenant: this.sessionCache.tenant,
        token: this.sessionCache.token,
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
      // Sign out from Supabase
      await supabaseClient.auth.signOut();
    } catch (error) {
      if (this.config.debug) {
        console.error('[SupabaseAuthClient] Logout error:', error);
      }
    }

    // Also call backend logout
    try {
      await fetch(`${this.config.apiBaseUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore logout errors
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

    try {
      // Get current session from Supabase
      const { data } = await supabaseClient.auth.getSession();

      if (data.session?.access_token) {
        return data.session.access_token;
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('[SupabaseAuthClient] Get token error:', error);
      }
    }

    // Fallback to cached token
    return this.sessionCache?.token || null;
  }

  async getSession(): Promise<AuthSession> {
    await this.ensureInitialized();

    // Try to get current session from Supabase
    try {
      const { data } = await supabaseClient.auth.getSession();

      if (data.session?.access_token && data.session.user) {
        const user = data.session.user;
        const tenantData = await this.getTenantData(user.id);

        const session: AuthSession = {
          user: {
            id: user.id,
            email: user.email || '',
            username: user.user_metadata?.username,
            tenant_id: tenantData?.tenant_id,
            tenant_slug: tenantData?.tenant_slug,
            role: tenantData?.role || 'owner',
            is_master: tenantData?.is_master || false,
            created_at: user.created_at,
            updated_at: user.updated_at,
          },
          tenant: tenantData?.tenant,
          token: data.session.access_token,
          expiresAt: data.session.expires_at
            ? data.session.expires_at * 1000
            : undefined,
          isAuthenticated: true,
        };

        // Update cache
        this.sessionCache = session;
        return session;
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('[SupabaseAuthClient] Get session error:', error);
      }
    }

    // No Supabase session — check for a master-admin cookie session (env-var
    // admin, set by /api/auth/login). This keeps the master admin logged in
    // across refreshes in Supabase mode.
    try {
      const meRes = await fetch(`${this.config.apiBaseUrl}/api/auth/me`, {
        credentials: 'include',
      });
      if (meRes.ok) {
        const body = await meRes.json();
        if (body.user?.is_master) {
          const session: AuthSession = {
            user: body.user,
            tenant: body.tenant || null,
            token: null,
            isAuthenticated: true,
          };
          this.sessionCache = session;
          return session;
        }
      }
    } catch {
      // Ignore — no cookie session either.
    }

    // Return cached session if available
    if (this.sessionCache) {
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

    try {
      // Supabase handles refresh automatically
      // Just verify the session is still valid
      const { data, error } = await supabaseClient.auth.refreshSession();

      if (error || !data.session) {
        this.sessionCache = null;
        return {
          success: false,
          error: error?.message || 'Token refresh failed',
        };
      }

      const tenantData = await this.getTenantData(data.user?.id);

      this.sessionCache = {
        user: data.user
          ? {
              id: data.user.id,
              email: data.user.email || '',
              username: data.user.user_metadata?.username,
              tenant_id: tenantData?.tenant_id,
              tenant_slug: tenantData?.tenant_slug,
              role: tenantData?.role || 'owner',
              is_master: tenantData?.is_master || false,
              created_at: data.user.created_at,
              updated_at: data.user.updated_at,
            }
          : null,
        tenant: tenantData?.tenant,
        token: data.session.access_token,
        expiresAt: data.session.expires_at
          ? data.session.expires_at * 1000
          : undefined,
        isAuthenticated: true,
      };

      this.notifyStateChange(this.sessionCache);

      return {
        success: true,
        token: this.sessionCache.token,
        user: this.sessionCache.user,
      };
    } catch (error) {
      throw new AuthError(
        AuthErrorType.NETWORK_ERROR,
        'Network error during token refresh',
        error
      );
    }
  }

  // ---------------------------------------------------------
  // Session Validation
  // ---------------------------------------------------------

  async verifySession(): Promise<boolean> {
    await this.ensureInitialized();

    if (_verifyPromise) {
      return _verifyPromise;
    }

    _verifyPromise = (async () => {
      try {
        const { data } = await supabaseClient.auth.getSession();

        if (!data.session) {
          // No Supabase session — check for a master-admin cookie session
          // before giving up (env-var admin has no Supabase account).
          try {
            const meRes = await fetch(`${this.config.apiBaseUrl}/api/auth/me`, {
              credentials: 'include',
            });
            if (meRes.ok) {
              const body = await meRes.json();
              if (body.user?.is_master) {
                this.sessionCache = {
                  user: body.user,
                  tenant: body.tenant || null,
                  token: null,
                  isAuthenticated: true,
                };
                return true;
              }
            }
          } catch {
            // fall through
          }
          this.sessionCache = null;
          return false;
        }

        // Verify with backend
        const response = await fetch(`${this.config.apiBaseUrl}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
          credentials: 'include',
        });

        if (response.ok) {
          const responseData = await response.json();
          this.sessionCache = {
            user: responseData.user,
            tenant: responseData.tenant || null,
            token: data.session.access_token,
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
      } catch (error) {
        if (this.config.debug) {
          console.error('[SupabaseAuthClient] Verify session error:', error);
        }
        this.sessionCache = null;
        this.notifyStateChange({
          user: null,
          tenant: null,
          token: null,
          isAuthenticated: false,
        });
        return false;
      } finally {
        _verifyPromise = null;
      }
    })();

    return _verifyPromise;
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

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: providerId as any,
      options: {
        redirectTo: redirectUrl || window.location.origin + '/admin/auth/callback',
      },
    });

    if (error) {
      throw new AuthError(
        AuthErrorType.UNKNOWN,
        `OAuth login failed: ${error.message}`,
        error
      );
    }

    // Supabase will redirect automatically
  }

  async handleOAuthCallback(code: string, state?: string): Promise<AuthResult> {
    await this.ensureInitialized();

    try {
      // Supabase handles OAuth callback automatically
      // Just get the current session
      const { data, error } = await supabaseClient.auth.getSession();

      if (error || !data.session || !data.session.user) {
        return {
          success: false,
          error: error?.message || 'OAuth callback failed',
        };
      }

      const user = data.session.user;
      const tenantData = await this.getTenantData(user.id);

      this.sessionCache = {
        user: {
          id: user.id,
          email: user.email || '',
          username: user.user_metadata?.username,
          tenant_id: tenantData?.tenant_id,
          tenant_slug: tenantData?.tenant_slug,
          role: tenantData?.role || 'owner',
          is_master: tenantData?.is_master || false,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
        tenant: tenantData?.tenant,
        token: data.session.access_token,
        expiresAt: data.session.expires_at
          ? data.session.expires_at * 1000
          : undefined,
        isAuthenticated: true,
      };

      this.notifyStateChange(this.sessionCache);

      return {
        success: true,
        user: this.sessionCache.user,
        tenant: this.sessionCache.tenant,
        token: this.sessionCache.token,
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
      const { error } = await supabaseClient.auth.signInWithOtp({
        email: request.email,
        options: {
          emailRedirectTo: request.redirectUrl,
        },
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Magic link request failed',
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
      // Supabase handles magic link verification automatically
      // Just get the current session
      const { data, error } = await supabaseClient.auth.getSession();

      if (error || !data.session || !data.session.user) {
        return {
          success: false,
          error: error?.message || 'Magic link verification failed',
        };
      }

      const user = data.session.user;
      const tenantData = await this.getTenantData(user.id);

      this.sessionCache = {
        user: {
          id: user.id,
          email: user.email || '',
          username: user.user_metadata?.username,
          tenant_id: tenantData?.tenant_id,
          tenant_slug: tenantData?.tenant_slug,
          role: tenantData?.role || 'owner',
          is_master: tenantData?.is_master || false,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
        tenant: tenantData?.tenant,
        token: data.session.access_token,
        expiresAt: data.session.expires_at
          ? data.session.expires_at * 1000
          : undefined,
        isAuthenticated: true,
      };

      this.notifyStateChange(this.sessionCache);

      return {
        success: true,
        user: this.sessionCache.user,
        tenant: this.sessionCache.tenant,
        token: this.sessionCache.token,
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
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/admin/auth/reset-password',
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Reset request failed',
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
      // Update user password with Supabase
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Password reset failed',
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
      // Verify current password first by attempting login
      const { data: userData } = await supabaseClient.auth.getUser();
      if (!userData.user?.email) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      // Try to sign in with current password to verify
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: userData.user.email,
        password: currentPassword,
      });

      if (signInError) {
        return {
          success: false,
          error: 'Current password is incorrect',
        };
      }

      // Update password
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Password update failed',
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
      const { error } = await supabaseClient.auth.updateUser({
        data: updates,
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Profile update failed',
        };
      }

      if (this.sessionCache?.user) {
        this.sessionCache.user = { ...this.sessionCache.user, ...updates };
        this.notifyStateChange(this.sessionCache);
      }

      return {
        success: true,
        user: this.sessionCache?.user,
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
      // Delete account via backend (which will also delete from Supabase)
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
      const token = await this.getToken();
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/switch-tenant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
      const token = await this.getToken();
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/tenants`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

    // Subscribe to Supabase auth state changes only if Supabase is available
    if (!this.authStateUnsubscribe && this.isSupabaseAvailable) {
      try {
        const { data } = supabaseClient.auth.onAuthStateChange(
          async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
              const tenantData = await this.getTenantData(session.user.id);
              this.sessionCache = {
                user: {
                  id: session.user.id,
                  email: session.user.email || '',
                  username: session.user.user_metadata?.username,
                  tenant_id: tenantData?.tenant_id,
                  tenant_slug: tenantData?.tenant_slug,
                  role: tenantData?.role || 'owner',
                  is_master: tenantData?.is_master || false,
                  created_at: session.user.created_at,
                  updated_at: session.user.updated_at,
                },
                tenant: tenantData?.tenant,
                token: session.access_token,
                expiresAt: session.expires_at
                  ? session.expires_at * 1000
                  : undefined,
                isAuthenticated: true,
              };
              this.notifyStateChange(this.sessionCache);
            } else if (event === 'SIGNED_OUT') {
              this.sessionCache = null;
              this.notifyStateChange({
                user: null,
                tenant: null,
                token: null,
                isAuthenticated: false,
              });
            } else if (event === 'TOKEN_REFRESHED' && session) {
              const tenantData = await this.getTenantData(session.user.id);
              this.sessionCache = {
                user: {
                  id: session.user.id,
                  email: session.user.email || '',
                  username: session.user.user_metadata?.username,
                  tenant_id: tenantData?.tenant_id,
                  tenant_slug: tenantData?.tenant_slug,
                  role: tenantData?.role || 'owner',
                  is_master: tenantData?.is_master || false,
                  created_at: session.user.created_at,
                  updated_at: session.user.updated_at,
                },
                tenant: tenantData?.tenant,
                token: session.access_token,
                expiresAt: session.expires_at
                  ? session.expires_at * 1000
                  : undefined,
                isAuthenticated: true,
              };
              this.notifyStateChange(this.sessionCache);
            }
          }
        );

        // Store unsubscribe function safely
        if (data?.subscription?.unsubscribe) {
          this.authStateUnsubscribe = () => {
            try {
              data.subscription.unsubscribe();
            } catch (error) {
              if (this.config.debug) {
                console.error('[SupabaseAuthClient] Unsubscribe error:', error);
              }
            }
          };
        }
      } catch (error) {
        if (this.config.debug) {
          console.error('[SupabaseAuthClient] Failed to subscribe to auth state changes:', error);
        }
      }
    }

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
    if (this.authStateUnsubscribe) {
      this.authStateUnsubscribe();
      this.authStateUnsubscribe = null;
    }
    this.stateChangeListeners = [];
    this.sessionCache = null;
    await this.logout();
  }

  // ---------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------

  private checkSupabaseAvailable(): boolean {
    try {
      // Check if Supabase client is available and properly configured
      return !!(
        supabaseClient &&
        supabaseClient.auth &&
        typeof supabaseClient.auth.onAuthStateChange === 'function'
      );
    } catch {
      return false;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Warn if Supabase is not available
    if (!this.isSupabaseAvailable && this.config.debug) {
      console.warn('[SupabaseAuthClient] Supabase client not properly configured. Auth operations may fail.');
    }
  }

  private ensureSupabaseAvailable(): void {
    if (!this.isSupabaseAvailable || !supabaseClient) {
      throw new AuthError(
        AuthErrorType.UNKNOWN,
        'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
      );
    }
  }

  private notifyStateChange(session: AuthSession): void {
    this.stateChangeListeners.forEach(callback => {
      try {
        callback(session);
      } catch (error) {
        if (this.config.debug) {
          console.error('[SupabaseAuthClient] State change listener error:', error);
        }
      }
    });
  }

  private async getTenantData(userId: string): Promise<{
    tenant_id?: string;
    tenant_slug?: string;
    role?: string;
    is_master?: boolean;
    tenant?: AuthTenant;
  } | null> {
    try {
      const token = await this.getToken();
      if (!token) return null;

      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) return null;

      const data = await response.json();
      return {
        tenant_id: data.user?.tenant_id,
        tenant_slug: data.user?.tenant_slug,
        role: data.user?.role,
        is_master: data.user?.is_master,
        tenant: data.tenant || undefined,
      };
    } catch (error) {
      if (this.config.debug) {
        console.error('[SupabaseAuthClient] Get tenant data error:', error);
      }
      return null;
    }
  }

  /**
   * Provision a tenant for an auth user who has no tenant yet, using the
   * workspace_name + slug stashed in their Supabase user_metadata at signup.
   * Called on first login (after email confirmation) — the backend's
   * /api/auth/signup is idempotent, so this is safe to retry.
   */
  private async provisionTenantFromMetadata(
    user: { id: string; email?: string; user_metadata?: Record<string, any> },
    accessToken: string,
  ): Promise<{ tenant_id?: string; tenant_slug?: string; role?: string; tenant?: AuthTenant } | null> {
    const meta = user.user_metadata || {};
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          user_id: user.id,
          email: user.email || '',
          workspace_name: meta.workspace_name || meta.slug || 'My Workspace',
          slug: meta.slug || (user.email ? user.email.split('@')[0] : undefined),
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({} as any));
        console.error('[SupabaseAuthClient] Deferred tenant provisioning failed:', errBody);
        return null;
      }
      const data = await response.json();
      return {
        tenant_id: data.user?.tenant_id || data.tenant?.id,
        tenant_slug: data.user?.tenant_slug || data.tenant?.slug,
        role: data.user?.role || 'owner',
        tenant: data.tenant || undefined,
      };
    } catch (error) {
      console.error('[SupabaseAuthClient] Deferred tenant provisioning error:', error);
      return null;
    }
  }
}
