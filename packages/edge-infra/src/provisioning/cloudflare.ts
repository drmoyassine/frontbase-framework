/**
 * Edge-resource provisioning (Phase 3a / F5). Creates real resources on the
 * provider when credentials are configured.
 *
 * Cloudflare is implemented via the Management REST API (plain fetch — no SDK):
 *   - database → D1 database   (POST /accounts/{id}/d1/database)
 *   - cache    → KV namespace  (POST /accounts/{id}/storage/kv/namespaces)
 *   - queue    → Queue         (POST /accounts/{id}/workers/queues)
 *
 * RULE 1: server-only — the API token never enters a browser bundle.
 * RULE 4: provisioning errors surface opaquely (the caller maps them to a code).
 *
 * `engine` and `vector` kinds have no single clean CF equivalent (engine = a
 * Worker deployment; vector = Vectorize) — they return `unsupported_kind` so the
 * caller can fall back to config-only storage. Supabase provisioning is a
 * follow-up (different auth flow).
 */
export interface ProvisionResult {
    provisioned: boolean;
    /** Provider-native id of the created resource (e.g. the D1 database_id). */
    remoteId?: string;
    /** Extra info to merge into the resource config (e.g. the binding advice). */
    info?: Record<string, unknown>;
}

export interface Provisioner {
    /** Create a real resource for the given kind/name. Returns unsupported_kind if not handled. */
    create(kind: string, name: string): Promise<ProvisionResult>;
    /** Delete a real resource. Best-effort. */
    remove(kind: string, remoteId: string): Promise<void>;
    /** Whether this provisioner handles the given kind. */
    handles(kind: string): boolean;
}

export interface CloudflareProvisionerOpts {
    accountId: string;
    apiToken: string;
}

const CF_BASE = 'https://api.cloudflare.com/client/v4';

/** A Cloudflare provisioner over the Management REST API. */
export function cloudflareProvisioner(opts: CloudflareProvisionerOpts): Provisioner {
    const headers = { authorization: `Bearer ${opts.apiToken}`, 'content-type': 'application/json' };
    const account = opts.accountId;

    const cf = async (path: string, method: string, body?: unknown) => {
        const resp = await fetch(`${CF_BASE}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const json = await resp.json().catch(() => null) as { success?: boolean; result?: unknown; errors?: unknown } | null;
        if (!resp.ok || !json?.success) {
            throw new Error(`cf_api_failed:${resp.status}`);
        }
        return json.result as Record<string, unknown> | undefined;
    };

    return {
        handles(kind: string) {
            return kind === 'database' || kind === 'cache' || kind === 'queue';
        },

        async create(kind: string, name: string): Promise<ProvisionResult> {
            if (kind === 'database') {
                const r = await cf(`/accounts/${account}/d1/database`, 'POST', { name });
                return { provisioned: true, remoteId: String(r?.uuid ?? ''), info: { provider: 'd1', size_bytes: r?.file_size } };
            }
            if (kind === 'cache') {
                const r = await cf(`/accounts/${account}/storage/kv/namespaces`, 'POST', { title: name });
                return { provisioned: true, remoteId: String(r?.id ?? ''), info: { provider: 'kv' } };
            }
            if (kind === 'queue') {
                const r = await cf(`/accounts/${account}/workers/queues`, 'POST', { name });
                return { provisioned: true, remoteId: String(r?.name ?? name), info: { provider: 'queues' } };
            }
            return { provisioned: false };
        },

        async remove(kind: string, remoteId: string): Promise<void> {
            if (kind === 'database') {
                await cf(`/accounts/${account}/d1/database/${remoteId}`, 'DELETE');
            } else if (kind === 'cache') {
                await cf(`/accounts/${account}/storage/kv/namespaces/${remoteId}`, 'DELETE');
            } else if (kind === 'queue') {
                await cf(`/accounts/${account}/workers/queues/${remoteId}`, 'DELETE');
            }
        },
    };
}

/** A no-op provisioner (dev/default) — resources are config-only. */
export const noopProvisioner: Provisioner = {
    handles: () => false,
    async create() { return { provisioned: false }; },
    async remove() { /* no-op */ },
};
