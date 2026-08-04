/**
 * CF-22 Gate 1a — the response shapes the edge tags share.
 *
 * Every edge resource tag (engines, databases, caches, queues, vectors) answers
 * with the same three families, and each family was independently re-invented per
 * module during P2 — which is how they independently drifted from the contract.
 * The conformance probe found the same three mistakes repeated across tags:
 * batch results returning a boolean where the contract wants the list of processed
 * ids, test results omitting the required `message`, and create/update returning
 * `{id, name}` or `{success: true}` instead of the full resource.
 *
 * One definition each, so a fix lands everywhere at once.
 */

/** {success: [ids processed], failed: [...], total} — `success` is a LIST, not a flag. */
export function batchResult(succeeded: string[], failed: unknown[] = []): Record<string, unknown> {
    return { success: succeeded, failed, total: succeeded.length + failed.length };
}

/** {success, message, latency_ms} — `message` is required; never omit it. */
export function testResult(success: boolean, message: string, latencyMs: number | null = null): Record<string, unknown> {
    return { success, message, latency_ms: latencyMs };
}

function parseConfig(raw: unknown): Record<string, unknown> {
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    }
    catch { return {}; }
}

/**
 * A stored `edge_resources` row → the tag's `Edge*Response` schema.
 * `urlField` is the only structural difference between the tags
 * (`db_url` / `cache_url` / `queue_url` / `vector_url`); `extra` carries the
 * per-tag optionals (queues' `has_signing_key`, databases' `schema_name`, ...).
 */
export function serializeEdgeResource(
    row: Record<string, unknown>,
    urlField: string,
    extra: Record<string, unknown> = {},
): Record<string, unknown> {
    const config = parseConfig(row.config);
    const response: Record<string, unknown> = {
        id: String(row.id),
        name: String(row.name ?? ''),
        provider: String(row.provider ?? 'local'),
        [urlField]: String(config.url ?? ''),
        has_token: Boolean(config.token),
        is_default: Boolean(config.is_default),
        is_system: Boolean(row.is_system),
        supports_remote_delete: false,
        engine_count: 0,
        linked_engines: [],
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? ''),
        ...extra,
    };
    // Only include provider_account_id and account_name when they have values (product parity)
    if (config.provider_account_id != null) {
        response.provider_account_id = String(config.provider_account_id);
    }
    // account_name is derived from provider_account_id in product; only include when set
    if (config.account_name != null) {
        response.account_name = String(config.account_name);
    }
    return response;
}

/**
 * Engines are the one tag with a genuinely different shape — `url` rather than
 * `<kind>_url`, plus `adapter_type` and `is_active`, all required.
 */
export function serializeEngine(row: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
    const config = parseConfig(row.config);
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        edge_provider_id: config.edge_provider_id ?? null,
        provider: row.provider ?? null,
        adapter_type: String(config.adapter_type ?? row.provider ?? 'full'),
        url: String(config.url ?? ''),
        edge_db_id: config.edge_db_id ?? null,
        edge_db_name: null,
        edge_cache_id: config.edge_cache_id ?? null,
        edge_cache_name: null,
        edge_queue_id: config.edge_queue_id ?? null,
        edge_queue_name: null,
        edge_auth_id: config.edge_auth_id ?? null,
        datasource_ids: Array.isArray(config.datasource_ids) ? config.datasource_ids : [],
        storage_ids: Array.isArray(config.storage_ids) ? config.storage_ids : [],
        datasources: [],
        storages: [],
        engine_config: config,
        gpu_models: [],
        is_active: String(row.status ?? 'active') === 'active',
        is_system: Boolean(row.is_system),
        is_imported: false,
        is_shared: false,
        move_status: null,
        moved_out_at: null,
        bundle_checksum: null,
        config_checksum: null,
        last_deployed_at: null,
        last_synced_at: null,
        sync_status: 'unknown',
        is_outdated: false,
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? ''),
        ...extra,
    };
}

/**
 * The system edge — the worker the whole deployment runs on. Unlike stored
 * engines (real `edge_resources` rows a tenant connects), the system edge is
 * synthesized per request: it IS this worker, so its provider/bindings are a
 * property of where it's deployed, not a stored row.
 *
 * CF-22: previously this was an inline phantom in `GET /api/edge-engines/` with
 * `provider: null` and the product's docker-edge bindings hardcoded
 * (`Local SQLite`/`Local Redis`/`Local BullMQ`), was missing from the
 * `active/by-scope` publish-target listing, and was unresolvable by every
 * publish path. The host (the worker entry) owns the descriptor — it knows the
 * platform (Cloudflare now; Deno/Vercel/Netlify worker entries later) and the
 * real binding the runtime uses (D1). See `SYSTEM_ENGINE_ID` for why the id is
 * a constant.
 */
export const SYSTEM_ENGINE_ID = 'local-edge';

export const isSystemEngine = (id: unknown): boolean => typeof id === 'string' && id === SYSTEM_ENGINE_ID;

export interface SystemEdgeDescriptor {
    /** Where this worker is deployed. Cloudflare today; deno/vercel/netlify later. */
    provider: string;
    /** Display name. Defaults to "Local Edge". */
    name?: string;
    /** Real binding labels shown on the engine card. `null`/omitted → "None". */
    db?: string | null;
    cache?: string | null;
    queue?: string | null;
}

/**
 * Build the system edge engine for the current request. `origin` is the live
 * worker origin (from `c.req.url`) so page preview links resolve to this worker.
 */
export function buildSystemEngine(desc: SystemEdgeDescriptor, origin: string): Record<string, unknown> {
    const engine = serializeEngine({
        id: SYSTEM_ENGINE_ID,
        name: desc.name ?? 'Local Edge',
        provider: desc.provider,
        status: 'active',
        is_system: true,
        config: { adapter_type: 'full', url: origin, edge_db_id: 'system-d1' },
        created_at: '',
        updated_at: '',
    });
    // serializeEngine leaves the binding names null; fill them from the descriptor
    // so the card reflects THIS deployment (D1) rather than product defaults.
    engine.edge_db_name = desc.db ?? null;
    engine.edge_cache_name = desc.cache ?? null;
    engine.edge_queue_name = desc.queue ?? null;
    return engine;
}
