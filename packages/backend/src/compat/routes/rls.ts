/** Supabase RLS compatibility surface.
 *
 * Policy operations execute the same management RPCs as the product. Only the
 * UI metadata remains local tenant-scoped state. Raw policy expressions are
 * never interpolated by this service; they are JSON parameters to audited
 * Supabase RPC functions.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { KeyValueStore } from '../store.js';
import type { SyncStore } from '../sync-store.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';
import { z } from 'zod';

/**
 * Convert Zod validation errors to Pydantic-style error format.
 * Pydantic returns { detail: [{ type, loc: ['body', ...path], msg, input }] }
 */
function zodToPydanticError(error: { issues: Array<{ code: string; path: Array<string | number>; message: string; expected?: unknown; received?: unknown; input?: unknown }> }): { detail: Array<{ type: string; loc: string[]; msg: string; input: unknown }> } {
    const typeMap: Record<string, string> = {
        invalid_type: 'string_type',
        too_small: 'string_too_short',
        too_big: 'string_too_long',
        invalid_enum: 'literal_error',
    };

    return {
        detail: error.issues.map((issue) => ({
            type: typeMap[issue.code] || `${issue.code}_error`,
            loc: ['body', ...issue.path.map(String)],
            msg: issue.message,
            input: issue.input ?? null,
        })),
    };
}

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerRlsRoutes(
    app: App,
    kvFor: (tenant: string) => KeyValueStore,
    syncStoreFor: (tenant: string) => SyncStore,
    externalFetch: CompatFetch,
): void {
    const sqlHash = (sql: unknown): string => {
        if (typeof sql !== 'string' || sql.length === 0) return '';
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        let value = 0;
        for (const char of normalized) value = ((value << 5) - value + char.charCodeAt(0)) >>> 0;
        return value.toString(16);
    };
    const SUPABASE_NOT_CONFIGURED =
        'Supabase connection not configured. Connect a Supabase account in Settings → Accounts.';
    const supabaseFor = async (tenant: string) => {
        const datasource = (await syncStoreFor(tenant).listDatasources())
            .find((item) => item.kind === 'supabase');
        if (!datasource) throw new Error('supabase_not_configured');
        return datasource;
    };
    const isNotConfigured = (error: unknown) =>
        (error as Error).message.includes('supabase_not_configured');
    const callRpc = async (tenant: string, functionName: string, params: Record<string, unknown>): Promise<unknown> => {
        const datasource = await supabaseFor(tenant);
        const url = String(datasource.config.url ?? datasource.config.supabaseUrl ?? '').replace(/\/+$/, '');
        const key = String(
            datasource.config.serviceKey
            ?? datasource.config.service_key
            ?? '',
        );
        // Policy DDL is privileged administration. Never fall back to an anon
        // or user JWT key just because it happens to be present in the record.
        if (!url || !key) throw new Error('supabase_service_credentials_missing');
        const response = await guardedExternalFetch(externalFetch, `${url}/rest/v1/rpc/${functionName}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                apikey: key,
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify(params),
        });
        if (!response.ok) throw new Error(`rls_rpc_${response.status}`);
        return response.json();
    };

    const failed = (c: any, error: unknown) => isNotConfigured(error)
        ? c.json({ detail: SUPABASE_NOT_CONFIGURED }, 404)
        : c.json({ detail: 'RLS provider request failed' }, 502);

    app.get('/api/database/rls/policies/', async (c) => {
        try {
            const data = await callRpc(c.get('tenant'), 'frontbase_list_rls_policies', {
                p_schema_name: c.req.query('schema') ?? 'public',
            });
            return c.json({ success: true, data: Array.isArray(data) ? data : [], error: null });
        } catch (error) {
            if (isNotConfigured(error)) {
                return c.json({ success: true, data: [], error: null });
            }
            return failed(c, error);
        }
    });

    app.get('/api/database/rls/tables/', async (c) => {
        try {
            const data = await callRpc(c.get('tenant'), 'frontbase_get_rls_status', {
                p_schema_name: c.req.query('schema') ?? 'public',
            });
            return c.json({ success: true, data: Array.isArray(data) ? data : [], error: null });
        } catch (error) {
            if (isNotConfigured(error)) {
                return c.json({ success: true, data: [], error: null });
            }
            return failed(c, error);
        }
    });

    app.get('/api/database/rls/policies/:table_name', async (c) => {
        try {
            const data = await callRpc(c.get('tenant'), 'frontbase_list_rls_policies', {
                p_schema_name: c.req.query('schema') ?? 'public',
            });
            const policies = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
            return c.json({
                success: true,
                data: policies.filter((policy) => policy.table_name === c.req.param('table_name')),
                error: null,
            });
        } catch (error) {
            if (isNotConfigured(error)) {
                return c.json({ success: true, data: [], error: null });
            }
            return failed(c, error);
        }
    });

    app.post('/api/database/rls/policies/', async (c) => {
        const body = await c.req.json().catch(() => ({})) as {
            tableName?: string;
            policyName?: string;
            operation?: string;
            usingExpression?: string | null;
            checkExpression?: string | null;
            roles?: string[];
            permissive?: boolean;
            propagateTo?: Array<Record<string, unknown>>;
        };
        try {
            await supabaseFor(c.get('tenant'));
            const result = await callRpc(c.get('tenant'), 'frontbase_create_rls_policy', {
                p_table_name: body.tableName,
                p_policy_name: body.policyName,
                p_operation: String(body.operation ?? '').toUpperCase(),
                p_using_expr: body.usingExpression ?? null,
                p_check_expr: body.checkExpression ?? null,
                p_roles: body.roles ?? ['authenticated'],
                p_permissive: body.permissive ?? true,
            }) as Record<string, unknown>;
            const propagatedTo: string[] = [];
            for (const target of body.propagateTo ?? []) {
                const targetTable = String(target.tableName ?? '');
                if (!targetTable) continue;
                await callRpc(c.get('tenant'), 'frontbase_create_rls_policy', {
                    p_table_name: targetTable,
                    p_policy_name: `${body.policyName}_on_${targetTable}`,
                    p_operation: String(body.operation ?? '').toUpperCase(),
                    p_using_expr: body.usingExpression ?? null,
                    p_check_expr: body.checkExpression ?? null,
                    p_roles: body.roles ?? ['authenticated'],
                    p_permissive: body.permissive ?? true,
                });
                propagatedTo.push(targetTable);
            }
            return c.json({
                success: result.success !== false,
                message: String(result.message ?? 'Policy created successfully'),
                sql: result.sql ?? null,
                propagatedTo,
                error: null,
            }, 201);
        } catch (error) { return failed(c, error); }
    });

    app.put('/api/database/rls/policies/:table_name/:policy_name', async (c) => {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        try {
            await supabaseFor(c.get('tenant'));
            const result = await callRpc(c.get('tenant'), 'frontbase_update_rls_policy', {
                p_table_name: c.req.param('table_name'),
                p_old_policy_name: c.req.param('policy_name'),
                p_new_policy_name: body.newPolicyName ?? c.req.param('policy_name'),
                p_operation: String(body.operation ?? '').toUpperCase(),
                p_using_expr: body.usingExpression ?? null,
                p_check_expr: body.checkExpression ?? null,
                p_roles: body.roles ?? ['authenticated'],
                p_permissive: body.permissive ?? true,
            }) as Record<string, unknown>;
            return c.json({
                success: result.success !== false,
                message: String(result.message ?? 'Policy updated'),
                error: null,
            });
        } catch (error) { return failed(c, error); }
    });

    app.delete('/api/database/rls/policies/:table_name/:policy_name', async (c) => {
        try {
            await supabaseFor(c.get('tenant'));
            const result = await callRpc(c.get('tenant'), 'frontbase_drop_rls_policy', {
                p_table_name: c.req.param('table_name'),
                p_policy_name: c.req.param('policy_name'),
            }) as Record<string, unknown>;
            return c.json({
                success: result.success !== false,
                message: String(result.message ?? 'Policy deleted'),
                error: null,
            });
        } catch (error) { return failed(c, error); }
    });

    app.post('/api/database/rls/tables/:table_name/toggle/', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { enable?: boolean };
        try {
            await supabaseFor(c.get('tenant'));
            const result = await callRpc(c.get('tenant'), 'frontbase_toggle_table_rls', {
                p_table_name: c.req.param('table_name'),
                p_enable: body.enable ?? false,
            }) as Record<string, unknown>;
            return c.json({
                success: result.success !== false,
                message: String(result.message ?? `RLS ${body.enable ? 'enabled' : 'disabled'}`),
                error: null,
            });
        } catch (error) { return failed(c, error); }
    });

    app.post('/api/database/rls/batch/', async (c) => {
        const body = await c.req.json().catch(() => ({})) as {
            policyBaseName?: string;
            tableRules?: Array<Record<string, unknown>>;
            roles?: string[];
            permissive?: boolean;
        };
        const policies = (body.tableRules ?? []).map((rule) => ({
            table_name: rule.tableName,
            policy_name: `${body.policyBaseName}_${String(rule.tableName ?? '')}`,
            operation: String(rule.operation ?? '').toUpperCase(),
            using_expr: rule.usingExpression,
            check_expr: rule.checkExpression ?? null,
            roles: body.roles ?? ['authenticated'],
            permissive: body.permissive ?? true,
        }));
        try {
            await supabaseFor(c.get('tenant'));
            const result = await callRpc(c.get('tenant'), 'frontbase_create_rls_policies_batch', {
                p_policies: policies,
            }) as Record<string, unknown>;
            return c.json({
                success: result.success !== false,
                message: String(result.message ?? 'Batch creation completed'),
                policies: result.policies ?? [],
                successCount: result.success_count ?? policies.length,
                errorCount: result.error_count ?? 0,
                error: null,
            });
        } catch (error) { return failed(c, error); }
    });

    app.post('/api/database/rls/bulk-delete/', async (c) => {
        const body = await c.req.json().catch(() => ({})) as {
            policies?: Array<{ tableName?: string; policyName?: string }>;
        };
        const results = [];
        try {
            // The product resolves the Supabase context before processing the
            // batch, including an empty batch.
            await supabaseFor(c.get('tenant'));
            for (const policy of body.policies ?? []) {
                const result = await callRpc(c.get('tenant'), 'frontbase_drop_rls_policy', {
                    p_table_name: policy.tableName,
                    p_policy_name: policy.policyName,
                }) as Record<string, unknown>;
                results.push({
                    tableName: policy.tableName,
                    policyName: policy.policyName,
                    success: result.success !== false,
                });
            }
            const successCount = results.filter((result) => result.success).length;
            return c.json({
                success: successCount === results.length,
                message: `Deleted ${successCount} policies`,
                results,
                successCount,
                errorCount: results.length - successCount,
                error: null,
            });
        } catch (error) {
            return isNotConfigured(error)
                ? c.json({ detail: SUPABASE_NOT_CONFIGURED }, 404)
                : c.json({ detail: 'RLS provider request failed' }, 502);
        }
    });

    // Metadata is Builder form state, not provider state.
    app.get('/api/database/rls/metadata/', async (c) => {
        // RLS metadata is Builder form state (local KV), not provider state — it must
        // remain accessible without a Supabase connection, so no supabaseFor() guard here.
        const metadata = await kvFor(c.get('tenant')).getJson<Array<Record<string, unknown>>>('rls_metadata', []);
        // Product excludes sqlHash and generatedCheck from the array response (only in individual item response)
        const data = metadata.map(({ sqlHash, generatedCheck, ...rest }) => rest);
        return c.json({ success: true, data, error: null });
    });

    app.get('/api/database/rls/metadata/:table_name/:policy_name', async (c) => {
        const all = await kvFor(c.get('tenant')).getJson<Array<{ tableName: string; policyName: string }>>('rls_metadata', []);
        const found = all.find((item) =>
            item.tableName === c.req.param('table_name') && item.policyName === c.req.param('policy_name'));
        return c.json({ success: true, data: found ?? null, error: null });
    });

    app.post('/api/database/rls/metadata/', async (c) => {
        const body = await c.req.json().catch(() => ({})) as {
            tableName?: string;
            policyName?: string;
            formData?: Record<string, unknown>;
            generatedUsing?: string | null;
            generatedCheck?: string | null;
        };
        const kv = kvFor(c.get('tenant'));
        const all = await kv.getJson<Array<Record<string, unknown>>>('rls_metadata', []);
        const index = all.findIndex((item) =>
            item.tableName === body.tableName && item.policyName === body.policyName);
        const hash = sqlHash(body.generatedUsing);
        const entry = {
            ...body,
            tableName: body.tableName,
            policyName: body.policyName,
            formData: body.formData ?? {},
            generatedUsing: body.generatedUsing ?? null,
            generatedCheck: body.generatedCheck ?? null,
            sqlHash: hash,
        };
        if (index >= 0) all[index] = entry;
        else all.push(entry);
        await kv.setJson('rls_metadata', all, '');
        return c.json({
            success: true,
            data: { tableName: body.tableName, policyName: body.policyName, sqlHash: hash },
            error: null,
        });
    });

    app.delete('/api/database/rls/metadata/:table_name/:policy_name', async (c) => {
        const kv = kvFor(c.get('tenant'));
        const all = await kv.getJson<Array<{ tableName: string; policyName: string }>>('rls_metadata', []);
        await kv.setJson('rls_metadata', all.filter((item) =>
            !(item.tableName === c.req.param('table_name') && item.policyName === c.req.param('policy_name'))), '');
        return c.json({ success: true, message: 'Metadata deleted', error: null });
    });

    app.post('/api/database/rls/metadata/verify/', async (c) => {
        // Product parity: validate request body with Zod and return 422 Pydantic-style errors
        const zVerifyRlsRequest = z.object({
            tableName: z.string(),
            policyName: z.string(),
            currentUsing: z.string().nullable().optional(),
        });
        const parsed = zVerifyRlsRequest.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) {
            return c.json(zodToPydanticError(parsed.error), 422);
        }
        // RLS metadata is Builder form state (local KV), not provider state — it must
        // remain accessible without a Supabase connection, so no supabaseFor() guard here.
        const all = await kvFor(c.get('tenant')).getJson<Array<{
            tableName?: string;
            policyName?: string;
            sqlHash?: string;
            formData?: Record<string, unknown>;
        }>>('rls_metadata', []);
        const found = all.find((entry) =>
            entry.tableName === parsed.data.tableName && entry.policyName === parsed.data.policyName);
        const verified = Boolean(found) && sqlHash(parsed.data.currentUsing) === found?.sqlHash;
        return c.json({
            success: true,
            data: {
                hasMetadata: Boolean(found),
                isVerified: verified,
                reason: found ? (verified ? 'match' : 'modified_externally') : 'no_metadata',
                ...(verified ? { formData: found?.formData ?? {} } : {}),
            },
            error: null,
        });
    });
}
