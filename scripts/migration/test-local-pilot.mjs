import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
const [base = 'http://127.0.0.1:4387', dataPath, editorialPath] = process.argv.slice(2);
if (!dataPath) throw new Error('Provide local URL and protected pilot data path');
const data = JSON.parse(await readFile(dataPath, 'utf8'));
const get = (path, options) => fetch(base + path, options);
const original = await (await get('/__draft/status.json?scope=wordpress&kind=all')).json();
assert.equal(original.selected, 310);
const expanded = await (await get('/__draft/status.json?scope=expanded&kind=all')).json();
assert.ok(expanded.selected > 10000);
assert.equal(expanded.catalog.programs, data.catalog_counts.programs);
const home = await get('/');
assert.equal(home.status, 200);
assert.equal(home.headers.get('x-robots-tag'), 'noindex, nofollow');
assert.equal(home.headers.get('cache-control'), 'no-store');
assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'self'/);
const body = await home.text();
assert.match(body, /name="generator" content="Frontbase"/);
assert.match(body, /name="chimera-rendered-by" content="builder"/);
assert.match(body, /id="directory"/);
assert.match(body, /https:\/\/wa.me\/96550775711/);
assert.match(body, /mailto:counselor@studygram.me/);
assert.doesNotMatch(body, /service_role|SUPABASE_SERVICE|MYSQL_ROOT_PASSWORD/);
const city = data.rows.find(r => r.kind === 'program' && r.city && r.origin === 'wordpress').city;
const filtered = await (await get('/__draft/status.json?scope=wordpress&kind=program&city=' + encodeURIComponent(city))).json();
assert.ok(filtered.selected > 0 && filtered.selected < 258);
const none = await get('/?q=THIS_IS_AN_UNMATCHED_TITLE_87499');
assert.match(await none.text(), /No listings match/);
const injection = await get('/?heading=' + encodeURIComponent('{{ system.env }} <script>alert(1)</script>'));
assert.doesNotMatch(await injection.text(), /<script>alert\(1\)<\/script>/);
assert.equal((await get('/not-an-existing-migration-url/')).status, 404);
assert.equal((await get('/', { method: 'POST' })).status, 405);
// Node fetch normalizes Host. A raw HTTP request exercises the actual host gate.
const rejectedHost = await new Promise((resolve, reject) => {
    const target = new URL(base);
    const req = request({ hostname: target.hostname, port: target.port, path: '/', headers: { Host: 'attacker.example' } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end();
});
assert.equal(rejectedHost, 403);
const layout = await (await get('/__draft/layout.json?scope=wordpress&kind=institution')).json();
assert.equal(layout.publicationApproved, false);
assert.equal(layout.draftDataSelection.kind, 'institution');
assert.ok(layout.layout.content.length);
assert.equal(data.relationship_issues.length, 0);
const defaultSelection = await (await get('/__draft/status.json')).json();
assert.equal(defaultSelection.selected, data.rows.filter(r => r.kind === 'institution').length);
const directory = await (await get('/explore/?type=institution&sort=latest')).text();
assert.ok(directory.includes(`${defaultSelection.selected} institutions`));
assert.match(directory, /aria-label="Filter directory"/);
assert.match(directory, /View institution &amp; programs/);
assert.doesNotMatch(directory, /View program →/);
const unlv = data.rows.find(r => r.path === '/university-of-nevada/');
assert.equal(unlv.program_count, 2);
const institutionPage = await (await get(unlv.path)).text();
assert.match(institutionPage, /id="programs"/);
assert.match(institutionPage, /2 programs/);
assert.match(institutionPage, /entertainment-engineering-and-design/);
const programPage = await (await get('/university-of-nevada-las-vegas/entertainment-engineering-and-design/')).text();
assert.match(programPage, /href="\/university-of-nevada\/"/);
assert.match(programPage, /27,021/);
assert.match(programPage, /Admission requirements/);
assert.match(programPage, /IELTS/);
assert.match(programPage, /Jan, Aug/);
const selectedProgram = await (await get('/explore/?type=program&institution=%2Funiversity-of-nevada%2F&intake=Jan')).text();
assert.match(selectedProgram, /entertainment-engineering-and-design/);
const coverRow = data.rows.find(r => r.kind === 'program' && r.target_id === 46188);
assert.ok(coverRow.cover?.startsWith('https://s3.studygram.me/public-images/'));
const coveredPage = await get(coverRow.path);
assert.match(coveredPage.headers.get('content-security-policy'), /img-src 'self' data: https:\/\/s3.studygram.me\/public-images\//);
assert.ok((await coveredPage.text()).includes(`src="${coverRow.cover}"`));
const els = data.rows.find(r => r.path === '/university-of-cincinnati/');
assert.ok(els.program_count > 0);
const elsPage = await (await get(els.path)).text();
assert.ok(elsPage.includes(`src="${els.cover}"`));
assert.ok(elsPage.includes('English'));
assert.ok(elsPage.includes('Historical host-institution overview'));
assert.ok(elsPage.includes('Host institution founded'));
const coveredCards = await (await get('/explore/?type=institution&q=University+of+Cincinnati')).text();
assert.ok(coveredCards.includes(`src="${els.cover}"`));
const largest = data.rows.filter(r => r.kind === 'institution').sort((a,b) => b.program_count - a.program_count)[0];
assert.ok(largest.program_count > 48);
const later = await (await get(largest.path + '?page=2')).text();
assert.match(later, /page 2 of/);
assert.match(later, /Previous/);
assert.equal((later.match(/View program →<\/a>/g) || []).length, 12);
const unrelated = data.rows.find(r => r.kind === 'program' && r.institution_path !== largest.path);
assert.ok(!later.includes(`href="${unrelated.path}"`));
const originals = data.rows.filter(r => r.origin === 'wordpress' && ['institution', 'program', 'pathway'].includes(r.kind));
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < originals.length) {
        const row = originals[next++];
        const response = await get(row.path);
        assert.equal(response.status, 200, row.path);
        const page = await response.text();
        assert.match(page, /name="generator" content="Frontbase"/);
        assert.match(page, /noindex,nofollow/);
    }
}));
let editorialRoutes = 0;
if (editorialPath) {
    const editorial = JSON.parse(await readFile(editorialPath, 'utf8'));
    for (const row of editorial.rows) {
        const response = await get(row.original_path);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const body = await response.text();
        assert.match(body, /EDITORIAL PREVIEW/);
        assert.equal((body.match(/<h1\b/g) || []).length, 1);
        assert.doesNotMatch(body, /<iframe\b|<form\b|\bonclick=|seo_source_evidence|source_body_sha256/);
        if (row.collection_role === 'article') assert.ok(body.includes(row.public_byline));
        if (row.review_flags.includes('shortcode_needs_review')) assert.match(body, /form or widget has not been migrated/);
        const layout = await (await get('/__draft/layout.json?path=' + encodeURIComponent(row.original_path))).json();
        assert.equal(layout.publicationApproved, false);
        assert.equal(layout.layout.content[0].type, 'Container');
        assert.equal(layout.slug, row.original_path.slice(1, -1));
        editorialRoutes++;
    }
}
console.log(JSON.stringify({ editorialRoutes, originalListingRoutes: originals.length, originalSelection: original.selected,
    expandedSelection: expanded.selected, preservedPaths: 'pass', filters: 'pass', contacts: 'pass',
    draftGuards: 'pass', layoutExport: 'pass', renderer: 'Frontbase engine' }));
