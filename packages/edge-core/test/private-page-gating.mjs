/**
 * Private-page gating — exercises the eSSR catch-all gate added in engine.ts.
 *
 * Mirrors the product's routes/pages.ts decision tree field-for-field:
 *   private (isPublic === false) + unauthenticated visitor
 *     → generateGatedPageDocument (blurred #root + #fb-auth-overlay), no cache
 *   private + authenticated visitor → normal chimera document
 *   public page → normal chimera document regardless of auth
 *
 * The visitor session is mocked via configureEngine({ resolvePrincipal }) — the
 * SAME seam the cf-full worker wires to its fb_session JWT resolver. No HTTP
 * server, no DB: the gate is pure request → response over the in-process Hono app.
 */
import { createEngine, directProvider, configureEngine } from '../dist/index.js';
import { z } from 'zod';

// ---- shared anonymous resolver (matches the engine default) ----------------
const anonymous = async () => ({ user: null, tenant: undefined });
const authenticated = async () => ({ user: { id: 'u1', email: 'visitor@example.com' }, tenant: 'acme' });

// ---- manifest: public, private, private-with-auth-form, private-with-query --
const manifest = {
    version: 'gating-1',
    queries: {
        'me.data': {
            queryId: 'me.data',
            scope: 'user', // would 401 an anonymous visitor via enforceScope
            rows: [{ secret: 'LEAKED_DATA' }],
        },
    },
    pages: {
        '/': { title: 'Home', slug: 'home', layout: { root: {}, content: [{ id: 'h1', type: 'Text', props: { content: 'Public Homepage' } }] } },
        '/private': {
            title: 'Secret', slug: 'private', isPublic: false,
            layout: { root: {}, content: [{ id: 'p1', type: 'Text', props: { content: 'Confidential Body' } }] },
        },
        '/members': {
            title: 'Members', slug: 'members', isPublic: false,
            _primaryAuthForm: { type: 'login', title: 'Members Only', description: 'Sign in to your account' },
            layout: { root: {}, content: [{ id: 'm1', type: 'Text', props: { content: 'Members Area' } }] },
        },
        // A page whose _primaryAuthForm carries the FULL AuthFormConfig shape a
        // real project auth-form bakes at publish (primaryColor, providers,
        // logoUrl, magicLink) — proves the overlay skins from real config, not
        // just title/description. This is the row-baked path: worker.ts maps a
        // compat_pages.primary_auth_form JSON row onto this field 1:1.
        '/portal': {
            title: 'Portal', slug: 'portal', isPublic: false,
            _primaryAuthForm: {
                type: 'both',
                title: 'Partner Portal',
                description: 'Sign in to access your dashboard',
                primaryColor: '#4338ca',
                providers: ['google', 'github'],
                logoUrl: 'https://cdn.example.com/logo.png',
                magicLink: true,
                showLinks: true,
            },
            layout: { root: {}, content: [{ id: 'pt1', type: 'Text', props: { content: 'Partner Dashboard' } }] },
        },
        '/dashboard': {
            title: 'Dashboard', slug: 'dashboard', isPublic: false, queryId: 'me.data',
            layout: { root: {}, content: [{ id: 'd1', type: 'Text', props: { content: '{% for r in records %}{{ r.secret }}{% endfor %}' } }] },
        },
    },
};

const engine = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
// A second engine whose homepage ('/') is private — proves the post-login
// redirect resolves to '/' for the homepage path.
const privateHome = createEngine({
    manifest: {
        version: 'gating-2',
        queries: {},
        pages: { '/': { title: 'Gated Home', slug: 'home', isPublic: false, layout: { root: {}, content: [] } } },
    },
    data: directProvider({ version: 'gating-2', queries: {}, pages: {} }),
    environment: 'edge',
});

const req = (app, path, init) => app.fetch(new Request('http://pages.local' + path, init));
let failures = 0;
const check = async (label, fn) => {
    try { (await fn()) ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`)); }
    catch (e) { failures++; console.log(`  ❌ ${label} — threw: ${e.stack || e.message}`); }
};

// Reset to anonymous before every check that needs it (configureEngine is global).
const anon = () => configureEngine({ resolvePrincipal: anonymous });

// 1. Private + unauthenticated → gated document
await check('private + unauth → 200 with auth overlay + blurred root', async () => {
    anon();
    const r = await req(engine, '/private');
    const html = await r.text();
    return r.status === 200
        && html.includes('id="fb-auth-overlay"')
        && html.includes('filter:blur(8px)')
        && !html.includes('chimera-rendered-by');
});

// 2. Gated doc is never cached (matches product no-cache headers)
await check('private + unauth → no-cache response headers', async () => {
    anon();
    const r = await req(engine, '/private');
    return /no-cache|no-store/i.test(r.headers.get('cache-control') || '');
});

// 3. Gated doc carries the post-login redirect = current path ('/private')
await check('gated overlay redirectTo hidden input = /private', async () => {
    anon();
    const html = await (await req(engine, '/private')).text();
    return html.includes('name="redirectTo" value="/private"');
});

// 4. Gated doc still renders (blurred) page content behind the overlay
await check('gated doc contains the (blurred) confidential body', async () => {
    anon();
    const html = await (await req(engine, '/private')).text();
    return html.includes('Confidential Body');
});

// 5. Private + authenticated → normal chimera document, no overlay
await check('private + auth → normal chimera doc, no overlay', async () => {
    configureEngine({ resolvePrincipal: authenticated });
    const r = await req(engine, '/private');
    const html = await r.text();
    configureEngine({ resolvePrincipal: anonymous });
    return r.status === 200
        && html.includes('chimera-rendered-by" content="edge"')
        && html.includes('Confidential Body')
        && !html.includes('fb-auth-overlay');
});

// 6. Public page → normal doc regardless of auth (anonymous here)
await check('public page + unauth → normal chimera doc', async () => {
    anon();
    const r = await req(engine, '/');
    const html = await r.text();
    return r.status === 200
        && html.includes('chimera-rendered-by" content="edge"')
        && html.includes('Public Homepage')
        && !html.includes('fb-auth-overlay');
});

// 7. Public page + authenticated → still normal doc
await check('public page + auth → normal chimera doc', async () => {
    configureEngine({ resolvePrincipal: authenticated });
    const r = await req(engine, '/');
    const html = await r.text();
    configureEngine({ resolvePrincipal: anonymous });
    return r.status === 200 && html.includes('Public Homepage') && !html.includes('fb-auth-overlay');
});

// 8. _primaryAuthForm is threaded → custom title/description render in overlay
await check('private page _primaryAuthForm.title renders in overlay', async () => {
    anon();
    const html = await (await req(engine, '/members')).text();
    return html.includes('Members Only') && html.includes('Sign in to your account');
});

// 8b. A FULL AuthFormConfig (primaryColor, providers, logoUrl) baked from the
//     project's primary auth-form surfaces in the overlay — not just the title.
//     This is the end-to-end proof that real auth-form config (vs the hardcoded
//     default 'Welcome'/no-providers/no-logo overlay) reaches the visitor.
await check('full _primaryAuthForm (color/providers/logo) skins the overlay', async () => {
    anon();
    const html = await (await req(engine, '/portal')).text();
    return html.includes('Partner Portal')
        && html.includes('Sign in to access your dashboard')
        && html.includes('#4338ca')                       // primaryColor (button + focus ring)
        && html.includes('Continue with Google')          // providers[0]
        && html.includes('Continue with Github')          // providers[1]
        && html.includes('data-provider="google"')
        && html.includes('https://cdn.example.com/logo.png'); // logoUrl
});

// 9. Tenant isolation / no data leak: a private page with a user-scoped query,
//    served to an anonymous visitor, is GATED (200 + overlay) — NOT 401'd by
//    enforceScope — and the scoped query rows never reach the response body.
await check('private + user-scoped query + unauth → gated (not 401), no data leak', async () => {
    anon();
    const r = await req(engine, '/dashboard');
    const html = await r.text();
    return r.status === 200
        && html.includes('fb-auth-overlay')
        && !html.includes('LEAKED_DATA');
});

// 10. Homepage redirect: a private homepage ('/') yields redirectTo='/'
await check('private homepage → gated overlay redirectTo = /', async () => {
    anon();
    const html = await (await req(privateHome, '/')).text();
    return html.includes('name="redirectTo" value="/"') && html.includes('fb-auth-overlay');
});

// 11. SW/builder environments never gate (private page renders normally there)
await check('builder environment does not gate a private page', async () => {
    anon();
    const builderEngine = createEngine({ manifest, data: directProvider(manifest), environment: 'builder' });
    const r = await req(builderEngine, '/private');
    const html = await r.text();
    return r.status === 200
        && html.includes('chimera-rendered-by" content="builder"')
        && !html.includes('fb-auth-overlay');
});

console.log(failures === 0 ? '\nprivate-page gating: PASS ✅' : `\nprivate-page gating: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
