/**
 * Supabase resource strategy.
 *
 * discover:   Bearer GET /v1/projects → per-project best-effort lookup of the
 *             Supavisor transaction-mode pooler connection_string → db_url.
 * listEngines: Bearer GET /v1/projects/{project_ref}/functions → edge functions.
 *
 * Ported from the product reference:
 *   - app/services/provider_discovery.py :: _discover_supabase
 *   - app/services/provider_discovery.py :: _fetch_supabase_pooler_uri
 *   - app/services/engine_lister.py      :: _list_supabase_engines
 *   - app/services/engine_lister.py      :: _epoch_to_iso
 *
 * Field names match the product EXACTLY so the SPA's dedupe on db_url keeps
 * working (field-name drift silently breaks dedupe).
 */
import type {
    ProviderResourceStrategy,
    DiscoveryResult,
    ListEnginesResult,
    DiscoveredResource,
    EngineInfo,
} from '../types.js';
import { guardedExternalFetch } from '../../../../external-http.js';
import type { CompatFetch } from '../../../../external-http.js';

const SUPABASE_API = 'https://api.supabase.com/v1';

export function createSupabaseResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    async function discover(credentials: Record<string, unknown>): Promise<DiscoveryResult> {
        const accessToken = String(credentials.access_token ?? '');
        if (!accessToken) {
            return { success: false, detail: 'Credentials not available' };
        }
        const lockedRef = String(credentials.project_ref ?? '');

        let projectsResp: Response;
        try {
            projectsResp = await guardedExternalFetch(externalFetch, `${SUPABASE_API}/projects`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
        } catch (err) {
            return { success: false, detail: `Supabase discovery failed: ${errMsg(err)}` };
        }
        if (projectsResp.status !== 200) {
            return { success: false, detail: `Supabase API error: ${projectsResp.status}` };
        }
        let projectsJson: unknown;
        try {
            projectsJson = await projectsResp.json();
        } catch (err) {
            return { success: false, detail: `Supabase discovery failed: ${errMsg(err)}` };
        }
        if (!Array.isArray(projectsJson)) {
            return { success: true, resources: [] };
        }

        // If a project_ref was locked at connection time, narrow to that project.
        const visibleProjects = lockedRef
            ? projectsJson.filter((p) => plainObj(p)?.id === lockedRef)
            : projectsJson;

        const resources: DiscoveredResource[] = [];
        for (const raw of visibleProjects) {
            const project = plainObj(raw);
            if (!project) continue;
            const ref = String(project.id ?? '');
            const entry: DiscoveredResource = {
                id: ref,
                ref,
                name: String(project.name ?? ''),
                type: 'supabase_project',
                region: String(project.region ?? ''),
                status: String(project.status ?? ''),
            };

            // Best-effort pooler URI (Supavisor transaction mode) → db_url.
            // Only emitted when the pooler lookup resolves a connection string.
            if (ref && accessToken) {
                try {
                    const uri = await fetchPoolerUri(externalFetch, accessToken, ref);
                    if (uri) {
                        entry.db_url = uri;
                    }
                } catch {
                    // Pooler lookup is best-effort; swallow and continue.
                }
            }
            resources.push(entry);
        }

        return { success: true, resources };
    }

    async function listEngines(credentials: Record<string, unknown>): Promise<ListEnginesResult> {
        const accessToken = String(credentials.access_token ?? '');
        const projectRef = String(credentials.project_ref ?? '');
        if (!accessToken || !projectRef) {
            return { success: false, detail: 'Credentials not available' };
        }

        let resp: Response;
        try {
            resp = await guardedExternalFetch(
                externalFetch,
                `${SUPABASE_API}/projects/${encodeURIComponent(projectRef)}/functions`,
                { headers: { Authorization: `Bearer ${accessToken}` } },
            );
        } catch (err) {
            return { success: false, detail: `Supabase engine listing failed: ${errMsg(err)}` };
        }
        if (resp.status !== 200) {
            return { success: false, detail: `Supabase API error: ${resp.status}` };
        }
        let functionsJson: unknown;
        try {
            functionsJson = await resp.json();
        } catch (err) {
            return { success: false, detail: `Supabase engine listing failed: ${errMsg(err)}` };
        }
        if (!Array.isArray(functionsJson)) {
            return { success: true, engines: [] };
        }

        const engines: EngineInfo[] = functionsJson
            .map((f) => plainObj(f))
            .filter((f): f is Record<string, unknown> => f !== null)
            .map((f) => {
                const slug = String(f.slug ?? '');
                return {
                    name: String(f.name ?? slug ?? ''),
                    url: `https://${projectRef}.supabase.co/functions/v1/${slug}`,
                    provider: 'supabase',
                    deployed_at: epochToIso(f.updated_at),
                    created_at: epochToIso(f.created_at),
                };
            });

        return { success: true, engines };
    }

    return { provider: 'supabase', discover, listEngines };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the Supavisor pooler connection_string for a project, preferring the
 * transaction-mode pooler. Ports product::_fetch_supabase_pooler_uri through
 * the guarded fetch seam. The password placeholder ([YOUR-PASSWORD]) is left
 * intact — discovery does not receive a db_password, matching the product.
 */
async function fetchPoolerUri(
    externalFetch: CompatFetch,
    accessToken: string,
    projectRef: string,
): Promise<string | undefined> {
    const resp = await guardedExternalFetch(
        externalFetch,
        `${SUPABASE_API}/projects/${encodeURIComponent(projectRef)}/config/database/pooler`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (resp.status !== 200) {
        return undefined;
    }
    const data: unknown = await resp.json();
    return extractPoolerUri(data);
}

/**
 * Pick the transaction-mode pooler connection_string, falling back to the
 * first entry. Mirrors the precedence in product::_fetch_supabase_pooler_uri.
 */
function extractPoolerUri(data: unknown): string | undefined {
    if (Array.isArray(data)) {
        const entries = data
            .map((e) => plainObj(e))
            .filter((e): e is Record<string, unknown> => e !== null);
        const txn = entries.find(
            (e) => e.pool_mode === 'transaction' || e.mode === 'transaction',
        );
        const txnUri = readConnString(txn);
        if (txnUri) return txnUri;
        return readConnString(entries[0]);
    }
    return readConnString(plainObj(data) ?? undefined);
}

function readConnString(e: Record<string, unknown> | undefined): string | undefined {
    if (!e) return undefined;
    const v = e.connection_string ?? e.connectionString ?? e.uri;
    if (typeof v === 'string' && v) return v;
    return undefined;
}

/** Coerce an unknown JSON value to a plain object record, or null. */
function plainObj(v: unknown): Record<string, unknown> | null {
    return v && typeof v === 'object' && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
}

/**
 * Convert a Supabase epoch (seconds / milliseconds / microseconds) or string
 * to an ISO timestamp. Ports product::_epoch_to_iso. JS Date is millisecond
 * resolution, so sub-millisecond precision from the Python path is truncated.
 */
function epochToIso(val: unknown): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number') {
        let ts = val;
        if (ts > 1e15) ts = ts / 1e6; // microseconds
        else if (ts > 1e12) ts = ts / 1e3; // milliseconds
        try {
            return new Date(ts * 1000).toISOString();
        } catch {
            return String(val);
        }
    }
    return String(val);
}

function errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
