/**
 * First-run setup client. `/api/console/setup/*` is the only framework-owned
 * console surface retained after CF-22; the product console uses `/api/*`.
 *
 * RULE 1: this is browser code — it NEVER imports @frontbase/edge-infra or
 * @frontbase/backend server modules. fetch is the only server touchpoint.
 */

const SETUP_API_BASE = '/api/console/setup';

const SETUP_ERRORS: Record<string, string> = {
    invalid_setup_token: 'This setup session is invalid or has expired. Your entries are preserved. Ask the deployment owner to renew the secure setup link for this installation, then try again.',
    setup_link_expired: 'The secure setup link has expired. Your entries are preserved. Ask the deployment owner to renew it for this installation.',
    setup_disabled: 'Browser setup is disabled for this installation. Ask the deployment owner to enable secure administrator setup.',
    already_initialized: 'An administrator already exists. Open /frontbase-admin/login and sign in instead of creating another account.',
    validation_failed: 'The administrator details were not accepted. Check your email and password, then try again.',
    db_connection_failed: 'Frontbase could not connect to its state database. Ask the deployment owner to check the database binding and availability, then retry.',
    invalid_credentials: 'The email or password was not accepted. Check your credentials and try again.',
    network_error: 'Frontbase could not be reached. Check your connection and retry. If you submitted administrator details, check the sign-in page first; the request may have completed.',
    invalid_response: 'Frontbase returned an unexpected response. Refresh to check setup status. If this continues, ask the deployment owner to inspect the server logs.',
};

export function setupErrorMessage(status: number, code: string): string {
    if (Object.hasOwn(SETUP_ERRORS, code)) return SETUP_ERRORS[code]!;
    if (status === 401 || status === 403) return 'Setup authorization was refused. Your entries are preserved. Reopen a valid secure setup link for this installation, or ask the deployment owner to renew it.';
    if (status === 404) return 'The setup service was not found. Check that you opened the correct deployment address; the deployment owner may need to repair or update it.';
    if (status === 409 || status === 410) return 'Setup is no longer available or changed in another session. Refresh to check its current state, or sign in at /frontbase-admin/login.';
    if (status === 429) return 'Too many setup requests. Wait a moment before retrying.';
    if (status >= 500) return 'The server could not complete this request. Your entries are preserved. Retry shortly; if it persists, ask the deployment owner to check the application and database logs.';
    return 'The setup request was not accepted. Check your entries and retry. If it persists, ask the deployment owner to inspect the server logs.';
}

async function request(url: string, init: RequestInit): Promise<Response> {
    try { return await fetch(url, init); }
    catch { throw new ApiError(0, 'network_error'); }
}

export class ApiError extends Error {
    constructor(public status: number, public code: string) {
        super(setupErrorMessage(status, code));
        this.name = 'ApiError';
    }
}

async function setupApi<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await request(SETUP_API_BASE + path, {
        credentials: 'include',
        ...init,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!res.ok) {
        let code = `http_${res.status}`;
        try {
            const body = (await res.json()) as { error?: unknown; detail?: unknown };
            const candidate = body?.error ?? body?.detail;
            // Only recognized public codes become messages; never echo arbitrary provider details.
            if (typeof candidate === 'string' && Object.hasOwn(SETUP_ERRORS, candidate)) code = candidate;
            else if (Array.isArray(body?.detail)) code = 'validation_failed';
        } catch { /* non-JSON error body; keep http_<status> */ }
        throw new ApiError(res.status, code);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    try { return (text ? (JSON.parse(text) as T) : (undefined as T)); }
    catch { throw new ApiError(res.status, 'invalid_response'); }
}

export interface SetupStatus {
    needsSetup: boolean;
    setupEnabled: boolean;
    setupTokenRequired: boolean;
    setupExpired: boolean;
    setupAuthorized?: boolean;
}

export async function getSetupStatus(): Promise<SetupStatus> {
    return setupApi('/status', { cache: 'no-store' });
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
    const res = await request('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new ApiError(res.status, 'login_failed');
}

