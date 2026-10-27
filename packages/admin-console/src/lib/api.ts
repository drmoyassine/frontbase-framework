/**
 * First-run setup client. `/api/console/setup/*` is the only framework-owned
 * console surface retained after CF-22; the product console uses `/api/*`.
 *
 * RULE 1: this is browser code — it NEVER imports @frontbase/edge-infra or
 * @frontbase/backend server modules. fetch is the only server touchpoint.
 */

const SETUP_API_BASE = '/api/console/setup';

export class ApiError extends Error {
    constructor(public status: number, public code: string) {
        super(code);
        this.name = 'ApiError';
    }
}

async function setupApi<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(SETUP_API_BASE + path, {
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

export interface SetupStatus {
    needsSetup: boolean;
    setupEnabled: boolean;
    setupTokenRequired: boolean;
    setupExpired: boolean;
}

export async function getSetupStatus(): Promise<SetupStatus> {
    return setupApi('/status');
}

export async function postSetupClaim(setupToken: string): Promise<{ ok: true }> {
    return setupApi('/claim', {
        method: 'POST',
        body: JSON.stringify({ setupToken }),
    });
}

export async function postSetup(email: string, password: string, setupToken?: string): Promise<{ ok: true }> {
    return setupApi('', {
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
