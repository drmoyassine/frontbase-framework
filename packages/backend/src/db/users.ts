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

    /** Login path ONLY (tenant-scoped) — returns the hash so verifyPassword can run. */
    async findByEmailForVerify(email: string): Promise<UserRecord | null> {
        const rows = await this.runner.query(
            'SELECT id, email, password_hash, role, tenant_slug, created_at FROM users WHERE email = ? AND tenant_slug = ?',
            [email, this.tenant],
        );
        return toRecord(rows[0]);
    }

    /**
     * Login path — cross-tenant lookup by email. Login is the ONE legitimately
     * global read (you're proving identity, not reading tenant data): a
     * master_admin lives in `_root`, a tenant_admin in its own tenant, an owner in
     * `_default`. Returns ALL accounts with this email so the caller verifies the
     * password against each and logs in the match (handles the same email existing
     * in multiple tenants — UNIQUE is (email, tenant_slug)). NOT tenant-filtered by design.
     */
    async findByEmailAnyTenant(email: string): Promise<UserRecord[]> {
        const rows = await this.runner.query(
            'SELECT id, email, password_hash, role, tenant_slug, created_at FROM users WHERE email = ?',
            [email],
        );
        return rows.map((r) => toRecord(r)!).filter(Boolean);
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

    async getSessionVersion(id: string): Promise<number> {
        const rows = await this.runner.query(
            'SELECT version FROM user_session_versions WHERE user_id = ? AND tenant_slug = ?',
            [id, this.tenant],
        );
        return Number(rows[0]?.version ?? 0);
    }

    /**
     * Replace a credential and atomically advance the session generation.
     * Existing JWTs either carry the old generation or implicitly generation 0.
     */
    async updatePasswordAndInvalidateSessions(id: string, passwordHash: string, now: string): Promise<number> {
        const changed = await this.runner.exec(
            'UPDATE users SET password_hash = ? WHERE id = ? AND tenant_slug = ?',
            [passwordHash, id, this.tenant],
        );
        if (changed !== 1) throw new Error('user_not_found');
        await this.runner.exec(
            `INSERT INTO user_session_versions (user_id, tenant_slug, version, updated_at)
             VALUES (?,?,1,?)
             ON CONFLICT(user_id, tenant_slug)
             DO UPDATE SET version = user_session_versions.version + 1, updated_at = excluded.updated_at`,
            [id, this.tenant, now],
        );
        return this.getSessionVersion(id);
    }

    /** List all users in this tenant (CF-18 Phase 2 — App Users). */
    async listUsers(): Promise<PublicUser[]> {
        const rows = await this.runner.query(
            'SELECT id, email, role, tenant_slug, created_at FROM users WHERE tenant_slug = ? ORDER BY created_at DESC',
            [this.tenant],
        );
        return rows.map((r) => ({
            id: String(r.id),
            email: String(r.email),
            role: String(r.role),
            tenantSlug: String(r.tenant_slug),
        }));
    }

    /** Update a user's role (CF-18 Phase 2 — App Users). */
    async updateRole(id: string, role: string): Promise<void> {
        await this.runner.exec(
            'UPDATE users SET role = ? WHERE id = ? AND tenant_slug = ?',
            [role, id, this.tenant],
        );
    }

    /** Delete a user (CF-18 Phase 2 — App Users). */
    async deleteUser(id: string): Promise<void> {
        await this.runner.exec(
            'DELETE FROM users WHERE id = ? AND tenant_slug = ?',
            [id, this.tenant],
        );
    }
}

export function toPublic(u: { id: string; email: string; role: string; tenantSlug: string }): PublicUser {
    return { id: u.id, email: u.email, role: u.role, tenantSlug: u.tenantSlug };
}

function toRecord(r: Record<string, unknown> | undefined): UserRecord | null {
    return r ? { id: String(r.id), email: String(r.email), passwordHash: String(r.password_hash), role: String(r.role), tenantSlug: String(r.tenant_slug), createdAt: String(r.created_at) } : null;
}
