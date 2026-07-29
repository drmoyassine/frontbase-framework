/**
 * Phase 2 store — tenant-scoped CRUD for automations (workflows + executions),
 * edge resources, storage (buckets + files), settings, and variables.
 *
 * Same DbRunner seam as ConsoleStore (SQLite/D1/Turso/Postgres). RULE 2: every
 * read/write filtered by tenantSlug. RULE 3: rows returned are copies.
 */
import type { DbRunner } from '@frontbase/edge-infra';
import { noopCipher, type SecretCipher } from './secret-cipher.js';

// ---- Types ----
export interface WorkflowInput {
    id: string;
    name: string;
    nodes: string;   // JSON
    edges: string;   // JSON
    isActive?: boolean;
}

export interface EdgeResourceInput {
    id: string;
    kind: string;     // engine|database|cache|queue|vector
    name: string;
    provider?: string;
    config?: string;  // JSON
    status?: string;
}

export interface BucketInput {
    id: string;
    name: string;
    provider?: string;
    config?: string;
}

export interface FileInput {
    id: string;
    bucketId: string;
    path: string;
    name: string;
    size?: number;
    mimeType?: string;
}

export class Phase2Store {
    protected cipher: SecretCipher;
    constructor(protected runner: DbRunner, protected tenant: string, cipher?: SecretCipher) {
        this.cipher = cipher ?? noopCipher;
    }

    // ============ AUTOMATIONS (workflows + executions) ============

    async listWorkflows(): Promise<Record<string, unknown>[]> {
        return this.runner.query(
            'SELECT id, name, nodes, edges, is_active, is_published, version, created_at, updated_at FROM workflows WHERE tenant_slug = ? ORDER BY updated_at DESC',
            [this.tenant],
        );
    }

    async getWorkflow(id: string): Promise<Record<string, unknown> | null> {
        const rows = await this.runner.query(
            'SELECT id, name, nodes, edges, is_active, is_published, version, created_at, updated_at FROM workflows WHERE id = ? AND tenant_slug = ?',
            [id, this.tenant],
        );
        return rows[0] ?? null;
    }

    async upsertWorkflow(input: WorkflowInput, now: string): Promise<{ version: number }> {
        const cur = await this.runner.query(
            'SELECT version FROM workflows WHERE id = ? AND tenant_slug = ?',
            [input.id, this.tenant],
        );
        const version = cur[0] ? Number(cur[0].version) + 1 : 1;
        const isActive = input.isActive ?? true ? 1 : 0;
        await this.runner.exec(
            // created_at is set on insert only — an upsert must not reset it.
            `INSERT INTO workflows (id, tenant_slug, name, nodes, edges, is_active, version, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id, tenant_slug) DO UPDATE SET name=excluded.name, nodes=excluded.nodes,
             edges=excluded.edges, is_active=excluded.is_active, version=excluded.version, updated_at=excluded.updated_at`,
            [input.id, this.tenant, input.name, input.nodes, input.edges, isActive, version, now, now],
        );
        return { version };
    }

    async deleteWorkflow(id: string): Promise<void> {
        await this.runner.exec('DELETE FROM workflows WHERE id = ? AND tenant_slug = ?', [id, this.tenant]);
        await this.runner.exec('DELETE FROM workflow_executions WHERE workflow_id = ? AND tenant_slug = ?', [id, this.tenant]);
    }

    async toggleWorkflow(id: string, isActive: boolean, now: string): Promise<void> {
        await this.runner.exec(
            'UPDATE workflows SET is_active = ?, updated_at = ? WHERE id = ? AND tenant_slug = ?',
            [isActive ? 1 : 0, now, id, this.tenant],
        );
    }

    /** Mark a workflow published (and active). Distinct from toggleWorkflow so the
     *  active on/off toggle never clears the "has been published" state. */
    async markWorkflowPublished(id: string, now: string): Promise<void> {
        await this.runner.exec(
            'UPDATE workflows SET is_published = 1, is_active = 1, updated_at = ? WHERE id = ? AND tenant_slug = ?',
            [now, id, this.tenant],
        );
    }

    async listExecutions(workflowId?: string, limit = 50): Promise<Record<string, unknown>[]> {
        if (workflowId) {
            return this.runner.query(
                'SELECT id, workflow_id, status, trigger, result, error, input, started_at, ended_at FROM workflow_executions WHERE workflow_id = ? AND tenant_slug = ? ORDER BY started_at DESC LIMIT ?',
                [workflowId, this.tenant, limit],
            );
        }
        return this.runner.query(
            'SELECT id, workflow_id, status, trigger, result, error, input, started_at, ended_at FROM workflow_executions WHERE tenant_slug = ? ORDER BY started_at DESC LIMIT ?',
            [this.tenant, limit],
        );
    }

    async createExecution(id: string, workflowId: string, trigger: string, now: string, input?: Record<string, unknown>): Promise<void> {
        await this.runner.exec(
            `INSERT INTO workflow_executions (id, tenant_slug, workflow_id, status, trigger, input, started_at) VALUES (?,?,?,?,?,?,?)`,
            [id, this.tenant, workflowId, 'running', trigger, JSON.stringify(input ?? {}), now],
        );
    }

    /** Idempotent / guarded completion (F3b-durable): only updates a row that is
     *  STILL 'running'. A recovery re-run that finishes after the original (or
     *  vice-versa) cannot clobber a terminal row — no double-complete. */
    async completeExecution(id: string, status: string, result: string | null, error: string | null, endedAt: string): Promise<void> {
        await this.runner.exec(
            `UPDATE workflow_executions SET status = ?, result = ?, error = ?, ended_at = ? WHERE id = ? AND tenant_slug = ? AND status = 'running'`,
            [status, result, error, endedAt, id, this.tenant],
        );
    }

    async getExecution(id: string): Promise<Record<string, unknown> | null> {
        const rows = await this.runner.query(
            'SELECT id, tenant_slug, workflow_id, status, trigger, result, error, input, started_at, ended_at FROM workflow_executions WHERE id = ? AND tenant_slug = ?',
            [id, this.tenant],
        );
        return rows[0] ?? null;
    }

    /**
     * Recovery sweep input (F3b-durable): 'running' rows whose started_at is older
     * than the cutoff — presumed dead (e.g. an isolate evicted mid-run). This is a
     * CROSS-TENANT system read (recovery is a system op, like login's email lookup),
     * so it does NOT filter by `this.tenant`. The caller re-runs each via the engine.
     * Returns {id, tenantSlug, workflowId, input} so the caller can replay.
     */
    async listStuckExecutions(cutoffIso: string, limit = 50): Promise<Array<{ id: string; tenantSlug: string; workflowId: string; input: Record<string, unknown> }>> {
        const rows = await this.runner.query(
            `SELECT id, tenant_slug, workflow_id, input FROM workflow_executions WHERE status = 'running' AND started_at < ? LIMIT ?`,
            [cutoffIso, limit],
        );
        return rows.map((row) => ({
            id: String(row.id),
            tenantSlug: String(row.tenant_slug),
            workflowId: String(row.workflow_id),
            input: (() => { try { return JSON.parse(String(row.input ?? '{}')); } catch { return {}; } })(),
        }));
    }

    // ============ EDGE RESOURCES ============

    async listEdgeResources(kind?: string): Promise<Record<string, unknown>[]> {
        if (kind) {
            return this.runner.query(
                'SELECT id, kind, name, provider, config, status, created_at, updated_at FROM edge_resources WHERE kind = ? AND tenant_slug = ? ORDER BY updated_at DESC',
                [kind, this.tenant],
            );
        }
        return this.runner.query(
            'SELECT id, kind, name, provider, config, status, created_at, updated_at FROM edge_resources WHERE tenant_slug = ? ORDER BY updated_at DESC',
            [this.tenant],
        );
    }

    async getEdgeResource(id: string): Promise<Record<string, unknown> | null> {
        const rows = await this.runner.query(
            'SELECT id, kind, name, provider, config, status, created_at, updated_at FROM edge_resources WHERE id = ? AND tenant_slug = ?',
            [id, this.tenant],
        );
        return rows[0] ?? null;
    }

    /** Decrypted edge-resource configuration for server-side provider execution.
     * Never expose this object from an API response: it can contain account tokens,
     * connection strings, signing keys, and provider-specific credentials. */
    async getEdgeResourceConfig(id: string): Promise<Record<string, unknown> | null> {
        const rows = await this.runner.query(
            'SELECT config FROM edge_resources WHERE id = ? AND tenant_slug = ?',
            [id, this.tenant],
        );
        const raw = rows[0]?.config;
        if (raw === null || raw === undefined || raw === '') return {};
        if (!this.cipher.isEncrypted(String(raw))) throw new Error('secret_not_encrypted');
        const decrypted = await this.cipher.decrypt(String(raw));
        try {
            const parsed = JSON.parse(decrypted) as unknown;
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : {};
        } catch {
            throw new Error('invalid_edge_resource_config');
        }
    }

    async upsertEdgeResource(input: EdgeResourceInput, now: string): Promise<void> {
        const currentRows = await this.runner.query(
            'SELECT provider, config, status FROM edge_resources WHERE id = ? AND tenant_slug = ?',
            [input.id, this.tenant],
        );
        const current = currentRows[0];
        let storedConfig = input.config ?? null;
        if (storedConfig !== null && !this.cipher.isEncrypted(storedConfig)) {
            storedConfig = await this.cipher.encrypt(storedConfig);
            if (!this.cipher.isEncrypted(storedConfig)) {
                throw new Error('secret_cipher_unavailable');
            }
        }
        if (storedConfig === null && current?.config !== undefined && current.config !== null) storedConfig = String(current.config);
        const provider = input.provider ?? (current?.provider === null || current?.provider === undefined ? null : String(current.provider));
        const status = input.status ?? (current?.status === null || current?.status === undefined ? 'active' : String(current.status));
        await this.runner.exec(
            `INSERT INTO edge_resources (id, tenant_slug, kind, name, provider, config, status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id, tenant_slug) DO UPDATE SET kind=excluded.kind, name=excluded.name,
             provider=excluded.provider, config=excluded.config, status=excluded.status, updated_at=excluded.updated_at`,
            [input.id, this.tenant, input.kind, input.name, provider, storedConfig, status, now, now],
        );
    }

    async deleteEdgeResource(id: string): Promise<void> {
        await this.runner.exec('DELETE FROM edge_resources WHERE id = ? AND tenant_slug = ?', [id, this.tenant]);
    }

    // ============ STORAGE ============

    async listBuckets(): Promise<Record<string, unknown>[]> {
        return this.runner.query(
            'SELECT id, name, provider, config, created_at FROM storage_buckets WHERE tenant_slug = ? ORDER BY name',
            [this.tenant],
        );
    }

    async upsertBucket(input: BucketInput, now: string): Promise<void> {
        const currentRows = await this.runner.query(
            'SELECT provider, config FROM storage_buckets WHERE id = ? AND tenant_slug = ?',
            [input.id, this.tenant],
        );
        const current = currentRows[0];
        let storedConfig = input.config ?? null;
        if (storedConfig !== null && !this.cipher.isEncrypted(storedConfig)) {
            storedConfig = await this.cipher.encrypt(storedConfig);
            if (!this.cipher.isEncrypted(storedConfig)) throw new Error('secret_cipher_unavailable');
        }
        if (storedConfig === null && current?.config !== undefined && current.config !== null) {
            storedConfig = String(current.config);
        }
        const provider = input.provider
            ?? (current?.provider === null || current?.provider === undefined ? 'local' : String(current.provider));
        await this.runner.exec(
            `INSERT INTO storage_buckets (id, tenant_slug, name, provider, config, created_at)
             VALUES (?,?,?,?,?,?)
             ON CONFLICT(id, tenant_slug) DO UPDATE SET name=excluded.name, provider=excluded.provider, config=excluded.config`,
            [input.id, this.tenant, input.name, provider, storedConfig, now],
        );
    }

    async deleteBucket(id: string): Promise<void> {
        await this.runner.exec('DELETE FROM storage_files WHERE bucket_id = ? AND tenant_slug = ?', [id, this.tenant]);
        await this.runner.exec('DELETE FROM storage_buckets WHERE id = ? AND tenant_slug = ?', [id, this.tenant]);
    }

    async listFiles(bucketId: string): Promise<Record<string, unknown>[]> {
        return this.runner.query(
            'SELECT id, bucket_id, path, name, size, mime_type, created_at FROM storage_files WHERE bucket_id = ? AND tenant_slug = ? ORDER BY name',
            [bucketId, this.tenant],
        );
    }

    async createFile(input: FileInput, now: string): Promise<void> {
        await this.runner.exec(
            `INSERT INTO storage_files (id, tenant_slug, bucket_id, path, name, size, mime_type, created_at) VALUES (?,?,?,?,?,?,?,?)`,
            [input.id, this.tenant, input.bucketId, input.path, input.name, input.size ?? 0, input.mimeType ?? null, now],
        );
    }

    async deleteFile(id: string): Promise<void> {
        await this.runner.exec('DELETE FROM storage_files WHERE id = ? AND tenant_slug = ?', [id, this.tenant]);
    }

    /** A single file row by id — resolves bucket_id + path so the route can remove
     *  the real provider object BEFORE deleting the metadata row (BUG-1 fix). */
    async getFile(id: string): Promise<{ bucketId: string; path: string; name: string } | null> {
        const rows = await this.runner.query(
            'SELECT bucket_id, path, name FROM storage_files WHERE id = ? AND tenant_slug = ?',
            [id, this.tenant],
        );
        const row = rows[0];
        return row ? { bucketId: String(row.bucket_id), path: String(row.path), name: String(row.name) } : null;
    }

    // ============ SETTINGS ============

    async listSettings(): Promise<Record<string, unknown>[]> {
        return this.runner.query('SELECT key, value, updated_at FROM settings WHERE tenant_slug = ? ORDER BY key', [this.tenant]);
    }

    async getSetting(key: string): Promise<string | null> {
        const rows = await this.runner.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant, key]);
        return rows[0] ? String(rows[0].value) : null;
    }

    async upsertSetting(key: string, value: string, now: string): Promise<void> {
        await this.runner.exec(
            `INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?)
             ON CONFLICT(tenant_slug, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
            [this.tenant, key, value, now],
        );
    }

    async deleteSetting(key: string): Promise<void> {
        await this.runner.exec('DELETE FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant, key]);
    }

    // ============ VARIABLES (secret values encrypted at rest — F6) ============

    async listVariables(): Promise<Record<string, unknown>[]> {
        return this.runner.query('SELECT key, value, is_secret, updated_at FROM variables WHERE tenant_slug = ? ORDER BY key', [this.tenant]);
    }

    /** The decrypted value of a variable (server-side consumption, e.g. by a workflow). */
    async getVariable(key: string): Promise<string | null> {
        const rows = await this.runner.query('SELECT value, is_secret FROM variables WHERE tenant_slug = ? AND key = ?', [this.tenant, key]);
        const row = rows[0];
        if (!row) return null;
        const value = String(row.value);
        if (Number(row.is_secret) !== 0 && !this.cipher.isEncrypted(value)) {
            throw new Error('secret_not_encrypted');
        }
        return this.cipher.decrypt(value);
    }

    async upsertVariable(key: string, value: string, isSecret: boolean, now: string): Promise<void> {
        // Encrypt secret values at rest (F6). Non-secret values stay plaintext.
        const stored = isSecret ? await this.cipher.encrypt(value) : value;
        await this.runner.exec(
            `INSERT INTO variables (tenant_slug, key, value, is_secret, updated_at) VALUES (?,?,?,?,?)
             ON CONFLICT(tenant_slug, key) DO UPDATE SET value=excluded.value, is_secret=excluded.is_secret, updated_at=excluded.updated_at`,
            [this.tenant, key, stored, isSecret ? 1 : 0, now],
        );
    }

    async deleteVariable(key: string): Promise<void> {
        await this.runner.exec('DELETE FROM variables WHERE tenant_slug = ? AND key = ?', [this.tenant, key]);
    }

    // ============ DATASOURCES (Phase 3b / Data Studio — config encrypted F6) ============

    async listDatasources(): Promise<Record<string, unknown>[]> {
        return this.runner.query('SELECT id, name, kind, created_at, updated_at FROM datasources WHERE tenant_slug = ? ORDER BY name', [this.tenant]);
    }

    /** The decrypted config (server-side only — for building a runner). */
    async getDatasourceConfig(id: string): Promise<{ kind: string; name: string; config: Record<string, unknown> } | null> {
        const rows = await this.runner.query('SELECT name, kind, config FROM datasources WHERE id = ? AND tenant_slug = ?', [id, this.tenant]);
        const row = rows[0];
        if (!row) return null;
        if (!this.cipher.isEncrypted(String(row.config))) throw new Error('secret_not_encrypted');
        const decrypted = await this.cipher.decrypt(String(row.config));
        return { kind: String(row.kind), name: String(row.name), config: JSON.parse(decrypted) };
    }

    async upsertDatasource(id: string, name: string, kind: string, config: Record<string, unknown>, now: string): Promise<void> {
        // Encrypt the connection config (holds credentials — F6).
        const stored = await this.cipher.encrypt(JSON.stringify(config));
        if (!this.cipher.isEncrypted(stored)) throw new Error('secret_cipher_unavailable');
        await this.runner.exec(
            `INSERT INTO datasources (id, tenant_slug, name, kind, config, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
             ON CONFLICT(id, tenant_slug) DO UPDATE SET name=excluded.name, kind=excluded.kind, config=excluded.config, updated_at=excluded.updated_at`,
            [id, this.tenant, name, kind, stored, now, now],
        );
    }

    async deleteDatasource(id: string): Promise<void> {
        await this.runner.exec('DELETE FROM datasources WHERE id = ? AND tenant_slug = ?', [id, this.tenant]);
    }

    // ============ PLANS (Phase 3b) ============

    async listPlans(): Promise<Record<string, unknown>[]> {
        return this.runner.query('SELECT id, name, price_cents, interval, limits, is_active, created_at, updated_at FROM plans WHERE tenant_slug = ? ORDER BY price_cents', [this.tenant]);
    }

    async upsertPlan(input: { id: string; name: string; priceCents: number; interval: string; limits?: Record<string, unknown>; isActive?: boolean }, now: string): Promise<void> {
        await this.runner.exec(
            `INSERT INTO plans (id, tenant_slug, name, price_cents, interval, limits, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id, tenant_slug) DO UPDATE SET name=excluded.name, price_cents=excluded.price_cents, interval=excluded.interval, limits=excluded.limits, is_active=excluded.is_active, updated_at=excluded.updated_at`,
            [input.id, this.tenant, input.name, input.priceCents, input.interval, input.limits ? JSON.stringify(input.limits) : null, input.isActive === false ? 0 : 1, now, now],
        );
    }

    async deletePlan(id: string): Promise<void> {
        await this.runner.exec('DELETE FROM plans WHERE id = ? AND tenant_slug = ?', [id, this.tenant]);
    }

    // ============ PLAN-LIMIT ENFORCEMENT (Phase 3c / F8c) ============

    /**
     * The effective limits for this tenant. Resolution order:
     *   1. A `_limits` setting (JSON) — set when a plan is assigned to the tenant.
     *   2. The first active plan's `limits`.
     *   3. null → unlimited (no plan assigned).
     * `-1` on any limit key means unlimited for that resource.
     */
    async getEffectiveLimits(): Promise<Record<string, number> | null> {
        // 1. Explicit assignment via settings.
        const assigned = await this.getSetting('_limits');
        if (assigned) {
            try { return JSON.parse(assigned); } catch { /* fall through */ }
        }
        // 2. First active plan's limits.
        const rows = await this.runner.query(
            "SELECT limits FROM plans WHERE tenant_slug = ? AND is_active = 1 AND limits IS NOT NULL ORDER BY updated_at DESC LIMIT 1",
            [this.tenant],
        );
        if (rows[0]?.limits) {
            try { return JSON.parse(String(rows[0].limits)); } catch { /* fall through */ }
        }
        return null;
    }

    /**
     * Check a named limit against a current count. Throws 'limit_exceeded' if the
     * count is at/over a positive limit. No-op when limits are null or the key is
     * absent / unlimited (-1). Returns the limits for chaining.
     */
    async enforceLimit(key: string, currentCount: number): Promise<Record<string, number> | null> {
        const limits = await this.getEffectiveLimits();
        if (!limits) return null;
        const cap = limits[key];
        if (cap === undefined || cap === -1) return limits; // unlimited
        if (currentCount >= cap) throw new Error('limit_exceeded');
        return limits;
    }
}
