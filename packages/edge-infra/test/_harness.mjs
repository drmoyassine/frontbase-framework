/**
 * Shared test harness — the parameterized provider gate (A-17 §4). Both
 * providers.mjs (basic contract) and isolation.mjs (cross-tenant headline) call
 * these against a provider, so SQLite and any credential-gated cloud provider
 * run the IDENTICAL assertions.
 */
import { asDataProvider } from '../dist/providers/base.js';

export function manifestFor() {
    return {
        version: 'test',
        pages: {},
        queries: {
            'docs.list': {
                queryId: 'docs.list', scope: 'tenant',
                async execute(_p, ctx) {
                    // A-17: app-level WHERE tenant = ctx.tenant (parameterized), with
                    // requireTenant as defense-in-depth behind the proxy's enforceScope.
                    const { requireTenant } = await import('../dist/providers/helpers.js');
                    const tenant = requireTenant(ctx);
                    return ctx.db.query('SELECT id, title, tenant FROM docs WHERE tenant = ?', [tenant]);
                },
            },
            'docs.public': {
                queryId: 'docs.public', scope: 'public',
                async execute(_p, ctx) { return ctx.db.query('SELECT id, title FROM docs', []); },
            },
        },
    };
}

export async function seed(db) {
    await db.exec('CREATE TABLE docs (id TEXT, title TEXT, tenant TEXT)');
    await db.exec('INSERT INTO docs VALUES (?,?,?)', ['a1', 'Alpha doc', 'tenant-A']);
    await db.exec('INSERT INTO docs VALUES (?,?,?)', ['a2', 'Second A', 'tenant-A']);
    await db.exec('INSERT INTO docs VALUES (?,?,?)', ['b1', 'Bravo doc', 'tenant-B']);
    await db.exec('INSERT INTO docs VALUES (?,?,?)', ['b2', 'Second B', 'tenant-B']);
}

/** Run `fn` against SQLite (always) + any credential-gated cloud provider present. */
export async function forEveryProvider(fn) {
    const cases = [
        { label: 'sqlite', make: (m) => make('sqlite', m), required: true },
        { label: 'd1', make: (m) => make('d1', m), env: ['D1_ACCOUNT_ID', 'D1_DATABASE_ID', 'D1_API_TOKEN'] },
        { label: 'turso', make: (m) => make('turso', m), env: ['TURSO_URL', 'TURSO_TOKEN'] },
        { label: 'postgres', make: (m) => make('postgres', m), env: ['POSTGRES_URL'] },
    ];
    for (const c of cases) {
        const present = c.required || (c.env && c.env.every((k) => process.env[k]));
        if (!present) { console.log(`— ${c.label}: credential-gated (set ${c.env.join(',')} to run identical gate)`); continue; }
        console.log(`— ${c.label}${c.required ? ' (CI reference, required)' : ' (credentials present)'} —`);
        const provider = await c.make(manifestFor());
        await fn(provider, c.label);
    }
}

async function make(driver, manifest) {
    const { buildDataProvider } = await import('../dist/providers/registry.js');
    const env = {
        sqlite: {},
        d1: { d1AccountId: process.env.D1_ACCOUNT_ID, d1DatabaseId: process.env.D1_DATABASE_ID, d1ApiToken: process.env.D1_API_TOKEN },
        turso: { tursoUrl: process.env.TURSO_URL, tursoAuthToken: process.env.TURSO_TOKEN },
        postgres: { postgresUrl: process.env.POSTGRES_URL },
    }[driver];
    return buildDataProvider(manifest, { driver, ...env });
}

export { asDataProvider };
