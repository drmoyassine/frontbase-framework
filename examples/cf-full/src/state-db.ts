/**
 * State-db resolver (A-24) — the one seam where a host entry turns its
 * environment into the engine's `runner`, choosing among the DbRunner
 * factories in @frontbase/edge-infra (RULE 6: no host-local
 * drivers here). Every host entry (worker/node/deno/vercel) calls this
 * instead of binding a runner directly, so the operator — not the adapter —
 * picks the state database, on any host. Frontbase Cloud uses the explicit
 * Hyperdrive binding to reach its Supabase PostgreSQL application database.
 *
 * HONEST MENU (why not "any database"): the application schema and queries are
 * verified for SQLite and PostgreSQL. The schema fingerprint helper remains
 * SQLite-only and is not used by production boot. Supported selections are:
 *
 *   d1-binding     Cloudflare D1 via env.DB                — the CF default
 *   d1-rest        Cloudflare D1 over the REST API         — works on ANY host
 *   sqlite-file    SQLite on disk (node-family/Docker)     — file: URL
 *   sqlite-memory  SQLite in memory (ephemeral)            — :memory:
 *   libsql-remote  libSQL over HTTP (Turso, self-hosted    — libsql:// or
 *                  sqld; HRANA over fetch)                   https://
 *   postgres-hyperdrive  PostgreSQL/Supabase through a     — env.HYPERDRIVE
 *                        Cloudflare Hyperdrive binding
 *
 * Precedence (first match wins; exactly one runner is built; the kind is
 * logged once at boot by the caller):
 *   1. CLOUD MODE (FRONTBASE_DEPLOYMENT_MODE=cloud) + Hyperdrive binding
 *                                → postgresStateRunner(connectionString)
 *   2. APP_DB_URL set            → sqliteRunner(url, APP_DB_AUTH_TOKEN)
 *   3. D1-REST trio complete     → d1RunnerFromRest(...)
 *   4. partial D1-REST trio, or APP_DB_AUTH_TOKEN without APP_DB_URL
 *                                → StateDbConfigError naming the missing var(s)
 *   5. d1Binding present (CF)    → d1RunnerFromBinding — byte-identical to the
 *                                  pre-A-24 CF behavior when no APP_DB_* is set
 *   6. host node                 → file:/data/app.db (the Docker default)
 *      host deno/vercel          → StateDbConfigError listing accepted forms
 *
 * The cloud-mode gate on Hyperdrive is deliberate: the committed wrangler.toml
 * ships the Cloud deployment's Hyperdrive binding, and the same file is the
 * documented self-host reuse path. Without the gate a self-host reusing it —
 * and every local `wrangler dev` — would silently adopt the cloud state plane
 * (in dev: a hang connecting to a database that does not exist). Matches the
 * worker's own rule: FRONTBASE_DEPLOYMENT_MODE absent ⇒ self-host, which never
 * boots cloud anything.
 *
 * Secrets: APP_DB_AUTH_TOKEN and CLOUDFLARE_API_TOKEN are credentials — they
 * are passed straight into the runner factories and are NEVER copied into
 * `label`, `displayUrl`, or any error message (the no-leak gate asserts this).
 */
import {
    d1RunnerFromBinding,
    d1RunnerFromRest,
    postgresStateRunner,
    sqliteRunner,
    type DbRunner,
} from '@frontbase/edge-infra';

export type StateDbKind =
    | 'd1-binding'
    | 'd1-rest'
    | 'sqlite-file'
    | 'sqlite-memory'
    | 'libsql-remote'
    | 'postgres-hyperdrive';

export type StateDbHost = 'cloudflare' | 'node' | 'deno' | 'vercel';

export interface ResolvedStateDb {
    runner: DbRunner;
    kind: StateDbKind;
    /** Human label for systemEdge.db / systemResources.database.name. */
    label: string;
    /** Actual connection spec handed to the runner (file:…, :memory:, libsql://…; '' for D1 kinds). */
    url: string;
    /** Safe to print on the system card — a path/URL/database id, never a credential. */
    displayUrl: string;
    /** systemResources.database card for this state DB (platform-truthful provider). */
    card: { provider: string; name: string; url: string };
}

/** Thrown for a HALF-configured state DB — fail at boot, never at first write. */
export class StateDbConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StateDbConfigError';
    }
}

const D1_REST_VARS = ['APP_DB_D1_ACCOUNT_ID', 'APP_DB_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'] as const;

function libsqlCard(url: string): ResolvedStateDb['card'] {
    return { provider: 'sqlite', name: 'libSQL (remote)', url };
}

/** The resolver's DECISION — everything except the constructed runner.
 *  Pure: no client is built, no connection opened (the libsql client opens
 *  file: connections EAGERLY at construction, so the decision table must be
 *  separable from construction to stay unit-testable off Docker). */
export interface StateDbChoice extends Omit<ResolvedStateDb, 'runner'> {
    makeRunner: () => DbRunner;
}

/**
 * The pure decision table. Throws StateDbConfigError for a half-configured or
 * impossible configuration — exactly what resolveStateDb throws.
 */
export function describeStateDb(input: {
    env: Record<string, string | undefined>;
    d1Binding?: D1Database;
    hyperdriveBinding?: { connectionString: string };
    host: StateDbHost;
}): StateDbChoice {
    const { env, d1Binding, hyperdriveBinding, host } = input;
    const url = env.APP_DB_URL?.trim() || undefined;
    const token = env.APP_DB_AUTH_TOKEN?.trim() || undefined;
    const accountId = env.APP_DB_D1_ACCOUNT_ID?.trim() || undefined;
    const databaseId = env.APP_DB_D1_DATABASE_ID?.trim() || undefined;
    const apiToken = env.CLOUDFLARE_API_TOKEN?.trim() || undefined;

    // Frontbase Cloud's application state — cloud mode ONLY (see the
    // precedence note above). The binding carries a generated, short-lived
    // connection string; never expose it in labels or errors.
    if (env.FRONTBASE_DEPLOYMENT_MODE === 'cloud' && hyperdriveBinding?.connectionString) {
        return {
            kind: 'postgres-hyperdrive',
            label: 'Supabase PostgreSQL (Hyperdrive)',
            url: '',
            displayUrl: 'hyperdrive://application-state',
            card: { provider: 'supabase', name: 'Supabase PostgreSQL', url: 'hyperdrive://application-state' },
            makeRunner: () => postgresStateRunner({
                connectionString: hyperdriveBinding.connectionString,
                schema: env.FRONTBASE_POSTGRES_SCHEMA?.trim() || 'frontbase_cloud',
            }),
        };
    }

    // 1. Explicit URL selection — the operator's override, on any host.
    if (url) {
        if (url === ':memory:') {
            return {
                kind: 'sqlite-memory',
                label: 'SQLite (in-memory)',
                url,
                displayUrl: url,
                card: { provider: 'sqlite', name: 'SQLite (in-memory)', url },
                makeRunner: () => sqliteRunner(url),
            };
        }
        if (url.startsWith('file:')) {
            if (host === 'vercel') {
                throw new StateDbConfigError(
                    'APP_DB_URL file: is not usable on Vercel Edge (no filesystem). Set APP_DB_URL to libsql:// or https:// (Turso / HRANA), or use the D1-over-REST trio (APP_DB_D1_ACCOUNT_ID, APP_DB_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN).',
                );
            }
            if (host === 'deno') {
                throw new StateDbConfigError(
                    'APP_DB_URL file: is not usable on Deno Deploy (no writable persistent disk). Set APP_DB_URL to libsql:// or https:// (Turso / HRANA over fetch), or use the D1-over-REST trio (APP_DB_D1_ACCOUNT_ID, APP_DB_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN).',
                );
            }
            return {
                kind: 'sqlite-file',
                label: 'SQLite (libsql)',
                url,
                displayUrl: url,
                card: { provider: 'sqlite', name: 'SQLite (libsql)', url },
                makeRunner: () => sqliteRunner(url, token),
            };
        }
        // libsql:// / https:// / http:// / wss: / ws: — a remote libSQL server
        // (Turso, or self-hosted sqld speaking HRANA over fetch).
        return {
            kind: 'libsql-remote',
            label: 'libSQL (remote)',
            url,
            displayUrl: url,
            card: libsqlCard(url),
            makeRunner: () => sqliteRunner(url, token),
        };
    }

    // 2/3. D1 over REST — all three vars, or a loud failure naming what is
    // missing. Never a silent fallback: a half-configured state DB must fail
    // at boot, not at first write.
    const rest: Array<string | undefined> = [accountId, databaseId, apiToken];
    const present = rest.filter((v) => v !== undefined).length;
    if (present > 0) {
        if (present === 3) {
            return {
                kind: 'd1-rest',
                label: 'Cloudflare D1 (REST)',
                url: '',
                displayUrl: `D1 database ${databaseId}`,
                card: { provider: 'cloudflare', name: 'Cloudflare D1 (REST)', url: `d1://${databaseId}` },
                makeRunner: () => d1RunnerFromRest({ accountId: accountId!, databaseId: databaseId!, apiToken: apiToken! }),
            };
        }
        const missing = D1_REST_VARS.filter((name) => !env[name]?.trim());
        throw new StateDbConfigError(
            `Partial D1-over-REST configuration — missing ${missing.join(', ')}. Set all three, or none to fall back to the host default.`,
        );
    }
    if (token) {
        throw new StateDbConfigError(
            'APP_DB_AUTH_TOKEN is set without APP_DB_URL — the token alone does not select a database. Set APP_DB_URL to libsql:// or https://, or remove APP_DB_AUTH_TOKEN.',
        );
    }

    // 4. Cloudflare default: the D1 binding. Unchanged behavior when no
    // APP_DB_* var is set.
    if (d1Binding) {
        return {
            kind: 'd1-binding',
            label: 'Cloudflare D1',
            url: '',
            displayUrl: 'd1://system-d1',
            card: { provider: 'cloudflare', name: 'Cloudflare D1', url: 'd1://system-d1' },
            makeRunner: () => d1RunnerFromBinding(d1Binding),
        };
    }

    // 5. Host defaults / refusals.
    if (host === 'node') {
        const fileUrl = 'file:/data/app.db';
        return {
            kind: 'sqlite-file',
            label: 'SQLite (libsql)',
            url: fileUrl,
            displayUrl: fileUrl,
            card: { provider: 'sqlite', name: 'SQLite (libsql)', url: fileUrl },
            makeRunner: () => sqliteRunner(fileUrl),
        };
    }
    // (host is cloudflare/deno/vercel here — node returned with its default above.)
    const forms =
        host === 'cloudflare'
            ? 'Bind D1 as env.DB (wrangler.toml), or set APP_DB_URL (libsql://, https://, file:), or the D1-over-REST trio (APP_DB_D1_ACCOUNT_ID, APP_DB_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN).'
            : `Set APP_DB_URL (libsql:// or https:// for Turso / HRANA over fetch), or the D1-over-REST trio (APP_DB_D1_ACCOUNT_ID, APP_DB_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN).`;
    throw new StateDbConfigError(
        `No state database configured for the ${host} host. ${forms}`,
    );
}

/**
 * Resolve the state database for a host entry: the decision table plus the
 * constructed runner. `env` is the host's environment view (process.env on
 * node/deno/vercel, the binding object on Cloudflare); `d1Binding` is present
 * only on Cloudflare.
 */
export function resolveStateDb(input: {
    env: Record<string, string | undefined>;
    d1Binding?: D1Database;
    hyperdriveBinding?: { connectionString: string };
    host: StateDbHost;
}): ResolvedStateDb {
    const choice = describeStateDb(input);
    return { ...choice, runner: choice.makeRunner() };
}
