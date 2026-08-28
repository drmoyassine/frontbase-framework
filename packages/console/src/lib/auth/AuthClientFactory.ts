/**
 * AuthClientFactory - Factory for creating AuthClient instances
 *
 * Creates the appropriate AuthClient implementation based on:
 * - Deployment mode (self-host vs cloud)
 * - Configuration options
 * - Feature flags
 *
 * Usage:
 * ```ts
 * const authClient = createAuthClient();
 * await authClient.login({ email, password });
 * ```
 */

import type { AuthClient, AuthClientConfig } from './AuthClient.interface';
import { CookieAuthClient } from './CookieAuthClient';
import { SuperTokensAuthClient } from './SuperTokensAuthClient';
import { SupabaseAuthClient } from './SupabaseAuthClient';
import { isCloud } from '@/lib/edition';

/**
 * Get the authentication provider from environment variable
 * @returns 'supabase' | 'supertokens' | undefined
 */
function getAuthProvider(): 'supabase' | 'supertokens' | undefined {
  return import.meta.env.VITE_AUTH_PROVIDER as 'supabase' | 'supertokens' | undefined;
}

/**
 * Create an AuthClient instance based on deployment mode
 *
 * @param config - Optional configuration overrides
 * @returns AuthClient instance
 *
 * @example
 * ```ts
 * const authClient = createAuthClient();
 * await authClient.login({ email: 'user@example.com', password: 'secret' });
 * ```
 */
export function createAuthClient(config?: Partial<AuthClientConfig>): AuthClient {
  const defaultConfig: AuthClientConfig = {
    apiBaseUrl: '',
    mode: isCloud() ? 'jwt' : 'cookie',
    autoRefresh: true,
    refreshInterval: 300000, // 5 minutes
    persistSession: true,
    storageKey: 'frontbase-auth',
    debug: import.meta.env.DEV,
    enableSuperTokens: isCloud(),
  };

  const finalConfig = { ...defaultConfig, ...config };

  // Self-host mode uses cookie auth
  if (!isCloud()) {
    return new CookieAuthClient(finalConfig);
  }

  // Cloud mode: check auth provider
  const authProvider = getAuthProvider();

  if (authProvider === 'supabase') {
    return new SupabaseAuthClient(finalConfig);
  }

  // Default to SuperTokens (SuperTokensAuthClient) for cloud mode
  return new SuperTokensAuthClient(finalConfig);
}

/**
 * Get the current authentication mode
 *
 * @returns 'jwt' for cloud, 'cookie' for self-host
 */
export function getAuthMode(): 'jwt' | 'cookie' {
  return isCloud() ? 'jwt' : 'cookie';
}

/**
 * Check if JWT authentication is enabled
 *
 * @returns true in cloud mode, false in self-host mode
 */
export function isJWTAuth(): boolean {
  return isCloud();
}

/**
 * Check if cookie authentication is enabled
 *
 * @returns true in self-host mode, false in cloud mode
 */
export function isCookieAuth(): boolean {
  return !isCloud();
}

/**
 * Get the current authentication provider
 *
 * @returns 'supabase' | 'supertokens' | undefined
 */
export function getCurrentAuthProvider(): 'supabase' | 'supertokens' | undefined {
  return getAuthProvider();
}

/**
 * Check if Supabase authentication is enabled
 *
 * @returns true if Supabase is the auth provider
 */
export function isSupabaseAuth(): boolean {
  return isCloud() && getAuthProvider() === 'supabase';
}

/**
 * Check if SuperTokens authentication is enabled
 *
 * @returns true if SuperTokens is the auth provider (or default cloud mode)
 */
export function isSuperTokensAuth(): boolean {
  return isCloud() && (getAuthProvider() === 'supertokens' || getAuthProvider() === undefined);
}

/**
 * Singleton instance for the application
 */
let _authClientInstance: AuthClient | null = null;

/**
 * Get or create the singleton AuthClient instance
 *
 * @param config - Optional configuration (only used on first call)
 * @returns Singleton AuthClient instance
 */
export function getAuthClient(config?: Partial<AuthClientConfig>): AuthClient {
  if (!_authClientInstance) {
    _authClientInstance = createAuthClient(config);
  }
  return _authClientInstance;
}

/**
 * Reset the singleton AuthClient instance
 *
 * Useful for testing or configuration changes
 */
export function resetAuthClient(): void {
  _authClientInstance = null;
}

/**
 * AuthClient factory registry
 *
 * Allows registering custom AuthClient implementations
 */
class AuthClientRegistry {
  private implementations = new Map<string, new (config: AuthClientConfig) => AuthClient>();

  /**
   * Register a custom AuthClient implementation
   *
   * @param type - Unique type identifier
   * @param implementation - AuthClient class constructor
   */
  register(type: string, implementation: new (config: AuthClientConfig) => AuthClient): void {
    this.implementations.set(type, implementation);
  }

  /**
   * Get a registered AuthClient implementation
   *
   * @param type - Type identifier
   * @returns AuthClient class constructor or undefined
   */
  get(type: string): (new (config: AuthClientConfig) => AuthClient) | undefined {
    return this.implementations.get(type);
  }

  /**
   * Create a custom AuthClient instance
   *
   * @param type - Type identifier
   * @param config - Configuration
   * @returns AuthClient instance
   * @throws Error if type is not registered
   */
  create(type: string, config: AuthClientConfig): AuthClient {
    const Implementation = this.implementations.get(type);
    if (!Implementation) {
      throw new Error(`Unknown AuthClient type: ${type}`);
    }
    return new Implementation(config);
  }
}

export const authClientRegistry = new AuthClientRegistry();
