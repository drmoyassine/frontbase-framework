/**
 * Test suite for SupabaseAuthClient
 *
 * Tests cover:
 * - Login flow with valid/invalid credentials
 * - Signup flow with tenant provisioning
 * - Token management and refresh
 * - Session validation
 * - Logout functionality
 * - Error handling and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseAuthClient } from '../SupabaseAuthClient';
import type { AuthClientConfig } from '../AuthClient.interface';
import type { AuthResult, AuthSession, LoginCredentials, SignupCredentials } from '../AuthClient.interface';

// Mock Supabase client - completely inline to avoid hoisting issues
// Using vi.hoisted to create values that can be referenced in vi.mock
const { mockSignInWithPassword, mockSignUp, mockSignOut, mockGetSession,
        mockRefreshSession, mockUpdateUser, mockOnAuthStateChange,
        mockResetPasswordForEmail, mockGetUser } = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetSession: vi.fn(),
  mockRefreshSession: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockResetPasswordForEmail: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signOut: mockSignOut,
      getSession: mockGetSession,
      refreshSession: mockRefreshSession,
      updateUser: mockUpdateUser,
      onAuthStateChange: mockOnAuthStateChange,
      resetPasswordForEmail: mockResetPasswordForEmail,
      getUser: mockGetUser,
    },
  },
}));

// Mock fetch for API calls
global.fetch = vi.fn() as any;

describe('SupabaseAuthClient', () => {
  let client: SupabaseAuthClient;
  let config: AuthClientConfig;

  beforeEach(() => {
    // Reset all mocks
    mockSignInWithPassword.mockReset();
    mockSignUp.mockReset();
    mockSignOut.mockReset();
    mockGetSession.mockReset();
    mockRefreshSession.mockReset();
    mockUpdateUser.mockReset();
    mockOnAuthStateChange.mockReset();
    mockResetPasswordForEmail.mockReset();
    mockGetUser.mockReset();

    // Setup default mock implementations
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    // Default: no session
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    (global.fetch as any).mockReset();

    // Setup test configuration
    config = {
      apiBaseUrl: '',
      mode: 'jwt',
      autoRefresh: true,
      refreshInterval: 300000,
      persistSession: true,
      storageKey: 'frontbase-auth',
      debug: false,
      enableSuperTokens: false,
    };

    client = new SupabaseAuthClient(config);
  });

  afterEach(() => {
    // Clean up
  });

  describe('initialization', () => {
    it('should create an instance with correct config', () => {
      expect(client).toBeInstanceOf(SupabaseAuthClient);
      // isInitialized is not on the interface, so we check the instance
      expect(client).toBeTruthy();
    });

    it('should have default config values', () => {
      const defaultClient = new SupabaseAuthClient({});
      expect(defaultClient).toBeInstanceOf(SupabaseAuthClient);
      expect(defaultClient).toBeTruthy();
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { username: 'testuser' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockSession = {
        access_token: 'mock-access-token',
        expires_at: 9999999999,
        user: mockUser,
      };

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      // Mock getSession for getToken()
      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      // Mock the master-admin probe (POST /api/auth/login) — a tenant user
      // gets 501 ("Supabase login is handled client-side"), so the probe is
      // non-OK and login() falls through to Supabase.
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 501,
        json: async () => ({ detail: 'Supabase login is handled client-side' }),
      });

      // Mock tenant data fetch
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-123',
            email: 'test@example.com',
            tenant_id: 'tenant-123',
            tenant_slug: 'test-tenant',
            role: 'owner',
            is_master: false,
          },
          tenant: {
            id: 'tenant-123',
            slug: 'test-tenant',
            name: 'Test Tenant',
          },
        }),
      });

      const credentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result: AuthResult = await client.login(credentials);

      expect(result.success).toBe(true);
      expect(result.user?.email).toBe('test@example.com');
      expect(result.user?.tenant_id).toBe('tenant-123');
      expect(result.token).toBe('mock-access-token');
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should return error with invalid credentials', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      const credentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'wrong-password',
      };

      const result: AuthResult = await client.login(credentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid login credentials');
    });

    it('should return error when Supabase returns no user', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      });

      const credentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result: AuthResult = await client.login(credentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid response from Supabase');
    });

    it('should handle network errors gracefully', async () => {
      mockSignInWithPassword.mockRejectedValue(
        new Error('Network error')
      );

      const credentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      await expect(client.login(credentials)).rejects.toThrow('Network error during login');
    });
  });

  describe('signup', () => {
    it('should signup and provision tenant successfully', async () => {
      const mockUser = {
        id: 'new-user-123',
        email: 'newuser@example.com',
        user_metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockSession = {
        access_token: 'new-access-token',
        expires_at: 9999999999,
        user: mockUser,
      };

      mockSignUp.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      // Mock tenant provisioning API call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'new-user-123',
            email: 'newuser@example.com',
            tenant_id: 'new-tenant-123',
            tenant_slug: 'new-tenant',
            role: 'owner',
            is_master: false,
          },
          tenant: {
            id: 'new-tenant-123',
            slug: 'new-tenant',
            name: 'New Workspace',
            project_id: 'project-123',
          },
        }),
      });

      const credentials: SignupCredentials = {
        email: 'newuser@example.com',
        password: 'password123',
        workspaceName: 'New Workspace',
        slug: 'new-tenant',
      };

      const result: AuthResult = await client.signup(credentials);

      expect(result.success).toBe(true);
      expect(result.user?.email).toBe('newuser@example.com');
      expect(result.user?.tenant_id).toBe('new-tenant-123');
      expect(result.tenant?.slug).toBe('new-tenant');
      expect(mockSignUp).toHaveBeenCalled();

      // Verify tenant provisioning was called
      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[1].method).toBe('POST');
      expect(fetchCall[0]).toContain('/api/auth/signup');
    });

    it('should return error for existing email', async () => {
      mockSignUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      });

      const credentials: SignupCredentials = {
        email: 'existing@example.com',
        password: 'password123',
        workspaceName: 'Existing Workspace',
        slug: 'existing-tenant',
      };

      const result: AuthResult = await client.signup(credentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('An account with this email already exists');
    });

    it('should rollback on tenant provisioning failure', async () => {
      const mockUser = {
        id: 'rollback-user-123',
        email: 'rollback@example.com',
        user_metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockSession = {
        access_token: 'rollback-token',
        expires_at: 9999999999,
        user: mockUser,
      };

      mockSignUp.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      // Mock tenant provisioning failure
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Tenant provisioning failed' }),
      });

      const credentials: SignupCredentials = {
        email: 'rollback@example.com',
        password: 'password123',
        workspaceName: 'Rollback Workspace',
        slug: 'rollback-tenant',
      };

      const result: AuthResult = await client.signup(credentials);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workspace creation failed');
    });

    it('should fail when signUp returns no user at all', async () => {
      mockSignUp.mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      });

      const credentials: SignupCredentials = {
        email: 'confirm@example.com',
        password: 'password123',
        workspaceName: 'Confirm Workspace',
        slug: 'confirm-tenant',
      };

      const result: AuthResult = await client.signup(credentials);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no user returned');
    });

    it('should return requiresVerification when signUp returns a user but no session (email confirmation)', async () => {
      mockSignUp.mockResolvedValue({
        data: {
          user: {
            id: 'user-confirm',
            email: 'confirm@example.com',
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
          session: null, // email confirmation enabled — no session until confirmed
        },
        error: null,
      });

      const credentials: SignupCredentials = {
        email: 'confirm@example.com',
        password: 'password123',
        workspaceName: 'Confirm Workspace',
        slug: 'confirm-tenant',
      };

      const result: AuthResult = await client.signup(credentials);

      // User created (visible in Supabase users table); workspace_name + slug
      // stashed in metadata; provisioning deferred to first login. UI shows
      // "check your email" — NOT an error.
      expect(result.success).toBe(true);
      expect(result.requiresVerification).toBe(true);
      expect(result.user?.email).toBe('confirm@example.com');
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      // Mock backend logout call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Logged out successfully' }),
      });

      await client.logout();

      expect(mockSignOut).toHaveBeenCalled();

      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[0]).toContain('/api/auth/logout');
    });

    it('should ignore Supabase logout errors', async () => {
      mockSignOut.mockRejectedValue(
        new Error('Supabase logout failed')
      );

      // Mock backend logout call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      // Should not throw
      await expect(client.logout()).resolves.not.toThrow();
    });
  });

  describe('getToken', () => {
    it('should return token from Supabase session', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'current-token',
            expires_at: 9999999999,
          },
        },
      });

      const token = await client.getToken();

      expect(token).toBe('current-token');
    });

    it('should return null when no session exists', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
      });

      const token = await client.getToken();

      expect(token).toBeNull();
    });

    it('should fallback to cached token', async () => {
      // Set a cached session
      const session: AuthSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        tenant: null,
        token: 'cached-token',
        isAuthenticated: true,
      };

      // Trigger state change to set cache
      (client as any).sessionCache = session;

      mockGetSession.mockRejectedValue(new Error('Error'));

      const token = await client.getToken();

      expect(token).toBe('cached-token');
    });
  });

  describe('getSession', () => {
    it('should return current session from Supabase', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Supabase's getSession() nests the user INSIDE session (data.session.user),
      // which is what SupabaseAuthClient.getSession() reads. The previous mock put
      // `user` as a sibling of `session`, so data.session.user was undefined and the
      // client returned an empty (unauthenticated) session.
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'session-token',
            expires_at: 9999999999,
            user: mockUser,
          },
        },
      });

      // Mock tenant data fetch
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-123',
            email: 'test@example.com',
            tenant_id: 'tenant-123',
            tenant_slug: 'test-tenant',
            role: 'owner',
            is_master: false,
          },
          tenant: {
            id: 'tenant-123',
            slug: 'test-tenant',
            name: 'Test Tenant',
          },
        }),
      });

      const session = await client.getSession();

      expect(session.isAuthenticated).toBe(true);
      expect(session.user?.email).toBe('test@example.com');
      expect(session.token).toBe('session-token');
    });

    it('should return empty session when not authenticated', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
      });

      const session = await client.getSession();

      expect(session.isAuthenticated).toBe(false);
      expect(session.user).toBeNull();
    });
  });

  describe('verifySession', () => {
    it('should return true for valid Supabase session', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'valid-token',
            expires_at: 9999999999,
            user: {
              id: 'user-123',
              email: 'test@example.com',
            },
          },
        },
      });

      // Mock backend verification
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-123',
            email: 'test@example.com',
            tenant_id: 'tenant-123',
          },
          tenant: {
            id: 'tenant-123',
            slug: 'test-tenant',
          },
        }),
      });

      const isValid = await client.verifySession();

      expect(isValid).toBe(true);
    });

    it('should return false for invalid Supabase session', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
      });

      const isValid = await client.verifySession();

      expect(isValid).toBe(false);
    });

    it('should return false when backend verification fails', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            expires_at: 9999999999,
            user: { id: 'user-123', email: 'test@example.com' },
          },
        },
      });

      // Mock backend verification failure
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const isValid = await client.verifySession();

      expect(isValid).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      mockGetSession.mockRejectedValue(
        new Error('Network error')
      );

      const isValid = await client.verifySession();

      expect(isValid).toBe(false);
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockSession = {
        access_token: 'refreshed-token',
        expires_at: 9999999999,
        user: mockUser,
      };

      mockRefreshSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      // Mock tenant data fetch
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-123',
            email: 'test@example.com',
            tenant_id: 'tenant-123',
            tenant_slug: 'test-tenant',
            role: 'owner',
            is_master: false,
          },
          tenant: {
            id: 'tenant-123',
            slug: 'test-tenant',
            name: 'Test Tenant',
          },
        }),
      });

      const result = await client.refreshToken();

      expect(result.success).toBe(true);
      expect(result.token).toBe('refreshed-token');
    });

    it('should return error on refresh failure', async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session expired' },
      });

      const result = await client.refreshToken();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session expired');
    });
  });

  describe('onAuthStateChange', () => {
    it('should subscribe to auth state changes', () => {
      const mockUnsubscribe = vi.fn();
      const mockSubscription = { unsubscribe: mockUnsubscribe };

      mockOnAuthStateChange.mockReturnValue({
        data: { subscription: mockSubscription },
      });

      const callback = vi.fn();
      const unsubscribe = client.onAuthStateChange(callback);

      expect(mockOnAuthStateChange).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call listener on state change', async () => {
      const callback = vi.fn();
      client.onAuthStateChange(callback);

      // Trigger a state change by calling notifyStateChange
      const session: AuthSession = {
        user: { id: 'user-123', email: 'test@example.com', created_at: '', updated_at: '' },
        tenant: null,
        token: 'test-token',
        isAuthenticated: true,
      };

      (client as any).notifyStateChange(session);

      expect(callback).toHaveBeenCalledWith(session);
    });
  });

  describe('password management', () => {
    it('should request password reset', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });

      const result = await client.requestPasswordReset('test@example.com');

      expect(result.success).toBe(true);
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          redirectTo: expect.stringContaining('/reset-password'),
        })
      );
    });

    it('should update password with correct current password', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
      });

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockUpdateUser.mockResolvedValue({ error: null });

      const result = await client.updatePassword('old-password', 'new-password');

      expect(result.success).toBe(true);
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: 'new-password',
      });
    });

    it('should reject password update with wrong current password', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
      });

      mockSignInWithPassword.mockResolvedValue({
        data: null,
        error: { message: 'Invalid credentials' },
      });

      const result = await client.updatePassword('wrong-password', 'new-password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Current password is incorrect');
    });
  });

  describe('profile management', () => {
    it('should update profile successfully', async () => {
      mockUpdateUser.mockResolvedValue({ error: null });

      // Set cached session
      (client as any).sessionCache = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          username: 'oldname',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        tenant: null,
        token: 'test-token',
        isAuthenticated: true,
      };

      const result = await client.updateProfile({ username: 'newname' });

      expect(result.success).toBe(true);
      expect(mockUpdateUser).toHaveBeenCalledWith({
        data: { username: 'newname' },
      });
    });
  });

  describe('tenant switching', () => {
    it('should switch tenant successfully', async () => {
      // Mock API call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tenant: {
            id: 'another-tenant-123',
            slug: 'another-tenant',
            name: 'Another Tenant',
            plan: 'pro',
            status: 'active',
          },
          user: {
            id: 'user-123',
            email: 'test@example.com',
            tenant_id: 'another-tenant-123',
            tenant_slug: 'another-tenant',
            role: 'admin',
          },
        }),
      });

      // Set cached session
      (client as any).sessionCache = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          tenant_id: 'original-tenant-123',
          tenant_slug: 'original-tenant',
          role: 'owner',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        tenant: {
          id: 'original-tenant-123',
          slug: 'original-tenant',
          name: 'Original Tenant',
          plan: 'free',
          status: 'active',
        },
        token: 'test-token',
        isAuthenticated: true,
      };

      const result = await client.switchTenant('another-tenant');

      expect(result.success).toBe(true);
      expect(result.tenant?.slug).toBe('another-tenant');
    });

    it('should handle tenant switch failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Tenant not found' }),
      });

      const result = await client.switchTenant('non-existent-tenant');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tenant not found');
    });
  });
});
