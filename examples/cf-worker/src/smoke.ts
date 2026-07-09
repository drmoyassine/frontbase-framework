/**
 * Pre-deploy routing smoke — boots the SAME worker in-process and hits every
 * route class. Proves @frontbase/edge-core serves as a CF worker before wrangler
 * deploy. Run: node dist/smoke.mjs
 */
import worker from './worker.js';

const req = (path: string, init?: RequestInit) => worker.fetch(new Request('https://smoke.local' + path, init));

let failures = 0;
const check = async (label: string, fn: () => Promise<boolean>) => {
    try { (await fn()) ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`)); }
    catch (e) { failures++; console.log(`  ❌ ${label} — threw: ${(e as Error).message}`); }
};

await check('GET / renders (edge)', async () => {
    const r = await req('/');
    return r.status === 200 && (await r.text()).includes('chimera-rendered-by" content="edge"');
});
await check('GET /homee renders the real homepage', async () => {
    const r = await req('/homee');
    return r.status === 200 && (await r.text()).includes('No-code Development for the Edge');
});
await check('GET /products renders registered-query records', async () => {
    const r = await req('/products');
    return r.status === 200 && (await r.text()).includes('Edge Widget');
});
await check('GET /sw.js serves the browser engine bundle', async () => {
    const r = await req('/sw.js');
    return r.status === 200 && r.headers.get('content-type') === 'text/javascript' && (await r.text()).length > 1000;
});
await check('POST /api/data/products.list → 3 rows', async () => {
    const r = await req('/api/data/products.list', { method: 'POST', body: '{}' });
    return r.status === 200 && (await r.json() as unknown[]).length === 3;
});
await check('POST /api/data/evil.x → 404', async () =>
    (await req('/api/data/evil.x', { method: 'POST', body: '{}' })).status === 404);

console.log(failures === 0 ? '\ncf-worker smoke: PASS ✅' : `\ncf-worker smoke: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
