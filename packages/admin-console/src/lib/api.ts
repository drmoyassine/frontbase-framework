/**
 * Thin console-API client. Talks to the framework's /api/console/* over fetch
 * with the HttpOnly fb_session cookie (credentials:'include'). The framework
 * returns opaque { error: 'code' } on failure (RULE 4) — no { success, data }
 * envelope to unwrap, so we just check response.ok and surface the code.
 *
 * RULE 1: this is browser code — it NEVER imports @frontbase/edge-infra or
 * @frontbase/backend server modules. fetch is the only server touchpoint.
 */

const BASE = '/api/console';

export class ApiError extends Error {
    constructor(public status: number, public code: string) {
        super(code);
        this.name = 'ApiError';
    }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(BASE + path, {
        credentials: 'include',
        ...init,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!res.ok) {
        let code = `http_${res.status}`;
        try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) code = body.error;
        } catch { /* non-JSON error body; keep http_<status> */ }
        throw new ApiError(res.status, code);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? (JSON.parse(text) as T) : (undefined as T));
}

export interface AuthUser {
    id: string;
    email?: string;
    role?: string;
}

export interface PageSummary {
    slug: string;
    title?: string;
    version?: number;
    updatedAt?: string;
}

export interface SetupStatus {
    needsSetup: boolean;
    setupEnabled: boolean;
    setupTokenRequired: boolean;
    setupExpired: boolean;
}

export interface TenantSummary {
    slug: string;
    name?: string;
    createdAt?: string;
}

export async function getSetupStatus(): Promise<SetupStatus> {
    return api('/setup/status');
}

export async function postSetupClaim(setupToken: string): Promise<{ ok: true }> {
    return api('/setup/claim', {
        method: 'POST',
        body: JSON.stringify({ setupToken }),
    });
}

export async function postSetup(email: string, password: string, setupToken?: string): Promise<{ ok: true }> {
    return api('/setup', {
        method: 'POST',
        body: JSON.stringify({ email, password, ...(setupToken ? { setupToken } : {}) }),
    });
}

/** Authenticate through the CF-22 product-compatible surface before handing
 * control to /frontbase-admin. This avoids coupling first-run setup to the
 * retired framework dashboard's auth store. */
export async function loginProductAdmin(email: string, password: string): Promise<void> {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new ApiError(res.status, 'login_failed');
}
