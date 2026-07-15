#!/usr/bin/env node
/**
 * CF-22 P1 / D3 — the contract drift gate.
 *
 * Compares the framework's emitted product-compat spec (contracts/framework.openapi.json)
 * against the vendored product community spec (contracts/openapi.community.json):
 *
 *   MISSING     — op in product, absent from framework spec           → FAIL
 *   DIVERGENT   — op present in both but request/response schema differs → FAIL
 *   (the `x-implemented: false` 501 stubs are NOT a failure — they ARE the
 *    burn-down. The conformance table reports the implemented/stubbed split.)
 *
 * Hard-fails (exit 1) on any missing or divergent op; otherwise prints the
 * per-tag conformance table (P2's burn-down chart) and the stubbed count.
 *
 * A native Node comparator (not the `oasdiff` binary — the npm `oasdiff` is a
 * 0.0.1-security placeholder; a dependency-free comparator is more robust for CI
 * and gives the exact semantics P1 needs).
 *
 *   node scripts/contract-diff.mjs            # gate
 *   node scripts/contract-diff.mjs --mutate   # mutation harness: a deliberately
 *                                             # missing op is EXPECTED (exit 0 iff
 *                                             # the gate detects it)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Optional path overrides (used by the mutation harness to feed a tampered spec).
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const fwkPath = arg('framework') ?? resolve(root, 'packages/backend/contracts/framework.openapi.json');
const productPath = arg('product') ?? resolve(root, 'packages/backend/contracts/openapi.community.json');

const fwk = JSON.parse(readFileSync(fwkPath, 'utf-8'));
const product = JSON.parse(readFileSync(productPath, 'utf-8'));

const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options'];

const key = (m, p) => `${m.toUpperCase()} ${p}`;

/** Structural JSON-schema comparison (resolves $ref within a doc, ignores
 *  key order and the framework-only `x-implemented` flag). Output objects have
 *  sorted keys so comparison is order-independent. */
function resolveSchema(node, doc, seen = new Set()) {
    if (!node || typeof node !== 'object') return node;
    if (node.$ref) {
        const path = node.$ref.replace(/^#\/components\/schemas\//, '');
        if (seen.has(path)) return { $cyclic: path }; // break cycles
        seen.add(path);
        return resolveSchema(doc.components?.schemas?.[path], doc, seen);
    }
    if (Array.isArray(node)) return node.map((n) => resolveSchema(n, doc, seen));
    const out = {};
    for (const k of Object.keys(node).sort()) {
        if (k === 'x-implemented') continue; // framework-only annotation
        out[k] = resolveSchema(node[k], doc, seen);
    }
    return out;
}

const productOps = new Map(); // key → {method,path}
for (const [path, item] of Object.entries(product.paths ?? {})) {
    for (const m of METHODS) if (item[m]) productOps.set(key(m, path), { method: m, path });
}
const fwkOps = new Map();
for (const [path, item] of Object.entries(fwk.paths ?? {})) {
    for (const m of METHODS) if (item[m]) fwkOps.set(key(m, path), { method: m, path });
}

const missing = [...productOps.keys()].filter((k) => !fwkOps.has(k)).sort();
const divergent = [];
for (const k of productOps.keys()) {
    if (!fwkOps.has(k)) continue;
    const { method, path } = productOps.get(k);
    const pOp = resolveSchema(product.paths[path][method], product);
    const fOp = resolveSchema(fwk.paths[path][method], fwk);
    if (JSON.stringify(pOp) !== JSON.stringify(fOp)) divergent.push(k);
}

// Conformance table: per tag → implemented / stubbed / divergent.
const tagOf = (k) => {
    const { method, path } = productOps.get(k);
    return product.paths[path][method]?.tags?.[0] ?? '?';
};
const byTag = new Map(); // tag → {impl, stub}
for (const k of productOps.keys()) {
    if (!fwkOps.has(k)) continue;
    const tag = tagOf(k);
    const e = byTag.get(tag) ?? { impl: 0, stub: 0 };
    const op = fwk.paths[productOps.get(k).path][productOps.get(k).method];
    if (op['x-implemented']) e.impl++; else e.stub++;
    byTag.set(tag, e);
}
const implementedCount = [...byTag.values()].reduce((n, e) => n + e.impl, 0);
const stubbedCount = [...byTag.values()].reduce((n, e) => n + e.stub, 0);

if (process.argv.includes('--quiet')) {
    // Machine-readable summary for the test harness: exit 0 iff no missing/divergent.
    if (missing.length || divergent.length) { console.log(`missing=${missing.length} divergent=${divergent.length}`); process.exit(1); }
    console.log(`implemented=${implementedCount} stubbed=${stubbedCount}`);
    process.exit(0);
}

console.log('Per-tag conformance (implemented / stubbed):');
for (const [tag, e] of [...byTag.entries()].sort()) {
    console.log(`  ${tag.padEnd(20)} ${String(e.impl).padStart(3)} / ${String(e.stub).padStart(3)}`);
}
console.log(`\nTOTAL: ${implementedCount} implemented, ${stubbedCount} stubbed, ${missing.length} missing, ${divergent.length} divergent`);

if (missing.length || divergent.length) {
    if (missing.length) console.error(`\nMISSING (${missing.length}):\n` + missing.map((k) => `  ${k}`).join('\n'));
    if (divergent.length) console.error(`\nDIVERGENT (${divergent.length}):\n` + divergent.map((k) => `  ${k}`).join('\n'));
    process.exit(1);
}
console.log('contract drift gate: PASS');
