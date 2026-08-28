/**
 * AuthClient Interface - Frontend Authentication Strategy Pattern
 *
 * Defines a unified authentication contract for React applications.
 * Supports multiple authentication strategies:
 * - Cookie-based sessions (self-host mode)
 * - JWT tokens (cloud mode)
 * - OAuth providers (Google, GitHub, etc.)
 * - Passwordless magic links
 * - SuperTokens integration
 *
 * Implementation-agnostic: Each auth provider implements this interface.
 * The rest of the app (stores, hooks, components) uses only these methods.
 */

// ============================================================
// Type Definitions
// ============================================================

/**
 * User profile with tenant support (cloud mode)
 */
export interface AuthUser {
  id: string;
  email: string;
  username?: string;
  tenant_id?: string;
  tenant_slug?: string;
  role?: string;
  is_master?: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Tenant information (cloud mode only)
 */
export interface AuthTenant {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  tenant?: AuthTenant;
  token?: string;
  error?: string;
  requiresVerification?: boolean;
  redirectUrl?: string;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
  website?: string;
  turnstileToken?: string;
}

/**
 * Signup credentials
 */
export interface SignupCredentials {
  email: string;
  password: string;
  workspaceName: string;
  slug: string;
  inviteCode?: string;
}

/**
 * OAuth provider configuration
 */
export interface OAuthProvider {
  id: string;
  name: string;
  iconUrl?: string;
  scopes?: string[];
}

/**
 * Magic link request
 */
export interface MagicLinkRequest {
  email: string;
  redirectUrl?: string;
}

/**
 * Session information
 */
export interface AuthSession {
  user: AuthUser;
  tenant?: AuthTenant;
  token?: string;
  expiresAt?: number;
  isAuthenticated: boolean;
}

// ============================================================
// AuthClient Interface
// ============================================================

/**
 * AuthClient - Core authentication interface
 *
 * All authentication implementations must implement this interface.
 * Methods are async and return standardized AuthResult objects.
 */
export interface AuthClient {
  // ---------------------------------------------------------
  // Core Authentication Methods
  // ---------------------------------------------------------

  /**
   * Authenticate user with email and password
   *
   * @param credentials - Login credentials
   * @returns Promise<AuthResult> - Authentication result with user/token or error
   */
  login(credentials: LoginCredentials): Promise<AuthResult>;

  /**
   * Register a new user account
   *
   * @param credentials - Signup credentials including workspace info
   * @returns Promise<AuthResult> - Registration result
   */
  signup(credentials: SignupCredentials): Promise<AuthResult>;

  /**
   * Log out the current user and clear session
   *
   * @returns Promise<void>
   */
  logout(): Promise<void>;

  // ---------------------------------------------------------
  // Token Management
  // ---------------------------------------------------------

  /**
   * Get the current authentication token (JWT or session token)
   *
   * @returns Promise<string | null> - Current token or null
   */
  getToken(): Promise<string | null>;

  /**
   * Get the current session information
   *
   * @returns Promise<AuthSession> - Complete session data
   */
  getSession(): Promise<AuthSession>;

  /**
   * Refresh the authentication token
   *
   * @returns Promise<AuthResult> - Refresh result with new token
   */
  refreshToken(): Promise<AuthResult>;

  // ---------------------------------------------------------
  // Session Validation
  // ---------------------------------------------------------

  /**
   * Verify if the current session is valid
   *
   * @returns Promise<boolean> - True if session is valid
   */
  verifySession(): Promise<boolean>;

  /**
   * Get the current authenticated user from the server
   *
   * @returns Promise<AuthUser | null> - User data or null if not authenticated
   */
  getCurrentUser(): Promise<AuthUser | null>;

  // ---------------------------------------------------------
  // Alternative Authentication Methods
  // ---------------------------------------------------------

  /**
   * Initiate OAuth authentication flow
   *
   * @param providerId - OAuth provider identifier (google, github, etc.)
   * @param redirectUrl - Optional redirect URL after auth
   * @returns Promise<void> - Redirects to OAuth provider
   */
  loginWithOAuth(providerId: string, redirectUrl?: string): Promise<void>;

  /**
   * Handle OAuth callback
   *
   * @param code - Authorization code from OAuth provider
   * @param state - State parameter for CSRF protection
   * @returns Promise<AuthResult> - OAuth authentication result
   */
  handleOAuthCallback(code: string, state?: string): Promise<AuthResult>;

  /**
   * Request a passwordless magic link
   *
   * @param request - Magic link request with email
   * @returns Promise<AuthResult> - Request result
   */
  requestMagicLink(request: MagicLinkRequest): Promise<AuthResult>;

  /**
   * Verify magic link token
   *
   * @param token - Magic link verification token
   * @returns Promise<AuthResult> - Verification result
   */
  verifyMagicLink(token: string): Promise<AuthResult>;

  // ---------------------------------------------------------
  // Password Management
  // ---------------------------------------------------------

  /**
   * Request password reset email
   *
   * @param email - User email address
   * @returns Promise<AuthResult> - Request result
   */
  requestPasswordReset(email: string): Promise<AuthResult>;

  /**
   * Reset password with token
   *
   * @param token - Password reset token
   * @param newPassword - New password
   * @returns Promise<AuthResult> - Reset result
   */
  resetPassword(token: string, newPassword: string): Promise<AuthResult>;

  /**
   * Update user password
   *
   * @param currentPassword - Current password for verification
   * @param newPassword - New password to set
   * @returns Promise<AuthResult> - Update result
   */
  updatePassword(currentPassword: string, newPassword: string): Promise<AuthResult>;

  // ---------------------------------------------------------
  // Account Management
  // ---------------------------------------------------------

  /**
   * Update user profile
   *
   * @param updates - Profile field updates
   * @returns Promise<AuthResult> - Update result
   */
  updateProfile(updates: Partial<AuthUser>): Promise<AuthResult>;

  /**
   * Delete user account
   *
   * @param password - Password for verification
   * @returns Promise<AuthResult> - Deletion result
   */
  deleteAccount(password: string): Promise<AuthResult>;

  // ---------------------------------------------------------
  // Multi-tenancy Support (Cloud Mode)
  // ---------------------------------------------------------

  /**
   * Switch tenant context (master admin only)
   *
   * @param tenantSlug - Target tenant slug
   * @returns Promise<AuthResult> - Switch result
   */
  switchTenant(tenantSlug: string): Promise<AuthResult>;

  /**
   * Get available tenants (master admin only)
   *
   * @returns Promise<AuthTenant[]> - List of accessible tenants
   */
  getAvailableTenants(): Promise<AuthTenant[]>;

  // ---------------------------------------------------------
  // State & Events
  // ---------------------------------------------------------

  /**
   * Subscribe to authentication state changes
   *
   * @param callback - Function to call on auth state change
   * @returns Unsubscribe function
   */
  onAuthStateChange(callback: (session: AuthSession) => void): () => void;

  /**
   * Check if client is initialized
   *
   * @returns boolean - True if client is ready
   */
  isInitialized(): boolean;

  /**
   * Get supported OAuth providers
   *
   * @returns Promise<OAuthProvider[]> - List of available providers
   */
  getSupportedProviders(): Promise<OAuthProvider[]>;

  // ---------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------

  /**
   * Clean up all authentication state
   *
   * @returns Promise<void>
   */
  cleanup(): Promise<void>;
}

// ============================================================
// Configuration Types
// ============================================================

/**
 * AuthClient configuration options
 */
export interface AuthClientConfig {
  /**
   * API base URL (empty string for relative URLs)
   */
  apiBaseUrl?: string;

  /**
   * Authentication mode
   */
  mode: 'cookie' | 'jwt' | 'hybrid';

  /**
   * Enable automatic token refresh
   */
  autoRefresh?: boolean;

  /**
   * Token refresh interval (ms)
   */
  refreshInterval?: number;

  /**
   * Enable session persistence
   */
  persistSession?: boolean;

  /**
   * Storage key for session persistence
   */
  storageKey?: string;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Custom fetch implementation
   */
  fetch?: typeof fetch;

  /**
   * OAuth redirect URL
   */
  oauthRedirectUrl?: string;

  /**
   * Enable SuperTokens integration
   */
  enableSuperTokens?: boolean;
}

/**
 * Auth client factory
 */
export interface AuthClientFactory {
  create(config: AuthClientConfig): AuthClient;
  getType(): string;
}

// ============================================================
// Error Types
// ============================================================

/**
 * Authentication error types
 */
export enum AuthErrorType {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Authentication error
 */
export class AuthError extends Error {
  constructor(
    public type: AuthErrorType,
    message: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
