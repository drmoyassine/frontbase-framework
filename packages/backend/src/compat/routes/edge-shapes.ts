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
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        provider: String(row.provider ?? 'local'),
        [urlField]: String(config.url ?? ''),
        has_token: Boolean(config.token),
        is_default: Boolean(config.is_default),
        is_system: false,
        supports_remote_delete: false,
        account_name: null,
        provider_account_id: null,
        engine_count: 0,
        linked_engines: [],
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? ''),
        ...extra,
    };
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
        adapter_type: String(config.adapter_type ?? row.provider ?? 'cloudflare'),
        url: String(config.url ?? ''),
        is_active: String(row.status ?? 'active') === 'active',
        is_imported: false,
        is_outdated: false,
        is_shared: false,
        is_system: false,
        provider: row.provider ?? null,
        datasource_ids: [],
        datasources: [],
        storage_ids: [],
        storages: [],
        gpu_models: [],
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? ''),
        ...extra,
    };
}
