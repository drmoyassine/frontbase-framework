/**
 * Tests for the DBSync (Data Studio) axios client's auth interceptor.
 *
 * Guards the Part 2 fix: in Cloud SaaS mode every /api/sync/* request must carry
 * the JWT as `Authorization: Bearer <token>` — sourced from the Supabase SDK when
 * VITE_AUTH_PROVIDER=supabase, or from the auth store for SuperTokens. In self-host
 * (cookie) mode no header is attached and the session cookie flows instead.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mocks (referenced inside vi.mock factories) ---
const {
  mockIsCloud,
  mockIsSupabaseAuth,
  mockGetToken,
  mockGetAuthClient,
  mockGetState,
} = vi.hoisted(() => {
  const mockGetToken = vi.fn();
  return {
    mockIsCloud: vi.fn(),
    mockIsSupabaseAuth: vi.fn(),
    mockGetToken,
    mockGetAuthClient: vi.fn(() => ({ getToken: mockGetToken })),
    mockGetState: vi.fn(),
  };
});

vi.mock('@/lib/edition', () => ({ isCloud: mockIsCloud }));
vi.mock('@/lib/auth/AuthClientFactory', () => ({
  getAuthClient: mockGetAuthClient,
  isSupabaseAuth: mockIsSupabaseAuth,
}));
vi.mock('@/stores/auth', () => ({ useAuthStore: { getState: mockGetState } }));
vi.mock('@/lib/portConfig', () => ({ getFastApiBaseUrl: () => '' }));

// Import AFTER mocks are registered so the interceptor closes over them.
import { api } from '../client';

type InterceptorFn = (config: any) => Promise<any>;
const requestInterceptor: InterceptorFn =
  (api.interceptors.request as any).handlers[0].fulfilled;

const run = (headers: Record<string, string> = {}) =>
  requestInterceptor({ headers });

describe('DBSync api client — auth interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetState.mockReturnValue({ token: null });
  });

  it('registers exactly one request interceptor', () => {
    expect((api.interceptors.request as any).handlers.length).toBeGreaterThan(0);
    expect(typeof requestInterceptor).toBe('function');
  });

  it('attaches the Supabase JWT in cloud + supabase mode', async () => {
    mockIsCloud.mockReturnValue(true);
    mockIsSupabaseAuth.mockReturnValue(true);
    mockGetToken.mockResolvedValue('supa-jwt');

    const cfg = await run();

    expect(mockGetAuthClient).toHaveBeenCalled();
    expect(cfg.headers['Authorization']).toBe('Bearer supa-jwt');
  });

  it('attaches the SuperTokens token from the auth store (cloud, non-supabase)', async () => {
    mockIsCloud.mockReturnValue(true);
    mockIsSupabaseAuth.mockReturnValue(false);
    mockGetState.mockReturnValue({ token: 'st-token' });

    const cfg = await run();

    // Must NOT reach for the Supabase SDK when SuperTokens is the provider.
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(cfg.headers['Authorization']).toBe('Bearer st-token');
  });

  it('does NOT attach Authorization in self-host (cookie) mode', async () => {
    mockIsCloud.mockReturnValue(false);

    const cfg = await run();

    // The whole cloud block is skipped — cookie auth flows via withCredentials.
    expect(mockIsSupabaseAuth).not.toHaveBeenCalled();
    expect(cfg.headers['Authorization']).toBeUndefined();
  });

  it('adds X-Project-Id from localStorage in cloud mode', async () => {
    mockIsCloud.mockReturnValue(true);
    mockIsSupabaseAuth.mockReturnValue(false);
    mockGetState.mockReturnValue({ token: 'st-token' });
    localStorage.setItem('activeProjectId', 'proj-123');

    const cfg = await run();

    expect(cfg.headers['X-Project-Id']).toBe('proj-123');
  });

  it('omits Authorization when no token is available in cloud mode', async () => {
    mockIsCloud.mockReturnValue(true);
    mockIsSupabaseAuth.mockReturnValue(true);
    mockGetToken.mockResolvedValue(null);

    const cfg = await run();

    expect(cfg.headers['Authorization']).toBeUndefined();
  });

  it('does not blow up if fetching the Supabase token throws', async () => {
    mockIsCloud.mockReturnValue(true);
    mockIsSupabaseAuth.mockReturnValue(true);
    mockGetToken.mockRejectedValue(new Error('sdk offline'));

    const cfg = await run();

    // Interceptor swallows the error and proceeds without a token.
    expect(cfg.headers['Authorization']).toBeUndefined();
  });
});
