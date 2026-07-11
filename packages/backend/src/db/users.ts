/**
 * UserStore (M-ID.1.3) — tenant-scoped user CRUD. A-17: every query filters by
 * `tenant_slug`. RULE 3: rows returned are copies. D8: `password_hash` is returned
 * ONLY from `findByEmailForVerify` (login path); the public `findByEmail` strips it.
 */
import type { DbRunner } from '@frontbase/edge-infra';

/** Web Crypto UUID (global crypto.randomUUID — Node 20+ and CF Workers). */
function randomUUID(): string { return crypto.randomUUID(); }

export interface UserRecord {
    id: string;
    email: string;
    passwordHash: string;
    role: string;
    tenantSlug: string;
    createdAt: string;
}

/** Public user shape (no password_hash — D8). */
export interface PublicUser { id: string; email: string; role: string; tenantSlug: string }

export class UserStore {
    constructor(private runner: DbRunner, private tenant: string) {}

    async createUser(input: { email: string; passwordHash: string; role: string; now: string; id?: string; tenantSlug?: string }): Promise<PublicUser> {
        const tenantSlug = input.tenantSlug ?? this.tenant;
        const id = input.id ?? randomUUID();
        await this.runner.exec(
            'INSERT INTO users (id, email, password_hash, role, tenant_slug, created_at) VALUES (?,?,?,?,?,?)',
            [id, input.email, input.passwordHash, input.role, tenantSlug, input.now],
        );
        return { id, email: input.email, role: input.role, tenantSlug };
    }

    /** Login path ONLY — returns the hash so verifyPassword can run. */
    async findByEmailForVerify(email: string): Promise<UserRecord | null> {
        const rows = await this.runner.query(
            'SELECT id, email, password_hash, role, tenant_slug, created_at FROM users WHERE email = ? AND tenant_slug = ?',
            [email, this.tenant],
        );
        const r = rows[0];
        return r ? { id: String(r.id), email: String(r.email), passwordHash: String(r.password_hash), role: String(r.role), tenantSlug: String(r.tenant_slug), createdAt: String(r.created_at) } : null;
    }

    async countUsers(): Promise<number> {
        const rows = await this.runner.query('SELECT COUNT(*) AS n FROM users WHERE tenant_slug = ?', [this.tenant]);
        return Number(rows[0]?.n ?? 0);
    }

    async findById(id: string): Promise<PublicUser | null> {
        const rows = await this.runner.query('SELECT id, email, role, tenant_slug FROM users WHERE id = ? AND tenant_slug = ?', [id, this.tenant]);
        const r = rows[0];
        return r ? { id: String(r.id), email: String(r.email), role: String(r.role), tenantSlug: String(r.tenant_slug) } : null;
    }
}

export function toPublic(u: { id: string; email: string; role: string; tenantSlug: string }): PublicUser {
    return { id: u.id, email: u.email, role: u.role, tenantSlug: u.tenantSlug };
}
