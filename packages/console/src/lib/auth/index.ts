/**
 * Auth Module - Frontend Authentication Strategy Pattern
 *
 * Provides a unified authentication interface for React applications
 * supporting multiple authentication strategies:
 *
 * - Cookie-based sessions (self-host mode)
 * - JWT tokens (cloud mode)
 * - OAuth providers
 * - Passwordless magic links
 *
 * @module lib/auth
 */

// Core interface and types
export {
  AuthClient,
  AuthClientConfig,
  AuthClientFactory,
  AuthResult,
  AuthSession,
  AuthUser,
  AuthTenant,
  LoginCredentials,
  SignupCredentials,
  MagicLinkRequest,
  OAuthProvider,
  AuthError,
  AuthErrorType,
} from './AuthClient.interface';

// Implementations
export { CookieAuthClient } from './CookieAuthClient';
export { SuperTokensAuthClient } from './SuperTokensAuthClient';

// Factory and utilities
export {
  createAuthClient,
  getAuthClient,
  getAuthMode,
  isJWTAuth,
  isCookieAuth,
  resetAuthClient,
  authClientRegistry,
} from './AuthClientFactory';

// React hooks
export {
  useAuth,
  useAuthState,
  useRequiredAuth,
  useAuthClient,
} from './useAuth';

// Types for TypeScript
export type { UseAuthState, UseAuthActions, UseAuthReturn } from './useAuth';
