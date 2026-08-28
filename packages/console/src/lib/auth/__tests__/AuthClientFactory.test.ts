/**
 * Test suite for AuthClientFactory
 *
 * Tests cover:
 * - Provider selection based on environment variables
 * - Correct client instantiation for each mode
 * - Helper functions (isSupabaseAuth, isSuperTokensAuth, etc.)
 * - Fallback behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock isCloud function
const mockIsCloud = vi.fn();
vi.mock('@/lib/edition', () => ({
  isCloud: () => mockIsCloud(),
}));

describe('AuthClientFactory', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsCloud.mockReset();

    // Clear module cache to reset env vars
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    // Reset singleton
    vi.resetModules();
  });

  describe('createAuthClient', () => {
    it('should return CookieAuthClient in self-host mode', async () => {
      mockIsCloud.mockReturnValue(false);

      const { createAuthClient } = await import('../AuthClientFactory');
      const { CookieAuthClient } = await import('../CookieAuthClient');

      const client = createAuthClient();

      expect(client).toBeInstanceOf(CookieAuthClient);
    });

    it('should return SupabaseAuthClient in cloud mode with Supabase provider', async () => {
      vi.stubEnv('VITE_AUTH_PROVIDER', 'supabase');
      mockIsCloud.mockReturnValue(true);

      const { createAuthClient } = await import('../AuthClientFactory');
      const { SupabaseAuthClient } = await import('../SupabaseAuthClient');

      const client = createAuthClient();

      expect(client).toBeInstanceOf(SupabaseAuthClient);
    });

    it('should return SuperTokensAuthClient in cloud mode with SuperTokens provider', async () => {
      vi.stubEnv('VITE_AUTH_PROVIDER', 'supertokens');
      mockIsCloud.mockReturnValue(true);

      const { createAuthClient } = await import('../AuthClientFactory');
      const { SuperTokensAuthClient } = await import('../SuperTokensAuthClient');

      const client = createAuthClient();

      expect(client).toBeInstanceOf(SuperTokensAuthClient);
    });

    it('should return SuperTokensAuthClient as default in cloud mode when provider not set', async () => {
      mockIsCloud.mockReturnValue(true);
      // Don't set AUTH_PROVIDER - should default to SuperTokens (SuperTokensAuthClient)

      const { createAuthClient } = await import('../AuthClientFactory');
      const { SuperTokensAuthClient } = await import('../SuperTokensAuthClient');

      const client = createAuthClient();

      expect(client).toBeInstanceOf(SuperTokensAuthClient);
    });

    it('should merge custom config with defaults', async () => {
      mockIsCloud.mockReturnValue(false);

      const { createAuthClient } = await import('../AuthClientFactory');
      const { CookieAuthClient } = await import('../CookieAuthClient');

      const customConfig = {
        debug: true,
        refreshInterval: 600000,
      };

      const client = createAuthClient(customConfig);

      expect(client).toBeInstanceOf(CookieAuthClient);
    });
  });

  describe('getAuthClient', () => {
    it('should return singleton instance', async () => {
      mockIsCloud.mockReturnValue(false);

      const { getAuthClient } = await import('../AuthClientFactory');

      const client1 = getAuthClient();
      const client2 = getAuthClient();

      expect(client1).toBe(client2);
    });

    it('should use config only on first call', async () => {
      mockIsCloud.mockReturnValue(false);

      const { getAuthClient } = await import('../AuthClientFactory');

      const client1 = getAuthClient({ debug: true });
      const client2 = getAuthClient({ debug: false });

      expect(client1).toBe(client2);
    });

    it('should allow reset with resetAuthClient', async () => {
      mockIsCloud.mockReturnValue(false);

      const { getAuthClient, resetAuthClient: reset } = await import('../AuthClientFactory');

      const client1 = getAuthClient();
      reset();
      const client2 = getAuthClient();

      expect(client1).not.toBe(client2);
    });
  });

  describe('getAuthMode', () => {
    it('should return jwt in cloud mode', async () => {
      mockIsCloud.mockReturnValue(true);

      const { getAuthMode } = await import('../AuthClientFactory');

      expect(getAuthMode()).toBe('jwt');
    });

    it('should return cookie in self-host mode', async () => {
      mockIsCloud.mockReturnValue(false);

      const { getAuthMode } = await import('../AuthClientFactory');

      expect(getAuthMode()).toBe('cookie');
    });
  });

  describe('isJWTAuth', () => {
    it('should return true in cloud mode', async () => {
      mockIsCloud.mockReturnValue(true);

      const { isJWTAuth } = await import('../AuthClientFactory');

      expect(isJWTAuth()).toBe(true);
    });

    it('should return false in self-host mode', async () => {
      mockIsCloud.mockReturnValue(false);

      const { isJWTAuth } = await import('../AuthClientFactory');

      expect(isJWTAuth()).toBe(false);
    });
  });

  describe('isCookieAuth', () => {
    it('should return false in cloud mode', async () => {
      mockIsCloud.mockReturnValue(true);

      const { isCookieAuth } = await import('../AuthClientFactory');

      expect(isCookieAuth()).toBe(false);
    });

    it('should return true in self-host mode', async () => {
      mockIsCloud.mockReturnValue(false);

      const { isCookieAuth } = await import('../AuthClientFactory');

      expect(isCookieAuth()).toBe(true);
    });
  });

  describe('getCurrentAuthProvider', () => {
    it('should return supabase when configured', async () => {
      vi.stubEnv('VITE_AUTH_PROVIDER', 'supabase');

      const { getCurrentAuthProvider } = await import('../AuthClientFactory');

      expect(getCurrentAuthProvider()).toBe('supabase');
    });

    it('should return supertokens when configured', async () => {
      vi.stubEnv('VITE_AUTH_PROVIDER', 'supertokens');

      const { getCurrentAuthProvider } = await import('../AuthClientFactory');

      expect(getCurrentAuthProvider()).toBe('supertokens');
    });

    it('should return undefined when not configured', async () => {
      vi.unstubAllEnvs();

      const { getCurrentAuthProvider } = await import('../AuthClientFactory');

      expect(getCurrentAuthProvider()).toBeUndefined();
    });
  });

  describe('isSupabaseAuth', () => {
    it('should return true in cloud mode with Supabase provider', async () => {
      vi.stubEnv('VITE_AUTH_PROVIDER', 'supabase');
      mockIsCloud.mockReturnValue(true);

      const { isSupabaseAuth } = await import('../AuthClientFactory');

      expect(isSupabaseAuth()).toBe(true);
    });

    it('should return false in self-host mode even with Supabase configured', async () => {
      vi.stubEnv('VITE_AUTH_PROVIDER', 'supabase');
      mockIsCloud.mockReturnValue(false);

      const { isSupabaseAuth } = await import('../AuthClientFactory');

      expect(isSupabaseAuth()).toBe(false);
    });

    it('should return false in cloud mode with SuperTokens', async () => {
      vi.stubEnv('VITE_AUTH_PROVIDER', 'supertokens');
      mockIsCloud.mockReturnValue(true);

      const { isSupabaseAuth } = await import('../AuthClientFactory');

      expect(isSupabaseAuth()).toBe(false);
    });
  });

  describe('isSuperTokensAuth', () => {
    it('should return true in cloud mode with SuperTokens provider', async () => {
      vi.stubEnv('VITE_AUTH_PROVIDER', 'supertokens');
      mockIsCloud.mockReturnValue(true);

      const { isSuperTokensAuth } = await import('../AuthClientFactory');

      expect(isSuperTokensAuth()).toBe(true);
    });

    it('should return true in cloud mode when provider not set (default)', async () => {
      mockIsCloud.mockReturnValue(true);
      vi.unstubAllEnvs();

      const { isSuperTokensAuth } = await import('../AuthClientFactory');

      expect(isSuperTokensAuth()).toBe(true);
    });

    it('should return false in self-host mode', async () => {
      mockIsCloud.mockReturnValue(false);

      const { isSuperTokensAuth } = await import('../AuthClientFactory');

      expect(isSuperTokensAuth()).toBe(false);
    });

    it('should return false in cloud mode with Supabase', async () => {
      vi.stubEnv('VITE_AUTH_PROVIDER', 'supabase');
      mockIsCloud.mockReturnValue(true);

      const { isSuperTokensAuth } = await import('../AuthClientFactory');

      expect(isSuperTokensAuth()).toBe(false);
    });
  });

  describe('authClientRegistry', () => {
    it('should allow custom client registration', async () => {
      mockIsCloud.mockReturnValue(false);

      const { authClientRegistry } = await import('../AuthClientFactory');

      // Custom client class
      class CustomAuthClient {
        constructor(config: any) {
          (this as any).config = config;
        }
      }

      authClientRegistry.register('custom', CustomAuthClient as any);

      const client = authClientRegistry.create('custom', {} as any);

      expect(client).toBeInstanceOf(CustomAuthClient);
    });

    it('should throw error for unknown custom client type', async () => {
      const { authClientRegistry } = await import('../AuthClientFactory');

      expect(() => {
        authClientRegistry.create('unknown', {} as any);
      }).toThrow('Unknown AuthClient type: unknown');
    });
  });
});
