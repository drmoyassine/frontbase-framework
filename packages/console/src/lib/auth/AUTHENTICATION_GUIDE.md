# Frontend Authentication Strategy Pattern

## Overview

The authentication module provides a unified interface for handling authentication across different deployment modes (self-host and cloud) with multiple authentication strategies.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Components                          │
│                    (useAuth, useAuthState)                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         AuthClient Interface                     │
│              (login, signup, logout, getToken, etc.)            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│   CookieAuthClient       │      │    JWTAuthClient          │
│   (Self-host mode)       │      │    (Cloud mode)           │
│                          │      │                            │
│ - Cookie sessions        │      │ - JWT tokens              │
│ - Server-side auth       │      │ - Refresh tokens           │
│ - No token storage       │      │ - SuperTokens integration  │
└──────────────────────────┘      └──────────────────────────┘
              │                                 │
              └────────────────┬────────────────┘
                               ▼
                    ┌──────────────────┐
                    │  FastAPI Backend │
                    │  /api/auth/*     │
                    └──────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `AuthClient.interface.ts` | Core interface and type definitions |
| `CookieAuthClient.ts` | Cookie-based session implementation |
| `JWTAuthClient.ts` | JWT token implementation |
| `AuthClientFactory.ts` | Factory for creating AuthClient instances |
| `useAuth.ts` | React hooks for authentication |
| `index.ts` | Public API exports |

## Usage

### Basic Authentication Hook

```tsx
import { useAuth } from '@/lib/auth';

function LoginForm() {
  const { login, isAuthenticated, error, isLoading } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    const result = await login({ email, password });
    if (result.success) {
      // Redirect or show success
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="error">{error}</div>}
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button disabled={isLoading}>Login</button>
    </form>
  );
}
```

### Protected Routes

```tsx
import { useAuthState } from '@/lib/auth';

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthState();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" />;

  return <Outlet />;
}
```

### Direct Client Access

```tsx
import { getAuthClient } from '@/lib/auth';

async function someFunction() {
  const authClient = getAuthClient();
  const token = await authClient.getToken();
  const user = await authClient.getCurrentUser();
}
```

### Custom Auth Client

```tsx
import { authClientRegistry, type AuthClient, type AuthClientConfig } from '@/lib/auth';

class CustomAuthClient implements AuthClient {
  constructor(private config: AuthClientConfig) {}

  async login(credentials: LoginCredentials): Promise<AuthResult> {
    // Custom implementation
  }

  // ... implement other methods
}

// Register your custom implementation
authClientRegistry.register('custom', CustomAuthClient);

// Use it
const authClient = authClientRegistry.create('custom', { mode: 'jwt' });
```

## Authentication Modes

### Cookie Mode (Self-host)

- Uses HTTP-only cookies for session management
- Server-side session validation
- No JWT tokens
- Compatible with existing auth store

### JWT Mode (Cloud)

- Uses JWT access tokens (short-lived)
- Uses refresh tokens for token renewal
- Automatic token refresh via SuperTokens
- Tokens stored in memory/secure storage
- Supports multi-tenancy

## API Reference

### AuthClient Interface

| Method | Returns | Description |
|--------|---------|-------------|
| `login(credentials)` | `Promise<AuthResult>` | Authenticate with email/password |
| `signup(credentials)` | `Promise<AuthResult>` | Register new account |
| `logout()` | `Promise<void>` | Clear session and logout |
| `getToken()` | `Promise<string \| null>` | Get current auth token |
| `getSession()` | `Promise<AuthSession>` | Get complete session data |
| `refreshToken()` | `Promise<AuthResult>` | Refresh auth token |
| `verifySession()` | `Promise<boolean>` | Check if session is valid |
| `getCurrentUser()` | `Promise<AuthUser \| null>` | Get authenticated user |
| `loginWithOAuth(providerId)` | `Promise<void>` | Initiate OAuth flow |
| `requestMagicLink(request)` | `Promise<AuthResult>` | Request magic link |
| `onAuthStateChange(callback)` | `() => void` | Subscribe to auth changes |

### React Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useAuth()` | `UseAuthReturn` | Full auth state and actions |
| `useAuthState()` | `UseAuthState` | Read-only auth state |
| `useRequiredAuth()` | `AuthUser` | Authenticated user (throws if not) |
| `useAuthClient()` | `AuthClient` | Direct client access |

## Configuration

The auth client is automatically configured based on deployment mode, but you can override settings:

```tsx
import { createAuthClient } from '@/lib/auth';

const authClient = createAuthClient({
  apiBaseUrl: '',
  mode: 'jwt',
  autoRefresh: true,
  refreshInterval: 300000,
  persistSession: true,
  debug: true,
});
```

## Migration from Existing Auth Store

The new auth client is compatible with the existing Zustand auth store. To migrate:

1. Replace direct store access with the `useAuth` hook
2. Update auth calls to use the new API

```tsx
// Old
const { user, login } = useAuthStore();
await login(email, password);

// New
const { user, login } = useAuth();
await login({ email, password });
```

## Security Considerations

- Tokens are never stored in localStorage (only memory or httpOnly cookies)
- Credentials are only sent over HTTPS in production
- SuperTokens handles automatic token refresh securely
- CSRF protection via cookie same-site policies
- OAuth state parameter prevents CSRF attacks

## Testing

Mock the auth client for testing:

```tsx
import { renderHook } from '@testing-library/react';
import { useAuth } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: '1', email: 'test@example.com' },
    isAuthenticated: true,
    login: vi.fn().mockResolvedValue({ success: true }),
    // ... other methods
  }),
}));
```
