/**
 * State-db resolver contract (A-24), proven rather than assumed. The resolver
 * is the one seam every host entry uses to turn its environment into the
 * engine's `runner`, so these are the properties every host inherits:
 *
 *   1. Precedence — APP_DB_URL > D1-REST trio > D1 binding > host default;
 *      exactly one runner is built, first match wins.
 *   2. A HALF-configured state DB fails LOUD, naming the exact missing
 *      variable(s) — never a silent fallback (fail at boot, not first write).
 *   3. Host honesty — file: is refused on the no-filesystem edge hosts with
 *      the supported forms named; deno/vercel with nothing set refuse with
 *      the accepted forms; node keeps the Docker file: default.
 *   4. NO-LEAK — APP_DB_AUTH_TOKEN and CLOUDFLARE_API_TOKEN never appear in
 *      any label, displayUrl, card, or error message (the system card renders
 *      displayUrl; error text reaches the operator's browser).
 *
 * Pure unit level: runners are constructed but never connected — every case
 * asserts on the RESOLUTION (kind/label/url/displayUrl/card/runner shape).
 */
import { describeStateDb, resolveStateDb, StateDbConfigError } from '../dist/state-db.mjs';

const TOKEN = 'unit-test-auth-token-9f2a7c';
const API_TOKEN = 'unit-test-cf-api-token-31b8e0';

const FAKE_D1 = /** @type {import('@cloudflare/workers-types').D1Database} */ ({});
const envOf = (vars) => Object.freeze({ ...vars });
/** The pure decision table — no client constructed (a libsql file: URL opens
 *  its connection EAGERLY, so file: shapes are asserted on describeStateDb). */
const desc = (vars, host, d1Binding) =>
    describeStateDb({ env: envOf(vars), host, d1Binding });

let failures = 0;
const check = (label, fn) => {
    try {
        fn() ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`));
    } catch (e) {
        failures++;
        console.log(`  ❌ ${label} — threw: ${e?.message}`);
    }
};
const throwsWith = (label, fn, needles) => {
    let message = null;
    try { fn(); } catch (e) {
        if (!(e instanceof StateDbConfigError)) {
            failures++;
            console.log(`  ❌ ${label} — threw ${e?.constructor?.name}, expected StateDbConfigError`);
            return;
        }
        message = e.message;
    }
    const ok = message !== null && needles.every((n) => message.includes(n));
    ok ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label} — message: ${JSON.stringify(message)}`));
};
const noLeak = (resolved) =>
    !JSON.stringify({ label: resolved.label, displayUrl: resolved.displayUrl, card: resolved.card }).includes(TOKEN)
    && !JSON.stringify(resolved.card).includes(API_TOKEN);

console.log('\n=== state-db resolver: precedence (first match wins) ===');

check('APP_DB_URL=:memory: wins over a complete trio AND a D1 binding', () => {
    const r = resolveStateDb({
        env: envOf({ APP_DB_URL: ':memory:', APP_DB_D1_ACCOUNT_ID: 'a', APP_DB_D1_DATABASE_ID: 'd', CLOUDFLARE_API_TOKEN: API_TOKEN }),
        d1Binding: FAKE_D1, host: 'cloudflare',
    });
    return r.kind === 'sqlite-memory' && r.url === ':memory:' && r.displayUrl === ':memory:';
});
check('complete D1-REST trio wins over the D1 binding', () => {
    const r = resolveStateDb({
        env: envOf({ APP_DB_D1_ACCOUNT_ID: 'acct', APP_DB_D1_DATABASE_ID: 'dbid', CLOUDFLARE_API_TOKEN: API_TOKEN }),
        d1Binding: FAKE_D1, host: 'cloudflare',
    });
    return r.kind === 'd1-rest' && r.displayUrl === 'D1 database dbid'
        && r.card.provider === 'cloudflare' && r.card.url === 'd1://dbid';
});
check('D1 binding + no APP_DB_* → d1-binding (byte-identical CF default)', () => {
    const r = resolveStateDb({ env: envOf({}), d1Binding: FAKE_D1, host: 'cloudflare' });
    return r.kind === 'd1-binding' && r.displayUrl === 'd1://system-d1' && r.label === 'Cloudflare D1';
});
check('libsql:// + token → libsql-remote (Turso/HRANA shape), runner constructed lazily', () => {
    const r = resolveStateDb({ env: envOf({ APP_DB_URL: 'libsql://db-tenant.turso.io', APP_DB_AUTH_TOKEN: TOKEN }), host: 'vercel' });
    return r.kind === 'libsql-remote' && r.displayUrl === 'libsql://db-tenant.turso.io'
        && typeof r.runner.query === 'function' && typeof r.runner.exec === 'function';
});
check('https:// URL → libsql-remote (self-hosted sqld)', () =>
    desc({ APP_DB_URL: 'https://sqld.example.internal' }, 'deno').kind === 'libsql-remote');
check('file: on node → sqlite-file (pure decision — no connection opened)', () => {
    const c = desc({ APP_DB_URL: 'file:/data/app.db' }, 'node');
    return c.kind === 'sqlite-file' && c.displayUrl === 'file:/data/app.db'
        && typeof c.makeRunner === 'function';
});
check('node with NO env → the Docker default file:/data/app.db (pure decision)', () => {
    const c = desc({}, 'node');
    return c.kind === 'sqlite-file' && c.url === 'file:/data/app.db' && c.displayUrl === 'file:/data/app.db';
});
check('resolveStateDb = describe + construct (:memory: builds a working runner)', () => {
    const r = resolveStateDb({ env: envOf({ APP_DB_URL: ':memory:' }), host: 'node' });
    return r.kind === 'sqlite-memory' && typeof r.runner.query === 'function' && typeof r.runner.exec === 'function';
});

console.log('\n=== state-db resolver: half-configured fails loud, naming the var ===');
throwsWith('trio missing CLOUDFLARE_API_TOKEN', () =>
    resolveStateDb({ env: envOf({ APP_DB_D1_ACCOUNT_ID: 'a', APP_DB_D1_DATABASE_ID: 'd' }), host: 'vercel' }),
    ['CLOUDFLARE_API_TOKEN']);
throwsWith('trio missing APP_DB_D1_DATABASE_ID', () =>
    resolveStateDb({ env: envOf({ APP_DB_D1_ACCOUNT_ID: 'a', CLOUDFLARE_API_TOKEN: API_TOKEN }), host: 'deno' }),
    ['APP_DB_D1_DATABASE_ID']);
throwsWith('trio missing APP_DB_D1_ACCOUNT_ID', () =>
    resolveStateDb({ env: envOf({ APP_DB_D1_DATABASE_ID: 'd', CLOUDFLARE_API_TOKEN: API_TOKEN }), host: 'vercel' }),
    ['APP_DB_D1_ACCOUNT_ID']);
throwsWith('whitespace-only vars count as unset (trim)', () =>
    resolveStateDb({ env: envOf({ APP_DB_D1_ACCOUNT_ID: 'a', APP_DB_D1_DATABASE_ID: '  ', CLOUDFLARE_API_TOKEN: API_TOKEN }), host: 'vercel' }),
    ['APP_DB_D1_DATABASE_ID']);
throwsWith('APP_DB_AUTH_TOKEN without APP_DB_URL names APP_DB_URL', () =>
    resolveStateDb({ env: envOf({ APP_DB_AUTH_TOKEN: TOKEN }), host: 'deno' }),
    ['APP_DB_URL', 'APP_DB_AUTH_TOKEN']);

console.log('\n=== state-db resolver: host honesty (no fs on the edge) ===');
throwsWith('file: refused on vercel, supported forms named', () =>
    resolveStateDb({ env: envOf({ APP_DB_URL: 'file:/tmp/x.db' }), host: 'vercel' }),
    ['Vercel', 'libsql://', 'APP_DB_D1_ACCOUNT_ID']);
throwsWith('file: refused on deno, HRANA named', () =>
    resolveStateDb({ env: envOf({ APP_DB_URL: 'file:/tmp/x.db' }), host: 'deno' }),
    ['Deno', 'HRANA', 'libsql://']);
throwsWith('deno with nothing set lists accepted forms', () =>
    resolveStateDb({ env: envOf({}), host: 'deno' }),
    ['No state database configured for the deno host', 'APP_DB_URL', 'libsql://']);
throwsWith('vercel with nothing set lists accepted forms', () =>
    resolveStateDb({ env: envOf({}), host: 'vercel' }),
    ['No state database configured for the vercel host', 'APP_DB_D1_DATABASE_ID']);
throwsWith('cloudflare WITHOUT a binding lists its own forms (incl. file:)', () =>
    resolveStateDb({ env: envOf({}), host: 'cloudflare' }),
    ['cloudflare', 'env.DB', 'APP_DB_URL']);

console.log('\n=== state-db resolver: NO-LEAK (credentials never leave the runner) ===');
check('libsql-remote: token absent from label/displayUrl/card', () => {
    const r = resolveStateDb({ env: envOf({ APP_DB_URL: 'libsql://db.turso.io', APP_DB_AUTH_TOKEN: TOKEN }), host: 'vercel' });
    return noLeak(r);
});
check('d1-rest: api token absent from label/displayUrl/card', () => {
    const r = resolveStateDb({
        env: envOf({ APP_DB_D1_ACCOUNT_ID: 'acct', APP_DB_D1_DATABASE_ID: 'dbid', CLOUDFLARE_API_TOKEN: API_TOKEN }),
        host: 'vercel',
    });
    return r.kind === 'd1-rest' && noLeak(r);
});
check('trio error message carries no token', () => {
    try {
        resolveStateDb({ env: envOf({ APP_DB_D1_ACCOUNT_ID: 'a', CLOUDFLARE_API_TOKEN: API_TOKEN }), host: 'vercel' });
        return false;
    } catch (e) {
        return e instanceof StateDbConfigError && !e.message.includes(API_TOKEN);
    }
});
check('token-without-URL error carries no token', () => {
    try {
        resolveStateDb({ env: envOf({ APP_DB_AUTH_TOKEN: TOKEN }), host: 'vercel' });
        return false;
    } catch (e) {
        return e instanceof StateDbConfigError && !e.message.includes(TOKEN);
    }
});

console.log(`\n=== state-db resolver: ${failures === 0 ? 'ALL PASSED ✅' : `${failures} FAILURE(S) ❌`} ===`);
process.exit(failures === 0 ? 0 : 1);
