/**
 * CF-22 Work A — tenant-scoped store for the /api/sync DB-Synchronizer surface.
 * Handles datasources, datasource_views, user-defined relationships, table sessions,
 * and encrypted credential management using SecretCipher.
 *
 * RULE 2: Every query filters strictly by tenant_slug.
 */
import type { DbRunner } from '@frontbase/edge-infra';
import type { SecretCipher } from '../db/secret-cipher.js';

export interface DatasourceRecord {
    id: string;
    name: string;
    kind: string;
    config: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface DatasourceViewRecord {
    id: string;
    datasource_id: string;
    name: string;
    target_table: string;
    visible_columns: string[] | null;
    column_order: string[] | null;
    pinned_columns: string[] | null;
    filters: unknown[] | null;
    field_mappings: Record<string, unknown> | null;
    webhooks: unknown[] | null;
    linked_views: Record<string, unknown> | null;
    description: string | null;
    created_at: string;
    updated_at: string;
}

export class SyncStore {
    constructor(
        private runner: DbRunner,
        private tenant: string,
        private secretCipher: SecretCipher,
    ) {}

    async encryptSecret(value: string): Promise<string> {
        const encrypted = await this.secretCipher.encrypt(value);
        if (!this.secretCipher.isEncrypted(encrypted)) {
            throw new Error('secret_cipher_unavailable');
        }
        return encrypted;
    }

    async decryptSecret(value: string): Promise<string> {
        if (!this.secretCipher.isEncrypted(value)) {
            throw new Error('secret_not_encrypted');
        }
        return this.secretCipher.decrypt(value);
    }

    // --- Datasource Operations ---

    async listDatasources(): Promise<DatasourceRecord[]> {
        const rows = await this.runner.query(
            'SELECT id, name, kind, config, created_at, updated_at FROM datasources WHERE tenant_slug = ? ORDER BY created_at ASC',
            [this.tenant],
        );
        const result: DatasourceRecord[] = [];
        for (const row of rows) {
            const configObj = await this.decryptConfig(String(row.config ?? '{}'));
            result.push({
                id: String(row.id),
                name: String(row.name),
                kind: String(row.kind),
                config: configObj,
                created_at: String(row.created_at),
                updated_at: String(row.updated_at),
            });
        }
        return result;
    }

    async getDatasource(id: string): Promise<DatasourceRecord | null> {
        const rows = await this.runner.query(
            'SELECT id, name, kind, config, created_at, updated_at FROM datasources WHERE tenant_slug = ? AND id = ?',
            [this.tenant, id],
        );
        const row = rows[0];
        if (!row) return null;
        const configObj = await this.decryptConfig(String(row.config ?? '{}'));
        return {
            id: String(row.id),
            name: String(row.name),
            kind: String(row.kind),
            config: configObj,
            created_at: String(row.created_at),
            updated_at: String(row.updated_at),
        };
    }

    async createDatasource(
        input: { name: string; kind: string; config?: Record<string, unknown> },
        id: string,
        now: string,
    ): Promise<DatasourceRecord> {
        const rawConfig = input.config ?? {};
        const encrypted = await this.secretCipher.encrypt(JSON.stringify(rawConfig));
        if (!this.secretCipher.isEncrypted(encrypted)) {
            throw new Error('secret_cipher_unavailable');
        }
        await this.runner.exec(
            'INSERT INTO datasources (id, tenant_slug, name, kind, config, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
            [id, this.tenant, input.name, input.kind, encrypted, now, now],
        );
        return {
            id,
            name: input.name,
            kind: input.kind,
            config: rawConfig,
            created_at: now,
            updated_at: now,
        };
    }

    async updateDatasource(
        id: string,
        patch: { name?: string; kind?: string; config?: Record<string, unknown> },
        now: string,
    ): Promise<DatasourceRecord | null> {
        const existing = await this.getDatasource(id);
        if (!existing) return null;
        const name = patch.name ?? existing.name;
        const kind = patch.kind ?? existing.kind;
        const newConfig = patch.config !== undefined ? patch.config : existing.config;
        const encrypted = await this.secretCipher.encrypt(JSON.stringify(newConfig));
        if (!this.secretCipher.isEncrypted(encrypted)) {
            throw new Error('secret_cipher_unavailable');
        }

        await this.runner.exec(
            'UPDATE datasources SET name = ?, kind = ?, config = ?, updated_at = ? WHERE tenant_slug = ? AND id = ?',
            [name, kind, encrypted, now, this.tenant, id],
        );
        return {
            id,
            name,
            kind,
            config: newConfig,
            created_at: existing.created_at,
            updated_at: now,
        };
    }

    async deleteDatasource(id: string): Promise<boolean> {
        await this.runner.exec(
            'DELETE FROM datasources WHERE tenant_slug = ? AND id = ?',
            [this.tenant, id],
        );
        return true;
    }

    // --- Datasource View Operations ---

    async listViews(datasourceId: string): Promise<DatasourceViewRecord[]> {
        const rows = await this.runner.query(
            'SELECT id, datasource_id, name, target_table, visible_columns, column_order, pinned_columns, filters, field_mappings, webhooks, linked_views, description, created_at, updated_at FROM datasource_views WHERE tenant_slug = ? AND datasource_id = ? ORDER BY created_at ASC',
            [this.tenant, datasourceId],
        );
        return rows.map((r) => this.mapViewRow(r));
    }

    async getView(id: string): Promise<DatasourceViewRecord | null> {
        const rows = await this.runner.query(
            'SELECT id, datasource_id, name, target_table, visible_columns, column_order, pinned_columns, filters, field_mappings, webhooks, linked_views, description, created_at, updated_at FROM datasource_views WHERE tenant_slug = ? AND id = ?',
            [this.tenant, id],
        );
        const row = rows[0];
        return row ? this.mapViewRow(row) : null;
    }

    async createView(
        input: {
            datasource_id: string;
            name: string;
            target_table: string;
            visible_columns?: string[] | null;
            column_order?: string[] | null;
            pinned_columns?: string[] | null;
            filters?: unknown[] | null;
            field_mappings?: Record<string, unknown> | null;
            webhooks?: unknown[] | null;
            linked_views?: Record<string, unknown> | null;
            description?: string | null;
        },
        id: string,
        now: string,
    ): Promise<DatasourceViewRecord> {
        await this.runner.exec(
            `INSERT INTO datasource_views (id, tenant_slug, datasource_id, name, target_table, visible_columns, column_order, pinned_columns, filters, field_mappings, webhooks, linked_views, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                id,
                this.tenant,
                input.datasource_id,
                input.name,
                input.target_table,
                input.visible_columns ? JSON.stringify(input.visible_columns) : null,
                input.column_order ? JSON.stringify(input.column_order) : null,
                input.pinned_columns ? JSON.stringify(input.pinned_columns) : null,
                input.filters ? JSON.stringify(input.filters) : null,
                input.field_mappings ? JSON.stringify(input.field_mappings) : null,
                input.webhooks ? JSON.stringify(input.webhooks) : null,
                input.linked_views ? JSON.stringify(input.linked_views) : null,
                input.description ?? null,
                now,
                now,
            ],
        );
        return {
            id,
            datasource_id: input.datasource_id,
            name: input.name,
            target_table: input.target_table,
            visible_columns: input.visible_columns ?? null,
            column_order: input.column_order ?? null,
            pinned_columns: input.pinned_columns ?? null,
            filters: input.filters ?? null,
            field_mappings: input.field_mappings ?? null,
            webhooks: input.webhooks ?? null,
            linked_views: input.linked_views ?? null,
            description: input.description ?? null,
            created_at: now,
            updated_at: now,
        };
    }

    async updateView(
        id: string,
        patch: Partial<DatasourceViewRecord>,
        now: string,
    ): Promise<DatasourceViewRecord | null> {
        const existing = await this.getView(id);
        if (!existing) return null;

        const merged: DatasourceViewRecord = {
            id,
            datasource_id: patch.datasource_id ?? existing.datasource_id,
            name: patch.name ?? existing.name,
            target_table: patch.target_table ?? existing.target_table,
            visible_columns: patch.visible_columns !== undefined ? patch.visible_columns : existing.visible_columns,
            column_order: patch.column_order !== undefined ? patch.column_order : existing.column_order,
            pinned_columns: patch.pinned_columns !== undefined ? patch.pinned_columns : existing.pinned_columns,
            filters: patch.filters !== undefined ? patch.filters : existing.filters,
            field_mappings: patch.field_mappings !== undefined ? patch.field_mappings : existing.field_mappings,
            webhooks: patch.webhooks !== undefined ? patch.webhooks : existing.webhooks,
            linked_views: patch.linked_views !== undefined ? patch.linked_views : existing.linked_views,
            description: patch.description !== undefined ? patch.description : existing.description,
            created_at: existing.created_at,
            updated_at: now,
        };

        await this.runner.exec(
            `UPDATE datasource_views SET name = ?, target_table = ?, visible_columns = ?, column_order = ?, pinned_columns = ?, filters = ?, field_mappings = ?, webhooks = ?, linked_views = ?, description = ?, updated_at = ? WHERE tenant_slug = ? AND id = ?`,
            [
                merged.name,
                merged.target_table,
                merged.visible_columns ? JSON.stringify(merged.visible_columns) : null,
                merged.column_order ? JSON.stringify(merged.column_order) : null,
                merged.pinned_columns ? JSON.stringify(merged.pinned_columns) : null,
                merged.filters ? JSON.stringify(merged.filters) : null,
                merged.field_mappings ? JSON.stringify(merged.field_mappings) : null,
                merged.webhooks ? JSON.stringify(merged.webhooks) : null,
                merged.linked_views ? JSON.stringify(merged.linked_views) : null,
                merged.description ?? null,
                now,
                this.tenant,
                id,
            ],
        );
        return merged;
    }

    async deleteView(id: string): Promise<boolean> {
        await this.runner.exec(
            'DELETE FROM datasource_views WHERE tenant_slug = ? AND id = ?',
            [this.tenant, id],
        );
        return true;
    }

    // --- Private Helpers ---

    private async decryptConfig(raw: string): Promise<Record<string, unknown>> {
        if (!raw) return {};
        if (!this.secretCipher.isEncrypted(raw)) {
            throw new Error('secret_not_encrypted');
        }
        const decrypted = await this.secretCipher.decrypt(raw);
        const parsed = JSON.parse(decrypted) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('invalid_encrypted_datasource_config');
        }
        return parsed as Record<string, unknown>;
    }

    private mapViewRow(row: Record<string, unknown>): DatasourceViewRecord {
        return {
            id: String(row.id),
            datasource_id: String(row.datasource_id),
            name: String(row.name),
            target_table: String(row.target_table),
            visible_columns: this.safeParseJson<string[]>(row.visible_columns),
            column_order: this.safeParseJson<string[]>(row.column_order),
            pinned_columns: this.safeParseJson<string[]>(row.pinned_columns),
            filters: this.safeParseJson<unknown[]>(row.filters),
            field_mappings: this.safeParseJson<Record<string, unknown>>(row.field_mappings),
            webhooks: this.safeParseJson<unknown[]>(row.webhooks),
            linked_views: this.safeParseJson<Record<string, unknown>>(row.linked_views),
            description: row.description ? String(row.description) : null,
            created_at: String(row.created_at),
            updated_at: String(row.updated_at),
        };
    }

    private safeParseJson<T>(val: unknown): T | null {
        if (!val || typeof val !== 'string') return null;
        try {
            return JSON.parse(val) as T;
        } catch {
            return null;
        }
    }
}
