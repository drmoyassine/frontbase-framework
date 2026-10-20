import assert from 'node:assert/strict';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { createCompatApp } from '../dist/compat/app.js';
const root = '/api/project/translation-batches/';
// Per-record locale review: server re-reads every record through the owned connection, eligibility
// failures are skipped while transport failures fail the preview, and manual drafts protect units.
async function setup() {
    const f = await allowanceFixture();
    let member = true, outage = false;
    const titles = { 1: 'Discover institutions', 2: 'Campus tours' };
    const rowsFor = key => key === '1' || key === '2' ? [{ id: Number(key), title: titles[key] }]
        : key === '3' ? [{ id: 3, title: 'Twin A' }, { id: 3, title: 'Twin B' }]
        : [];
    await f.sync.createView({ datasource_id: 'data', name: 'US institutions', target_table: 'institutions',
        visible_columns: ['id', 'title'], filters: [{ field: 'country', operator: 'eq', value: 'USA' }], description: 'PRIVATE_DESCRIPTION' }, 'us', now);
    const original = f.host.externalFetch;
    f.host.externalFetch = async (input, init) => {
        const request = new Request(input, init), u = new URL(request.url);
        if (request.method === 'GET' && u.pathname.endsWith('/institutions')) {
            if (outage) throw Error('PRIVATE_REMOTE');
            const key = (u.searchParams.get('id') ?? '').replace('eq.', '');
            assert.equal(u.searchParams.get('select'), 'id,title');
            assert.equal(u.searchParams.get('limit'), '2');
            assert.equal(request.headers.get('accept-profile'), 'public');
            if (u.searchParams.has('or')) return Response.json(member ? rowsFor(key) : []);
            return Response.json(rowsFor(key));
        }
        return original(request);
    };
    let tenant = 'alpha', role = 'owner', authenticated = true;
    const app = await createCompatApp({ makeRunner: () => f.db, sessionSecret: 'allowance-private-fixture', now: () => now,
        externalFetch: f.host.externalFetch, translationExecutionEnabled: true,
        resolvePrincipal: async () => ({ user: authenticated ? { id: 'editor', role } : null, tenant }) });
    const request = (path, body) => app.request(root + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    async function json(path, body, expected = 200) {
        const r = await request(path, body);
        assert.equal(r.status, expected, await r.clone().text());
        assert.equal(r.headers.get('cache-control'), 'no-store');
        const data = await r.json();
        assert.doesNotMatch(JSON.stringify(data), /PRIVATE_|serviceKey|data\.example\.test/);
        return data;
    }
    const viewSel = (keyValue, field = 'title') => ({ kind: 'view-record', viewId: 'us', endpoint: 'postgrest', keyColumn: 'id', keyValue, field });
    const recordSel = (keyValue, field = 'title') => ({ kind: 'record', datasourceId: 'data', endpoint: 'postgrest', table: 'institutions', keyColumn: 'id', keyValue, field });
    const preview = async (selections, locale = 'ar') => json('record-preview/', { locale, selections });
    const save = async (field, text) => request('record-preview/save/', { selection: field.selection, locale: 'ar', token: field.token, text });
    return { ...f, request, json, viewSel, recordSel, preview, save, app,
        setText: (key, value) => { titles[key] = value; }, setMember: v => { member = v; }, setOutage: v => { outage = v; },
        setTenant: v => { tenant = v; }, setRole: v => { role = v; }, setAuth: v => { authenticated = v; } };
}
try {
    const f = await setup();
    // Administrator fences hold before any owned read.
    for (const denied of [['record-preview/', { locale: 'ar', selections: [f.viewSel('1')] }], ['record-preview/save/', { selection: f.viewSel('1'), locale: 'ar', token: 'a'.repeat(64), text: 'x' }]]) {
        f.setAuth(false); assert.equal((await f.request(...denied)).status, 401);
        f.setAuth(true); f.setRole('viewer'); assert.equal((await f.request(...denied)).status, 403);
        f.setRole('owner');
    }
    // Missing states in request order; unconfigured locale refuses.
    let p = await f.preview([f.viewSel('1'), f.viewSel('2')]);
    assert.deepEqual(p.fields.map(field => field.selection.keyValue), ['1', '2']);
    assert.ok(p.fields.every(field => field.state === 'missing' && field.translation === null && field.provenance === null));
    assert.equal(p.fields[0].source, 'Discover institutions');
    assert.equal(p.draftOnly, true);
    assert.equal(await (await f.app.request(root + 'record-preview/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: 'fr', selections: [f.viewSel('1')] }) })).status, 422);
    // Eligibility failures skip; transport failures must fail the preview.
    p = await f.preview([f.viewSel('3'), f.viewSel('4'), f.viewSel('9'), { kind: 'view-record', viewId: 'ghost', endpoint: 'postgrest', keyColumn: 'id', keyValue: '1', field: 'title' }, f.viewSel('1')]);
    assert.deepEqual(p.fields.map(field => field.selection.keyValue), ['1'], 'ambiguous, markup, missing and unknown-view records are skipped');
    // An unreachable owned connection reads as ineligibility (mirroring the page preview): the
    // record is skipped without leaking, and saves refuse instead of guessing.
    f.setOutage(true);
    const outage = await f.request('record-preview/', { locale: 'ar', selections: [f.viewSel('1')] });
    assert.equal(outage.status, 200);
    const outageBody = await outage.text();
    assert.doesNotMatch(outageBody, /PRIVATE_REMOTE/);
    assert.deepEqual(JSON.parse(outageBody).fields, []);
    assert.equal((await f.request('record-preview/save/', { selection: f.viewSel('1'), locale: 'ar', token: 'a'.repeat(64), text: 'x' })).status, 409);
    f.setOutage(false);
    // Manual save: draft with manual provenance, protected from generated replacement.
    const saved = await f.save(p.fields[0], 'استكشاف المؤسسات');
    assert.equal(saved.status, 200, await saved.clone().text());
    const after = (await saved.json()).fields[0];
    assert.equal(after.state, 'draft'); assert.equal(after.provenance, 'manual'); assert.equal(after.translation, 'استكشاف المؤسسات');
    const localization = await import('@frontbase/edge-core/localization');
    const stored = await f.f.store.read(f.scope, await localization.translationUnitId(f.scope,
        { kind: 'record', connectionId: 'data', collection: 'institutions', key: [{ column: 'id', value: 1 }], propertyPath: ['title'] }), 'ar');
    assert.equal(stored.head?.provenance, 'manual');
    const protect = await new localization.TranslationLifecycle(f.f.store).writeGenerated(f.scope, { version: 1, unitId: stored.head.unitId, locale: 'ar',
        sourceVersion: stored.head.sourceVersion, sourceFingerprint: stored.head.sourceFingerprint, contextFingerprint: stored.head.contextFingerprint,
        revisionId: 'generated-overwrite', expectedHead: stored.head.revisionId, text: 'replacement' });
    assert.equal(protect.reason, 'manual-protected');
    // Record-kind selections share the unit: the same draft is visible through the datasource source.
    const viaRecord = await f.preview([f.recordSel('1')]);
    assert.equal(viaRecord.fields[0].state, 'draft'); assert.equal(viaRecord.fields[0].translation, 'استكشاف المؤسسات');
    // Forged tokens, markup and left-view membership refuse.
    assert.equal((await f.save(p.fields[0], 'forged')).status, 409);
    assert.equal((await f.save(after, '<script>bad</script>')).status, 409);
    f.setMember(false); assert.equal((await f.save(after, 'left the view')).status, 409); f.setMember(true);
    // Source change turns the draft outdated; the stale token refuses and a fresh one saves again.
    f.setText(1, 'Source changed');
    assert.equal((await f.save(after, 'stale writer')).status, 409);
    let fresh = await f.preview([f.viewSel('1')]);
    assert.equal(fresh.fields[0].state, 'outdated'); assert.equal(fresh.fields[0].translation, null);
    assert.equal((await f.save(fresh.fields[0], 'تحديث')).status, 200);
    // Concurrency: exactly one of two racing saves wins (expectedHead CAS).
    fresh = await f.preview([f.viewSel('1')]);
    const results = await Promise.all([f.save(fresh.fields[0], 'إصدار واحد'), f.save(fresh.fields[0], 'إصدار آخر')]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    // Configuration changes invalidate the optimistic token even when the record is untouched.
    const before = await f.preview([f.viewSel('1')]);
    await f.generation.save({ ...f.configuration, targetLocales: ['ar', 'fr'] }, 1, now);
    assert.equal((await f.save(before.fields[0], 'old settings')).status, 409);
    const refreshed = await f.preview([f.viewSel('1')]);
    assert.equal((await f.save(refreshed.fields[0], 'إصدار جديد')).status, 200);
    // Cross-tenant: another tenant has no configured storage/generation.
    f.setTenant('beta');
    assert.equal((await f.request('record-preview/', { locale: 'ar', selections: [f.viewSel('1')] })).status, 422);
    assert.equal((await f.request('record-preview/save/', { selection: f.viewSel('1'), locale: 'ar', token: 'a'.repeat(64), text: 'x' })).status, 409);
    f.setTenant('alpha');
    // Bounded request grammar: 26 selections refuse; empty refuses.
    assert.equal((await f.request('record-preview/', { locale: 'ar', selections: Array.from({ length: 26 }, () => f.viewSel('1')) })).status, 422);
    assert.equal((await f.request('record-preview/', { locale: 'ar', selections: [] })).status, 422);
    assert.equal(f.aiCalls(), 0, 'review and manual saves never call a provider');
    f.close();
    console.log('translation-record-preview: per-record states, eligibility-vs-transport, manual protection, CAS and zero-provider gates pass');
} catch (error) { console.error(error); process.exit(1); }
