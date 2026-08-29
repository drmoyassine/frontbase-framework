/**
 * A-25 Phase 4 cloud smoke — boots the SAME full-CMS worker in-process with
 * `cloud: { baseDomain: 'frontbase.test' }` and drives it with explicit Host
 * headers, one host kind at a time:
 *
 *   tenant     acme/globex render THEIR OWN pages only (no cross-tenant read);
 *              unregistered + suspended slugs get the workspace-not-found 404;
 *              admin surfaces (incl. the /admin cloud console) and
 *              non-allowlisted /api/* are confined (404).
 *   app        the console host — `/` 302s to /admin, which serves the staged
 *              cloud console shell (console-dist/admin via the disk ASSETS
 *              shim — fail-closed unless `pnpm console:build -- --cloud` ran).
 *   reserved   api.frontbase.test → 404, never a site.
 *   apex       → 302 to the app host /admin.
 *   foreign    the canonical origin behaves like self-host (operator's _root).
 *
 * Also proves the principal-scoping fix: an acme member's session is valid on
 * acme but ANONYMOUS on globex (login is a cross-tenant email scan; without
 * scoping the cookie would satisfy another tenant's private-page gate).
 *
 * Seeding goes through the SAME stores the platform uses (TenantStore,
 * PagesStore, UserStore) over one shared runner — signup provisioning itself
 * is the backend suites' job; the SERVING plane is under test here.
 * Self-host invariance lives in smoke.ts (unmodified); this file asserts only
 * cloud-mode deltas. Signup→live goes green when WA3 lands (marked below).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqliteRunner, type DbRunner } from '@frontbase/edge-infra';
import { PagesStore, TenantStore, UserStore, seedOwner } from '@frontbase/backend';
import { createCmsEngine } from './worker.js';
import { createDiskAssets } from './assets-disk.js';

const NOW = '2026-01-01T00:00:00.000Z';
const ZONE = 'frontbase.test';

// The staged console-dist tree via the SHARED disk ASSETS shim — /admin and
// /frontbase-admin are proven through the same asset pipeline production uses
// (Static Assets), not a build-time inlined fallback. `pnpm console:build --
// --cloud` must run first: the /admin shell assertion below is fail-closed on
// it (the verify chain and CI stage it before smoke:cloud).
const here = dirname(fileURLToPath(import.meta.url));
const CONSOLE_DIST = join(here, '..', 'console-dist');

const runner: DbRunner = sqliteRunner(':memory:');
const engine = await createCmsEngine({
    runner,
    sessionSecret: 'smoke-cloud-session-secret-not-for-prod',
    admin: { email: 'operator@example.com', password: 'operator-passphrase-9', role: 'master_admin' },
    cloud: { baseDomain: ZONE },
    assets: createDiskAssets(CONSOLE_DIST),
    now: () => NOW,
});

let failures = 0;
let checks = 0;
const check = async (label: string, fn: () => Promise<boolean>) => {
    checks++;
    try { (await fn()) ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`)); }
    catch (e) { failures++; console.log(`  ❌ ${label} — threw: ${(e as Error).message}`); }
};

/** A request against a specific HOST (the tenancy fact — set explicitly;
 *  undici drops the implicit Host header in Node). */
const req = (host: string, path: string, init?: RequestInit) =>
    engine.fetch(new Request(`https://${host}${path}`, {
        ...init,
        headers: { host, ...(init?.headers as Record<string, string> | undefined) },
    }));

const text = async (r: Response) => await r.text();

/** Publish a page row directly (the smoke serves rows; the publish ROUTE is
 *  compat-tested elsewhere) and optionally flip is_public. */
const publishRow = (tenant: string, pageId: string, isPublic = true) => runner.exec(
    'UPDATE compat_pages SET is_published = 1, is_public = ? WHERE tenant_slug = ? AND id = ?',
    [isPublic ? 1 : 0, tenant, pageId],
);

console.log('── cloud smoke: seeding ──');

// The operator's canonical-origin site (cloud boot skips the automatic _root
// homepage seed — an operator builds theirs in the console; the smoke stands
// in for that finished state).
await new PagesStore(runner, '_root').ensureHomepage(NOW);

// Two active tenants, each with a DISTINCT homepage marker + a slug page.
const provision = async (slug: string, name: string, opts?: { status?: string | null }) => {
    const t = new TenantStore(runner);
    await t.createTenant(slug, name, NOW);
    await t.updateTenant(slug, { plan: 'free', ...(opts?.status !== undefined ? { status: opts.status } : { status: 'active' }) });
    const pages = new PagesStore(runner, slug);
    await pages.ensureHomepage(NOW);
    const home = await pages.list().then((rows) => rows.find((r) => r.is_homepage === 1));
    if (home) {
        await pages.update(home.id, {
            layoutData: {
                root: {},
                content: [{ id: 'h1', type: 'Heading', props: { content: `${name} runs on Frontbase`, level: 'h1' } }],
            },
        }, NOW);
        await publishRow(slug, home.id);
    }
    return pages;
};
const acmePages = await provision('acme', 'Acme');
const globexPages = await provision('globex', 'Globex');

// Slug pages: acme owns /about; globex owns a PUBLIC slug acme doesn't have
// (the cross-tenant read probe) and a PRIVATE page (the scoping probe).
const about = await acmePages.create({ name: 'About', slug: 'about', layout_data: { root: {}, content: [{ id: 'a1', type: 'Text', props: { content: 'All about Acme' } }] } }, 'page-acme-about', NOW);
await publishRow('acme', about.id);
const decoy = await globexPages.create({ name: 'Public', slug: 'globex-only', layout_data: { root: {}, content: [{ id: 'g1', type: 'Text', props: { content: 'All about Globex' } }] } }, 'page-globex-public', NOW);
await publishRow('globex', decoy.id);

// A PRIVATE published page on globex (the principal-scoping target).
const priv = await globexPages.create({ name: 'Letter', slug: 'letter', layout_data: { root: {}, content: [{ id: 'p1', type: 'Text', props: { content: 'Globex Private Letter' } }] } }, 'page-globex-letter', NOW);
await publishRow('globex', priv.id, false);

// Tenant states the gate must NOT serve: suspended, and registered-but-null.
await new TenantStore(runner).createTenant('suspended-inc', 'Suspended Inc', NOW);
await new TenantStore(runner).updateTenant('suspended-inc', { plan: 'free', status: 'suspended' });
await new TenantStore(runner).createTenant('nullstate-co', 'Nullstate', NOW);

// An acme member (login is a cross-tenant email scan — this session is the
// scoping test subject).
await seedOwner(new UserStore(runner, 'acme'), {
    email: 'owner@acme.test', password: 'acme-passphrase-1', now: NOW, role: 'admin', tenantSlug: 'acme',
});

// The acme member's session cookie (login ON the acme host).
const acmeCookie = await (async () => {
    const r = await req(`acme.${ZONE}`, '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@acme.test', password: 'acme-passphrase-1' }),
    });
    return r.headers.get('set-cookie')?.split(';')[0] ?? '';
})();

console.log('── tenant hosts ──');
await check('acme host renders ACME\'s homepage', async () =>
    (await text(await req(`acme.${ZONE}`, '/'))).includes('Acme runs on Frontbase'));
await check('globex host renders GLOBEX\'s homepage (its own, not acme\'s)', async () => {
    const body = await text(await req(`globex.${ZONE}`, '/'));
    return body.includes('Globex runs on Frontbase') && !body.includes('Acme runs on Frontbase');
});
await check('acme host serves acme\'s /about', async () =>
    (await text(await req(`acme.${ZONE}`, '/about'))).includes('All about Acme'));
await check('NO cross-tenant slug read: globex\'s public /globex-only does not render on acme host', async () => {
    const body = await text(await req(`acme.${ZONE}`, '/globex-only'));
    return !body.includes('All about Globex');
});
await check('acme member CAN see their own tenant pages (sanity)', async () => {
    const r = await req(`acme.${ZONE}`, '/about', { headers: { cookie: acmeCookie } });
    return r.status === 200 && (await text(r)).includes('All about Acme');
});
await check('unknown slug → workspace-not-found 404 (never served, product fix)', async () => {
    const r = await req(`nosuch.${ZONE}`, '/');
    const body = await text(r);
    return r.status === 404 && body.includes('Workspace not found');
});
await check('suspended tenant → 404', async () => {
    const r = await req(`suspended-inc.${ZONE}`, '/');
    return r.status === 404 && (await text(r)).includes('Workspace not found');
});
await check('registered but status NULL → 404 (gate is positive-only)', async () => {
    const r = await req(`nullstate-co.${ZONE}`, '/');
    return r.status === 404;
});
await check('tenant host: /frontbase-admin confined (404)', async () => {
    const r = await req(`acme.${ZONE}`, '/frontbase-admin');
    return r.status === 404;
});
await check('tenant host: /admin cloud console confined (404 — a login form on someone else\'s domain is a phishing surface)', async () => {
    const r = await req(`acme.${ZONE}`, '/admin');
    const body = await text(r);
    return r.status === 404 && body.includes('Workspace not found');
});
await check('tenant host: /builder confined (404)', async () => {
    const r = await req(`acme.${ZONE}`, '/builder');
    return r.status === 404;
});
await check('tenant host: admin API confined (404, even WITH session)', async () => {
    const r = await req(`acme.${ZONE}`, '/api/pages/', { headers: { cookie: acmeCookie } });
    return r.status === 404;
});
await check('tenant host: signup API confined to the app host (404)', async () => {
    const r = await req(`acme.${ZONE}`, '/api/auth/signup', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    return r.status === 404;
});
await check('tenant host: public overlay feed passes (login → 4xx JSON, not the 404 page)', async () => {
    const r = await req(`acme.${ZONE}`, '/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@y.z', password: 'nope' }),
    });
    return r.status !== 404;
});

console.log('── principal scoping (cross-tenant session) ──');
await check('session valid on its OWN host: /api/auth/me → the acme member', async () => {
    const r = await req(`acme.${ZONE}`, '/api/auth/me', { headers: { cookie: acmeCookie } });
    const body = await r.json() as { user?: { email?: string } | null };
    return r.status === 200 && body.user?.email === 'owner@acme.test';
});
await check('SAME session is ANONYMOUS on another tenant\'s host (scoped → 401)', async () => {
    const r = await req(`globex.${ZONE}`, '/api/auth/me', { headers: { cookie: acmeCookie } });
    return r.status === 401;
});
await check('scoped session gets the GATED document for globex\'s private page (no auth bypass)', async () => {
    // Product parity: a private page to an unauthenticated visitor renders the
    // blurred-preview gated document (content stays in the body BY DESIGN —
    // the overlay is the product's gate; data fetches are skipped). The
    // assertion is the GATE: the blur/overlay wrapper is present, i.e. the
    // scoped session was treated as anonymous rather than let through.
    const body = await text(await req(`globex.${ZONE}`, '/letter', { headers: { cookie: acmeCookie } }));
    return body.includes('user-select:none') && body.includes('Globex Private Letter');
});
await check('normal pages never carry the gate (contrast — wrapper is private-only)', async () => {
    // Guards the probe above against a false positive: if EVERY document
    // carried the blur wrapper, the gated assertion would prove nothing. A
    // public page must render normally.
    const normal = await text(await req(`globex.${ZONE}`, '/globex-only'));
    return !normal.includes('user-select:none');
});

console.log('── app host ──');
await check('app host `/` 302s to /admin', async () => {
    const r = await req(`app.${ZONE}`, '/');
    return r.status === 302 && r.headers.get('location') === '/admin';
});
await check('app host `/` with Accept:json stays the API status (not a redirect)', async () => {
    const r = await req(`app.${ZONE}`, '/', { headers: { accept: 'application/json' } });
    const body = await r.json() as { message?: string };
    return r.status === 200 && typeof body.message === 'string';
});
await check('app host serves the SPA shell at /frontbase-admin', async () => {
    const r = await req(`app.${ZONE}`, '/frontbase-admin');
    const body = await text(r);
    return r.status === 200 && body.includes('id="root"');
});
await check('app host serves the CLOUD console shell at /admin (staged via --cloud)', async () => {
    const r = await req(`app.${ZONE}`, '/admin');
    const body = await text(r);
    // The cloud shell is a vite --mode cloud build: base /admin/ — its asset
    // references are the fingerprint that separates it from the community
    // shell. The not-staged 503 page (or a stale community shell) never
    // carries them, so this is fail-closed on `pnpm console:build -- --cloud`.
    return r.status === 200 && body.includes('/admin/assets/');
});
await check('app host serves /admin hashed bundles immutably', async () => {
    const shell = await text(await req(`app.${ZONE}`, '/admin'));
    const bundle = shell.match(/src="(\/admin\/assets\/[^"]+\.js)"/)?.[1];
    if (!bundle) return false;
    const r = await req(`app.${ZONE}`, bundle);
    return r.status === 200 && r.headers.get('cache-control') === 'public, max-age=31536000, immutable';
});
await check('app host /admin deep link falls back to the shell (SPA fallback)', async () => {
    const r = await req(`app.${ZONE}`, '/admin/tenants');
    const body = await text(r);
    return r.status === 200 && body.includes('/admin/assets/');
});

console.log('── reserved / apex / foreign ──');
await check('reserved label (api.) → 404, never a site', async () => {
    const r = await req(`api.${ZONE}`, '/');
    return r.status === 404;
});
await check('apex → 302 to app-host /admin', async () => {
    const r = await req(ZONE, '/');
    return r.status === 302 && r.headers.get('location') === `https://app.${ZONE}/admin`;
});
await check('foreign host (canonical origin) still serves the operator site', async () => {
    const r = await req('canonical.workers.dev', '/');
    const body = await text(r);
    return r.status === 200 && body.includes('Welcome to your new site');
});

console.log('── signup → live (WA3) ──');
// MARK(wa3): POST app-host /api/auth/signup → 201 with a new slug; the new
// host immediately renders its seeded homepage (the 15s negative-cache never
// pins the pre-signup 404); the signup surface is APP-HOST-ONLY (404 on a
// tenant host — the confinement check above moves here once cloudMode onboards).

console.log(failures === 0 ? `\n✅ cloud smoke passed (${checks} checks)` : `\n❌ cloud smoke FAILED: ${failures}/${checks} checks`);
process.exit(failures === 0 ? 0 : 1);
