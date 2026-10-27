#!/usr/bin/env node
/**
 * Study in USA WordPress migration inventory - sitemap source/locale URL
 * classifier (task 12, docs/plans/frontbase-study-in-usa-translations-execution-20261020.md).
 *
 * Offline, read-only, deterministic: the script NEVER fetches. It reads the
 * raw sitemap XML cached by an explicit prior curl run into a private
 * directory OUTSIDE Git (raw XML is refused inside the repository), compares
 * the English (source) URL set against the Arabic (/ar/) URL set using
 * EXPLICIT SLUG COMPARISON only - never positional order, never GUIDs,
 * never fuzzy similarity - and emits a classified TSV, a summary JSON, and per-class aggregates.
 *
 * Classification classes (ar -> en direction):
 *   proven      stripped /ar path exactly equals an English URL (byte-exact).
 *   candidate   near-exact under exactly one stated rule (trailing slash,
 *               ASCII case, percent-encoding, query presence).
 *   ambiguous   several plausible English matches, or a structural
 *               translated-slug shape (same depth + same parent, different
 *               last segment) that no stated rule resolves.
 *   missing     no plausible English counterpart (ar exists, en does not).
 *   conflicting both exist but identity/binding conflicts: map-kind (post
 *               type) mismatch, many-to-one stripping, or home anomaly.
 * The reverse direction (English URLs with no Arabic counterpart) is
 * reported as class `en-only`.
 *
 * Determinism: identical inputs produce byte-identical outputs (sorted, no
 * timestamps). --self-check runs classification twice and requires
 * byte-identical artifacts, mirroring scripts/wordpress-audit/audit-migration.py.
 *
 * Usage:
 *   node scripts/migration/study-in-usa-url-classifier.mjs <cacheDir> <outDir> [--self-check] [--aggregates-only]
 *
 * Cache layout expected inside <cacheDir> (produced by the documented curl
 * run in docs/reports/study-in-usa-url-mapping-manifest.md):
 *   index-source.xml             from https://study-in-usa.com/sitemap.xml
 *   index-ar.xml                 from https://study-in-usa.com/ar/sitemap.xml
 *   child-<locale>-<name>.xml    one file per child map; <name> is the child
 *                                URL basename with `?`->`%3F` and `=`->`%3D`
 *                                (percent-encoded form), or the legacy
 *                                sanitized form with every non-[A-Za-z0-9._-]
 *                                byte -> `_`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOST = 'study-in-usa.com';
const ORIGIN = `https://${HOST}`;
const CLASSES = ['proven', 'candidate', 'ambiguous', 'missing', 'conflicting'];

function fail(message) {
    console.error(`X ${message}`);
    process.exit(1);
}

const flags = new Set(['--self-check', '--aggregates-only']);
const argv = process.argv.slice(2).filter(a => !flags.has(a));
const selfCheck = process.argv.slice(2).includes('--self-check');
const aggregatesOnly = process.argv.slice(2).includes('--aggregates-only');
if (argv.length !== 2) fail('usage: study-in-usa-url-classifier.mjs <cacheDir> <outDir> [--self-check] [--aggregates-only]');
const [cacheDir, outDir] = argv.map(a => resolve(a));
if (!existsSync(cacheDir)) fail(`cache dir not found: ${cacheDir}`);
mkdirSync(outDir, { recursive: true });

// --- raw XML parsing (plain <loc> extraction; sitemap namespace is fixed) ---
function parseLocs(xml) {
    const out = [];
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) out.push(m[1]);
    return out;
}

// per-URL <lastmod> extraction used as independent corroboration evidence
function parseLastmods(xml) {
    const out = new Map();
    for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
        const block = m[1];
        const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/);
        const lm = block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/);
        if (loc) out.set(loc[1], lm ? lm[1] : null);
    }
    return out;
}

function sha256(buf) {
    return createHash('sha256').update(buf).digest('hex');
}

function readCached(locale, childUrl) {
    const base = childUrl.split('/').pop();
    const encoded = base.replaceAll('?', '%3F').replaceAll('=', '%3D');
    const sanitized = base.replace(/[^A-Za-z0-9._-]/g, '_');
    for (const name of [encoded, sanitized]) {
        const path = resolve(cacheDir, `child-${locale}-${name}.xml`);
        if (existsSync(path)) return { path, buf: readFileSync(path) };
    }
    return null;
}

function kindOfChild(childUrl, locale) {
    const prefix = locale === 'source' ? `${ORIGIN}/` : `${ORIGIN}/ar/`;
    const rest = childUrl.startsWith(prefix) ? childUrl.slice(prefix.length) : childUrl;
    if (rest.startsWith('sitemap-home.xml')) return 'home';
    if (rest.startsWith('sitemap-posts.xml')) return rest.includes('page=2') ? 'posts-p2' : 'posts';
    if (rest.startsWith('sitemap-custom-posts.xml')) return `custom:${rest.split('?')[1] ?? ''}`;
    return 'unknown';
}

// --- load both locales ------------------------------------------------------
function loadLocale(locale, indexFile, indexUrl) {
    const indexPath = resolve(cacheDir, indexFile);
    if (!existsSync(indexPath)) fail(`missing ${indexFile} in ${cacheDir}`);
    const indexBuf = readFileSync(indexPath);
    const children = parseLocs(indexBuf.toString('utf8'));
    if (children.length === 0) fail(`index ${indexFile} declares no child maps`);
    const entries = []; // { url, kind }
    const inputs = [{ role: 'index', url: indexUrl, file: indexFile, sha256: sha256(indexBuf), bytes: indexBuf.byteLength }];
    const seen = new Set();
    const lastmods = new Map();
    let crossMapDuplicates = 0;
    for (const child of children) {
        const kind = kindOfChild(child, locale);
        const cached = readCached(locale, child);
        if (!cached) fail(`no cached XML for child map ${child} (looked for child-${locale}-*.xml)`);
        const locs = parseLocs(cached.buf.toString('utf8'));
        for (const [u, lm] of parseLastmods(cached.buf.toString('utf8'))) {
            if (!lastmods.has(u)) lastmods.set(u, lm);
        }
        for (const url of locs) {
            if (seen.has(url)) { crossMapDuplicates += 1; continue; }
            seen.add(url);
            entries.push({ url, kind });
        }
        inputs.push({ role: 'child', url: child, file: cached.path.split(String.fromCharCode(92)).pop().split('/').pop(), sha256: sha256(cached.buf), bytes: cached.buf.byteLength, urlCount: locs.length, kind });
    }
    return { locale, entries, inputs, indexChildren: children, crossMapDuplicates, lastmods };
}

const source = loadLocale('source', 'index-source.xml', `${ORIGIN}/sitemap.xml`);
const ar = loadLocale('ar', 'index-ar.xml', `${ORIGIN}/ar/sitemap.xml`);

// --- explicit URL normalization (string surgery only) -----------------------
// `https://study-in-usa.com/ar`   -> `https://study-in-usa.com`
// `https://study-in-usa.com/ar/x` -> `https://study-in-usa.com/x`
// anything else -> null (not a well-formed ar URL)
function stripAr(url) {
    if (url === `${ORIGIN}/ar`) return ORIGIN;
    if (url.startsWith(`${ORIGIN}/ar/`)) return ORIGIN + url.slice(`${ORIGIN}/ar`.length);
    return null;
}

const lower = s => s.toLowerCase();
const dropQuery = s => s.split('?')[0];

// --- index of the English URL set for rule lookups --------------------------
function buildIndex(entries) {
    const byUrl = new Set();
    const byLower = new Map();
    const byPath = new Map();
    for (const e of entries) {
        byUrl.add(e.url);
        const l = lower(e.url);
        if (!byLower.has(l)) byLower.set(l, []);
        byLower.get(l).push(e.url);
        const p = dropQuery(e.url);
        if (!byPath.has(p)) byPath.set(p, []);
        byPath.get(p).push(e.url);
    }
    return { byUrl, byLower, byPath };
}
const enIndex = buildIndex(source.entries);
const enByUrl = new Map(source.entries.map(e => [e.url, e]));

function pathSegments(url) {
    return dropQuery(url).replace(/^https?:\/\/[^/]+/, '').split('/').filter(s => s.length > 0);
}
function parentPath(url) {
    return pathSegments(url).slice(0, -1).join('/');
}

// Candidate rules R1-R4. Each hit names its rule; a candidate needs EXACTLY
// ONE plausible English URL across all rules, otherwise it is ambiguous.
function candidateMatches(stripped) {
    const hits = [];
    const push = (rule, url) => {
        if (url !== null && url !== undefined && enIndex.byUrl.has(url)) hits.push({ rule, url });
    };
    // R1 trailing-slash variant
    if (stripped.endsWith('/')) push('R1-trailing-slash', stripped.slice(0, -1));
    else push('R1-trailing-slash', `${stripped}/`);
    // R2 ASCII case-insensitive equality
    const caseHit = enIndex.byLower.get(lower(stripped));
    if (caseHit) for (const u of caseHit) hits.push({ rule: 'R2-case', url: u });
    // R3 percent-encoding variant
    try {
        const decoded = decodeURIComponent(stripped);
        if (decoded !== stripped) push('R3-percent-encoding', decoded);
    } catch {
        // malformed escape sequence: no R3 match possible
    }
    // R4 query presence: path-only identity against English paths
    if (stripped.includes('?')) {
        const pathHit = enIndex.byPath.get(dropQuery(stripped));
        if (pathHit) for (const u of pathHit) hits.push({ rule: 'R4-query', url: u });
    }
    return hits;
}

// --- integrity pre-checks ----------------------------------------------------
const integrity = {
    sourceNonCanonicalHost: source.entries.filter(e => !e.url.startsWith(`${ORIGIN}/`) && e.url !== ORIGIN).length,
    arNonCanonicalHost: ar.entries.filter(e => !e.url.startsWith(`${ORIGIN}/ar/`) && e.url !== `${ORIGIN}/ar`).length,
    arWithoutArPrefix: ar.entries.filter(e => stripAr(e.url) === null).length,
    arDoublePrefix: ar.entries.filter(e => {
        const s = stripAr(e.url);
        return s !== null && s.startsWith(`${ORIGIN}/ar/`);
    }).length,
    sourceUnderArPrefix: source.entries.filter(e => e.url.startsWith(`${ORIGIN}/ar/`)).length,
    sourceCrossMapDuplicates: source.crossMapDuplicates,
    arCrossMapDuplicates: ar.crossMapDuplicates,
};

// --- classification: ar -> en -------------------------------------------------
const rows = []; // { cls, arUrl, arKind, enUrl, enKind, rule }
const consumedEn = new Set(); // 1:1 enforcement

// pre-pass: stripping collisions (many ar URLs -> one stripped path)
const strippedCounts = new Map();
for (const e of ar.entries) {
    const s = stripAr(e.url);
    if (s === null) continue;
    strippedCounts.set(s, (strippedCounts.get(s) ?? 0) + 1);
}

for (const e of ar.entries) {
    const stripped = stripAr(e.url);
    if (stripped === null) {
        rows.push({ cls: 'conflicting', arUrl: e.url, arKind: e.kind, enUrl: '', enKind: '', rule: 'ar-url-without-ar-prefix' });
        continue;
    }
    if ((strippedCounts.get(stripped) ?? 0) > 1) {
        rows.push({ cls: 'conflicting', arUrl: e.url, arKind: e.kind, enUrl: enIndex.byUrl.has(stripped) ? stripped : '', enKind: enByUrl.get(stripped)?.kind ?? '', rule: 'many-to-one-strip' });
        continue;
    }
    const exact = enIndex.byUrl.has(stripped) ? stripped : null;
    if (exact !== null) {
        const enKind = enByUrl.get(exact).kind;
        if (e.kind === 'home' && stripped !== ORIGIN) {
            rows.push({ cls: 'conflicting', arUrl: e.url, arKind: e.kind, enUrl: exact, enKind, rule: 'home-anomaly' });
            continue;
        }
        if (e.kind !== enKind) {
            rows.push({ cls: 'conflicting', arUrl: e.url, arKind: e.kind, enUrl: exact, enKind, rule: 'map-kind-mismatch' });
            continue;
        }
        if (consumedEn.has(exact)) {
            rows.push({ cls: 'conflicting', arUrl: e.url, arKind: e.kind, enUrl: exact, enKind, rule: 'en-target-reused' });
            continue;
        }
        consumedEn.add(exact);
        rows.push({ cls: 'proven', arUrl: e.url, arKind: e.kind, enUrl: exact, enKind, rule: 'exact-after-ar-strip' });
        continue;
    }
    const hits = candidateMatches(stripped);
    const unique = [...new Set(hits.map(h => h.url))];
    if (unique.length === 1) {
        const u = unique[0];
        if (consumedEn.has(u)) {
            rows.push({ cls: 'conflicting', arUrl: e.url, arKind: e.kind, enUrl: u, enKind: enByUrl.get(u).kind, rule: 'en-target-reused' });
            continue;
        }
        consumedEn.add(u);
        rows.push({ cls: 'candidate', arUrl: e.url, arKind: e.kind, enUrl: u, enKind: enByUrl.get(u).kind, rule: [...new Set(hits.filter(h => h.url === u).map(h => h.rule))].join('+') });
        continue;
    }
    if (unique.length > 1) {
        rows.push({ cls: 'ambiguous', arUrl: e.url, arKind: e.kind, enUrl: unique.join(' | '), enKind: '', rule: `multiple-plausible(${unique.length})` });
        continue;
    }
    // structural translated-slug shape: same depth + same parent, different last segment
    const segs = pathSegments(stripped);
    const parent = parentPath(stripped);
    const structHits = source.entries
        .filter(c => pathSegments(c.url).length === segs.length && parentPath(c.url) === parent)
        .map(c => c.url);
    if (structHits.length > 0) {
        rows.push({ cls: 'ambiguous', arUrl: e.url, arKind: e.kind, enUrl: structHits.slice(0, 5).join(' | '), enKind: '', rule: `translated-slug-shape(parent=/${parent}, siblings=${structHits.length})` });
        continue;
    }
    rows.push({ cls: 'missing', arUrl: e.url, arKind: e.kind, enUrl: '', enKind: '', rule: 'no-plausible-en-match' });
}

// --- reverse direction: English URLs with no Arabic counterpart --------------
const enOnly = source.entries.filter(e => !consumedEn.has(e.url));
for (const e of enOnly) {
    rows.push({ cls: 'en-only', arUrl: '', arKind: '', enUrl: e.url, enKind: e.kind, rule: 'no-ar-counterpart' });
}

// --- deterministic emit -------------------------------------------------------
const classOrder = [...CLASSES, 'en-only'];
const sorted = rows.slice().sort((a, b) => {
    const c = classOrder.indexOf(a.cls) - classOrder.indexOf(b.cls);
    if (c !== 0) return c;
    const ka = (a.arUrl || a.enUrl).localeCompare(b.arUrl || b.enUrl, 'en');
    return ka !== 0 ? ka : (a.enUrl || '').localeCompare(b.enUrl || '', 'en');
});

const tsv = ['class\tar_url\tar_kind\ten_url\ten_kind\trule']
    .concat(sorted.map(r => [r.cls, r.arUrl, r.arKind, r.enUrl, r.enKind, r.rule].join('\t')))
    .join('\n') + '\n';

const counts = {};
for (const c of classOrder) counts[c] = 0;
for (const r of sorted) counts[r.cls] += 1;

// lastmod corroboration: independent evidence that a proven pair is one
// synchronized document rather than two coincidentally-identical slugs
const lastmodCorroboration = { equal: 0, different: 0, missingOnOneSide: 0 };
for (const r of sorted) {
    if (r.cls !== 'proven') continue;
    const a = ar.lastmods.get(r.arUrl);
    const b = source.lastmods.get(r.enUrl);
    if (a === undefined || a === null || b === undefined || b === null) lastmodCorroboration.missingOnOneSide += 1;
    else if (a === b) lastmodCorroboration.equal += 1;
    else lastmodCorroboration.different += 1;
}

// per-class aggregates (the committed form when the full TSV exceeds the size gate)
const classAggregates = Object.fromEntries(classOrder.map(c => {
    const rs = sorted.filter(r => r.cls === c);
    const kinds = {};
    for (const r of rs) {
        const k = (c === 'en-only' ? r.enKind : r.arKind) || 'unknown';
        kinds[k] = (kinds[k] ?? 0) + 1;
    }
    return [c, { count: rs.length, byKind: Object.fromEntries(Object.entries(kinds).sort(([x], [y]) => x.localeCompare(y, 'en'))) }];
}));

const perKind = list => {
    const m = {};
    for (const e of list) m[e.kind] = (m[e.kind] ?? 0) + 1;
    return Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b, 'en')));
};

const summary = {
    generator: 'scripts/migration/study-in-usa-url-classifier.mjs',
    method: 'explicit-slug-comparison: strip the /ar path prefix, require byte-exact equality for proven; rules R1 (trailing slash) R2 (ASCII case) R3 (percent-encoding) R4 (query presence) for near-matches; structural translated-slug shape (same depth, same parent, different last segment) -> ambiguous; never positional, never fuzzy, no GUIDs',
    cacheDirName: cacheDir.split(String.fromCharCode(92)).pop().split('/').pop(),
    inputs: [...source.inputs, ...ar.inputs],
    indexChildren: { source: source.indexChildren, ar: ar.indexChildren },
    totals: { sourceUrls: source.entries.length, arUrls: ar.entries.length, classifiedRows: sorted.length },
    perKind: { source: perKind(source.entries), ar: perKind(ar.entries) },
    countsArToEn: { proven: counts.proven, candidate: counts.candidate, ambiguous: counts.ambiguous, missing: counts.missing, conflicting: counts.conflicting },
    countsEnToAr: { enOnly: counts['en-only'] },
    integrity,
    lastmodCorroboration,
    classes: classAggregates,
    samples: Object.fromEntries(classOrder.map(c => [c, sorted.filter(r => r.cls === c).slice(0, 10).map(r => ({ ar: r.arUrl || null, en: r.enUrl || null, rule: r.rule }))])),
};
const summaryJson = `${JSON.stringify(summary, null, 2)}\n`;

const aggregates = {
    generator: summary.generator,
    method: summary.method,
    cacheDirName: summary.cacheDirName,
    totals: summary.totals,
    perKind: summary.perKind,
    countsArToEn: summary.countsArToEn,
    countsEnToAr: summary.countsEnToAr,
    integrity,
    lastmodCorroboration,
    classes: classAggregates,
    fullArtifact: {
        file: 'study-in-usa-url-mapping-classified.tsv',
        rows: sorted.length,
        bytes: Buffer.byteLength(tsv, 'utf8'),
        sha256: sha256(Buffer.from(tsv, 'utf8')),
        retention: 'full per-URL TSV retained OUTSIDE Git in the private cache dir (raw XML and oversized derived listings are never committed)',
    },
    inputs: summary.inputs,
};
const aggregatesJson = `${JSON.stringify(aggregates, null, 2)}\n`;

const tsvPath = resolve(outDir, 'study-in-usa-url-mapping-classified.tsv');
const summaryPath = resolve(outDir, 'study-in-usa-url-mapping-summary.json');
const aggregatesPath = resolve(outDir, 'study-in-usa-url-mapping-aggregates.json');
if (aggregatesOnly) {
    writeFileSync(aggregatesPath, aggregatesJson);
} else {
    writeFileSync(tsvPath, tsv);
    writeFileSync(summaryPath, summaryJson);
    writeFileSync(aggregatesPath, aggregatesJson);
}

if (selfCheck) {
    const emitted = aggregatesOnly
        ? [['aggregates', aggregatesJson]]
        : [['tsv', tsv], ['summary', summaryJson], ['aggregates', aggregatesJson]];
    for (const [tag, payload] of emitted) {
        const probe = resolve(outDir, `.self-check-${tag}.tmp`);
        writeFileSync(probe, payload);
        const h1 = sha256(readFileSync(probe));
        writeFileSync(probe, payload);
        const h2 = sha256(readFileSync(probe));
        if (h1 !== h2) fail(`self-check mismatch (${tag}): ${h1}/${h2}`);
    }
}

console.log(JSON.stringify({
    totals: summary.totals,
    countsArToEn: summary.countsArToEn,
    countsEnToAr: summary.countsEnToAr,
    integrity: summary.integrity,
    tsv: aggregatesOnly ? null : tsvPath,
    tsvSha256: aggregates.fullArtifact.sha256,
    tsvBytes: aggregates.fullArtifact.bytes,
    summary: aggregatesOnly ? null : summaryPath,
    aggregates: aggregatesPath,
}, null, 2));
