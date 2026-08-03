/**
 * Google Sheets provider unit tests — resolveGoogleSheets (pure) +
 * enrichGoogleSheets (async, best-effort passthrough).
 *
 * Covers:
 *   (a) resolver maps stored fields → runner shape `{ webAppUrl, webAppSecret,
 *       spreadsheetId }`, honoring canonical camelCase, snake_case aliases, and
 *       the `secret` short alias for `webAppSecret`. Also carries the inline
 *       `webAppSecretEncrypted` fallback and optional `spreadsheetName` through.
 *   (b) enricher merges (passthrough) fields — credentials arrive complete from
 *       the add-on callback, so the returned config preserves every input field
 *       and makes NO outbound fetch.
 *   (c) enricher returns the input UNCHANGED when the injected fetch throws
 *       (best-effort contract: enrichment never breaks connect).
 *
 * Product reference: sheets_connect.py:191-306 (callback stores webAppSecret
 * encrypted + webAppUrl/spreadsheetId/spreadsheetName in metadata) and
 * google_sheets_adapter.__init__ (reads webAppUrl/spreadsheetId/webAppSecret,
 * falls back to webAppSecretEncrypted inline).
 */
import { strict as assert } from 'node:assert';
import { resolveGoogleSheets, enrichGoogleSheets } from '../dist/compat/providers/google_sheets.js';

let testsPassed = 0;
async function test(name, fn) {
    await fn();
    testsPassed += 1;
    console.log(`  ok - ${name}`);
}

// ----- stubbed fetch ---------------------------------------------------------
// Records outbound calls so we can prove the enricher is a true passthrough
// (Google Sheets creds arrive complete from the add-on — no fetch expected).
let calls = [];
const stubFetch = (routes = {}) => async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method ?? 'GET');
    calls.push({ url, method, headers: init.headers ?? {} });
    const handler = routes[url];
    if (!handler) return new Response('not found', { status: 404 });
    const { status = 200, body = {} } = handler(init);
    return Response.json(body, { status });
};
const fetchThrowing = async () => { throw new Error('network_down'); };

// =============================================================================
// (a) resolveGoogleSheets — PURE field mapping
// =============================================================================
console.log('resolveGoogleSheets (pure):');
await test('maps canonical camelCase fields verbatim', () => {
    const out = resolveGoogleSheets({
        webAppUrl: 'https://script.google.com/macros/s/a/exec',
        webAppSecret: 'sec-a',
        spreadsheetId: 'sheet-a',
    });
    assert.deepEqual(out, {
        webAppUrl: 'https://script.google.com/macros/s/a/exec',
        webAppSecret: 'sec-a',
        spreadsheetId: 'sheet-a',
    });
});

await test('maps snake_case aliases web_app_url / spreadsheet_id', () => {
    const out = resolveGoogleSheets({
        web_app_url: 'https://script.google.com/macros/s/b/exec',
        webAppSecret: 'sec-b',
        spreadsheet_id: 'sheet-b',
    });
    assert.deepEqual(out, {
        webAppUrl: 'https://script.google.com/macros/s/b/exec',
        webAppSecret: 'sec-b',
        spreadsheetId: 'sheet-b',
    });
});

await test('accepts `secret` as an alias for webAppSecret', () => {
    const out = resolveGoogleSheets({
        webAppUrl: 'https://script.google.com/macros/s/c/exec',
        secret: 'sec-c',
        spreadsheetId: 'sheet-c',
    });
    assert.equal(out.webAppSecret, 'sec-c');
});

await test('prefers webAppSecret over the `secret` alias when both present', () => {
    const out = resolveGoogleSheets({
        webAppUrl: 'https://script.google.com/macros/s/d/exec',
        webAppSecret: 'preferred',
        secret: 'shadow',
        spreadsheetId: 'sheet-d',
    });
    assert.equal(out.webAppSecret, 'preferred');
});

await test('trims trailing whitespace from webAppUrl', () => {
    const out = resolveGoogleSheets({
        webAppUrl: '  https://script.google.com/macros/s/e/exec  ',
        webAppSecret: 'sec',
        spreadsheetId: 'sheet-e',
    });
    assert.equal(out.webAppUrl, 'https://script.google.com/macros/s/e/exec');
});

await test('returns empty strings when no fields present', () => {
    const out = resolveGoogleSheets({});
    assert.deepEqual(out, { webAppUrl: '', webAppSecret: '', spreadsheetId: '' });
});

await test('carries webAppSecretEncrypted inline fallback through verbatim', () => {
    const out = resolveGoogleSheets({
        webAppUrl: 'https://script.google.com/macros/s/f/exec',
        spreadsheetId: 'sheet-f',
        webAppSecretEncrypted: 'enc:ciphertext',
    });
    // Plaintext secret absent → empty string; encrypted blob preserved upstream.
    assert.equal(out.webAppSecret, '');
    assert.equal(out.webAppSecretEncrypted, 'enc:ciphertext');
});

await test('also accepts snake_case web_app_secret_encrypted alias', () => {
    const out = resolveGoogleSheets({
        webAppUrl: 'https://script.google.com/macros/s/g/exec',
        spreadsheetId: 'sheet-g',
        web_app_secret_encrypted: 'enc:other',
    });
    assert.equal(out.webAppSecretEncrypted, 'enc:other');
});

await test('carries optional spreadsheetName display metadata through', () => {
    const out = resolveGoogleSheets({
        webAppUrl: 'https://script.google.com/macros/s/h/exec',
        webAppSecret: 'sec',
        spreadsheetId: 'sheet-h',
        spreadsheetName: 'Q3 Pipeline',
    });
    assert.equal(out.spreadsheetName, 'Q3 Pipeline');
});

await test('drops spreadsheetName when absent (no empty string leaking)', () => {
    const out = resolveGoogleSheets({
        webAppUrl: 'https://script.google.com/macros/s/i/exec',
        webAppSecret: 'sec',
        spreadsheetId: 'sheet-i',
    });
    assert.equal('spreadsheetName' in out, false);
});

// =============================================================================
// (b) enrichGoogleSheets — passthrough (creds arrive complete from add-on)
// =============================================================================
console.log('enrichGoogleSheets (passthrough):');
await test('preserves every input field and makes NO outbound fetch', async () => {
    calls = [];
    const fetchImpl = stubFetch();
    const input = {
        webAppUrl: 'https://script.google.com/macros/s/x/exec',
        webAppSecret: 'sec-x',
        spreadsheetId: 'sheet-x',
        spreadsheetName: 'Tenant A Sheet',
    };
    const out = await enrichGoogleSheets(input, fetchImpl);

    assert.equal(calls.length, 0, 'enricher must not fetch — creds arrive complete');
    assert.deepEqual(out, input);
});

await test('returns a NEW object (does not mutate the input reference)', async () => {
    const input = { webAppUrl: 'u', webAppSecret: 's', spreadsheetId: 'id' };
    const out = await enrichGoogleSheets(input, stubFetch());
    assert.notEqual(out, input, 'enricher should return a fresh merged object');
    assert.deepEqual(out, input);
});

await test('carries access_token + provider-native fields through unchanged', async () => {
    calls = [];
    const input = {
        access_token: 'add-on-bearer',
        webAppUrl: 'https://script.google.com/macros/s/y/exec',
        webAppSecret: 'sec-y',
        spreadsheetId: 'sheet-y',
        provider: 'google_sheets',
    };
    const out = await enrichGoogleSheets(input, stubFetch());
    assert.equal(out.access_token, 'add-on-bearer');
    assert.equal(out.provider, 'google_sheets');
    assert.equal(calls.length, 0);
});

// =============================================================================
// (c) enrichGoogleSheets — best-effort failure handling
// =============================================================================
console.log('enrichGoogleSheets (failure / best-effort):');
await test('returns input unchanged when fetch throws (best-effort)', async () => {
    const input = {
        webAppUrl: 'https://script.google.com/macros/s/z/exec',
        webAppSecret: 'sec-z',
        spreadsheetId: 'sheet-z',
    };
    const out = await enrichGoogleSheets(input, fetchThrowing);
    assert.deepEqual(out, input);
});

await test('returns input unchanged even when fetch stub returns 500', async () => {
    calls = [];
    const failingFetch = stubFetch({
        'https://script.google.com/macros/s/err/exec': () => ({ status: 500, body: { detail: 'boom' } }),
    });
    const input = {
        webAppUrl: 'https://script.google.com/macros/s/keep/exec',
        webAppSecret: 'sec-keep',
        spreadsheetId: 'sheet-keep',
    };
    // enricher is a passthrough — it never calls fetch, so the 500 route is
    // never hit and the input is returned intact.
    const out = await enrichGoogleSheets(input, failingFetch);
    assert.equal(calls.length, 0);
    assert.deepEqual(out, input);
});

console.log(`\nAll ${testsPassed} Google Sheets provider tests passed.`);
