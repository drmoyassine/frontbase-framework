/**
 * DbRunner factories (M-DB.0, Decision B1/B9) — the single seam every host uses
 * to obtain a DbRunner, regardless of backend. The console store, migrations,
 * and the public-data providers all consume these. RULE 6: one source of truth —
 * no hand-rolled drivers elsewhere.
 *
 *   sqliteRunner(url)            — :memory: / file: / libsql:// (Turso) via @libsql/client
 *   d1RunnerFromBinding(binding) — a Cloudflare D1 binding (env.DB), the CF default
 *   d1RunnerFromRest(opts)       — D1 REST API (accountId/databaseId/apiToken)
 *
 * `exec` returns affected-rows count where the driver reports it (A-17 portable).
 */
import { createClient, type Client } from '@libsql/client';
import type { DbRunner } from './types.js';

/** A libsql client as a DbRunner (:memory:, file:, libsql://). */
export function sqliteRunner(url: string, authToken?: string): DbRunner {
    return libsqlRunner(createClient({ url, authToken }));
}

/** Build a DbRunner from an existing libsql client (shared by sqliteRunner + turso). */
export function libsqlRunner(client: Client): DbRunner {
    return {
        async query(sql, params = []) {
            const res = await client.execute({ sql, args: params as never[] });
            return res.rows as Record<string, unknown>[];
        },
        async exec(sql, params = []) {
            const res = await client.execute({ sql, args: params as never[] });
            return res.rowsAffected ?? 0;
        },
    };
}

/** A Cloudflare D1 binding (env.DB) as a DbRunner — the CF default (B2/B3). */
export function d1RunnerFromBinding(binding: D1Database): DbRunner {
    return {
        async query(sql, params = []) {
            const ps = binding.prepare(sql);
            const stmt = params.length ? ps.bind(...params) : ps;
            const { results } = await stmt.all();
            return (results ?? []) as Record<string, unknown>[];
        },
        async exec(sql, params = []) {
            const ps = binding.prepare(sql);
            const stmt = params.length ? ps.bind(...params) : ps;
            const res = await stmt.run();
            // The CF runtime returns meta.changes as a NUMBER; some @cloudflare
            // /workers-types versions type it as { count }. Handle both so the
            // affected-row count is correct at runtime (the old `.changes.count`
            // silently returned 0 against the real number-shaped runtime).
            const changes = res.meta?.changes as number | { count?: number } | undefined;
            return (typeof changes === 'number' ? changes : changes?.count) ?? 0;
        },
    };
}

export interface D1RestOpts { accountId: string; databaseId: string; apiToken: string; }

/** D1 over the REST API (when no binding is available, e.g. from a non-Worker host). */
export function d1RunnerFromRest(opts: D1RestOpts): DbRunner {
    const url = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/d1/database/${opts.databaseId}/query`;
    const headers = { authorization: `Bearer ${opts.apiToken}`, 'content-type': 'application/json' };
    return {
        async query(sql, params = []) {
            const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql, params }) });
            const json = await res.json() as { success: boolean; result?: Array<{ results: Record<string, unknown>[] }> };
            if (!json.success) throw new Error('d1_query_failed');
            return json.result?.[0]?.results ?? [];
        },
        async exec(sql, params = []) {
            const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql, params }) });
            const json = await res.json() as { success: boolean; result?: Array<{ meta?: { changes?: { count?: number } } }> };
            if (!json.success) throw new Error('d1_exec_failed');
            return json.result?.[0]?.meta?.changes?.count ?? 0;
        },
    };
}
