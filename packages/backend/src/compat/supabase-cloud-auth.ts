export interface SupabaseCloudIdentity {
    id: string;
    email: string;
}

export interface CloudIdentityProvider {
    signIn(email: string, password: string): Promise<SupabaseCloudIdentity | null>;
    createUser(email: string, password: string, metadata: Record<string, unknown>): Promise<SupabaseCloudIdentity>;
    deleteUser(userId: string): Promise<void>;
    requestPasswordReset(email: string): Promise<void>;
    updatePassword(accessToken: string, password: string): Promise<boolean>;
}

export interface SupabaseCloudAuthOptions {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    fetch?: typeof globalThis.fetch;
}

export class CloudIdentityError extends Error {
    constructor(public readonly code: 'identity_exists' | 'identity_unavailable') {
        super(code);
        this.name = 'CloudIdentityError';
    }
}

function identityOf(value: unknown): SupabaseCloudIdentity | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const source = record.user && typeof record.user === 'object'
        ? record.user as Record<string, unknown>
        : record;
    return typeof source.id === 'string' && typeof source.email === 'string'
        ? { id: source.id, email: source.email.toLowerCase() }
        : null;
}

/** Supabase Auth REST adapter used by Frontbase Cloud's server-side auth routes. */
export function createSupabaseCloudAuth(options: SupabaseCloudAuthOptions): CloudIdentityProvider {
    const baseUrl = options.url.replace(/\/+$/, '');
    if (!/^https:\/\/[^/]+$/.test(baseUrl)) throw new Error('invalid_supabase_auth_url');
    const request = options.fetch ?? globalThis.fetch;
    const headers = (key: string) => ({
        apikey: key,
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
    });

    return {
        async signIn(email, password) {
            const response = await request(`${baseUrl}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: headers(options.anonKey),
                body: JSON.stringify({ email, password }),
            });
            if (response.status === 400 || response.status === 401) return null;
            if (!response.ok) throw new CloudIdentityError('identity_unavailable');
            return identityOf(await response.json());
        },
        async createUser(email, password, metadata) {
            const response = await request(`${baseUrl}/auth/v1/admin/users`, {
                method: 'POST',
                headers: headers(options.serviceRoleKey),
                body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata }),
            });
            if (response.status === 400 || response.status === 409 || response.status === 422) {
                throw new CloudIdentityError('identity_exists');
            }
            if (!response.ok) throw new CloudIdentityError('identity_unavailable');
            const identity = identityOf(await response.json());
            if (!identity) throw new CloudIdentityError('identity_unavailable');
            return identity;
        },
        async deleteUser(userId) {
            const response = await request(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
                method: 'DELETE',
                headers: headers(options.serviceRoleKey),
            });
            if (!response.ok && response.status !== 404) throw new CloudIdentityError('identity_unavailable');
        },
        async requestPasswordReset(email) {
            const response = await request(`${baseUrl}/auth/v1/recover`, {
                method: 'POST',
                headers: headers(options.anonKey),
                body: JSON.stringify({ email }),
            });
            if (!response.ok && response.status >= 500) throw new CloudIdentityError('identity_unavailable');
        },
        async updatePassword(accessToken, password) {
            const response = await request(`${baseUrl}/auth/v1/user`, {
                method: 'PUT',
                headers: headers(accessToken),
                body: JSON.stringify({ password }),
            });
            return response.ok;
        },
    };
}
