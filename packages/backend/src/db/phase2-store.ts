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
            'SELECT id, name, nodes, edges, is_active, version, updated_at FROM workflows WHERE tenant_slug = ? ORDER BY updated_at DESC',
            [this.tenant],
        );
    }

    async getWorkflow(id: string): Promise<Record<string, unknown> | null> {
        const rows = await this.runner.query(
            'SELECT id, name, nodes, edges, is_active, version, updated_at FROM workflows WHERE id = ? AND tenant_slug = ?',
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
            `INSERT INTO workflows (id, tenant_slug, name, nodes, edges, is_active, version, updated_at)
             VALUES (?,?,?,?,?,?,?,?)
             ON CONFLICT(id, tenant_slug) DO UPDATE SET name=excluded.name, nodes=excluded.nodes,
             edges=excluded.edges, is_active=excluded.is_active, version=excluded.version, updated_at=excluded.updated_at`,
            [input.id, this.tenant, input.name, input.nodes, input.edges, isActive, version, now],
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

    async listExecutions(workflowId?: string, limit = 50): Promise<Record<string, unknown>[]> {
        if (workflowId) {
            return this.runner.query(
                'SELECT id, workflow_id, status, trigger, result, error, started_at, ended_at FROM workflow_executions WHERE workflow_id = ? AND tenant_slug = ? ORDER BY started_at DESC LIMIT ?',
                [workflowId, this.tenant, limit],
            );
        }
        return this.runner.query(
            'SELECT id, workflow_id, status, trigger, result, error, started_at, ended_at FROM workflow_executions WHERE tenant_slug = ? ORDER BY started_at DESC LIMIT ?',
            [this.tenant, limit],
        );
    }

    async createExecution(id: string, workflowId: string, trigger: string, now: string): Promise<void> {
        await this.runner.exec(
            `INSERT INTO workflow_executions (id, tenant_slug, workflow_id, status, trigger, started_at) VALUES (?,?,?,?,?,?)`,
            [id, this.tenant, workflowId, 'running', trigger, now],
        );
    }

    async completeExecution(id: string, status: string, result: string | null, error: string | null, endedAt: string): Promise<void> {
        await this.runner.exec(
            `UPDATE workflow_executions SET status = ?, result = ?, error = ?, ended_at = ? WHERE id = ? AND tenant_slug = ?`,
            [status, result, error, endedAt, id, this.tenant],
        );
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

    async upsertEdgeResource(input: EdgeResourceInput, now: string): Promise<void> {
        await this.runner.exec(
            `INSERT INTO edge_resources (id, tenant_slug, kind, name, provider, config, status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id, tenant_slug) DO UPDATE SET kind=excluded.kind, name=excluded.name,
             provider=excluded.provider, config=excluded.config, status=excluded.status, updated_at=excluded.updated_at`,
            [input.id, this.tenant, input.kind, input.name, input.provider ?? null, input.config ?? null, input.status ?? 'active', now, now],
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
        await this.runner.exec(
            `INSERT INTO storage_buckets (id, tenant_slug, name, provider, config, created_at)
             VALUES (?,?,?,?,?,?)
             ON CONFLICT(id, tenant_slug) DO UPDATE SET name=excluded.name, provider=excluded.provider, config=excluded.config`,
            [input.id, this.tenant, input.name, input.provider ?? 'local', input.config ?? null, now],
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
        // Decrypt only if it's a secret (or already-encrypted legacy). Idempotent.
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
}
