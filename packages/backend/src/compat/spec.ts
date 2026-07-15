/**
 * CF-22 P1 / D2-D3 — product contract loading + framework spec assembly.
 *
 * The framework emits its OWN OpenAPI spec for the product-compatible surface.
 * It is built by DECLARING every vendored community operation (so removing a
 * declaration → a missing endpoint the drift gate catches), marking each
 * `x-implemented` (false = 501 stub; true = real handler), and carrying the
 * vendored schemas verbatim (the contract IS the source — both stubs and
 * implemented routes validate against the same vendored Zod, so their emitted
 * schemas match the product by construction; the drift gate verifies that).
 *
 * Vendored inputs (packages/backend/contracts/, pinned via PRODUCT_COMMIT):
 *   - openapi.community.json  (284 ops / 202 schemas / 31 tags)
 *   - zod.gen.ts              (zod v3 — runtime validation in the routes)
 */
import SPEC from './community-spec.js';

export type Method = 'get' | 'post' | 'put' | 'delete' | 'patch';
export const METHODS: readonly Method[] = ['get', 'post', 'put', 'delete', 'patch'] as const;

export interface Op { method: Method; path: string; }
export type OpKey = string; // `${METHOD} ${path}`

export const opKey = (method: string, path: string): OpKey => `${method.toUpperCase()} ${path}`;

/** The vendored product community spec (embedded, Workers-safe — no node:fs). */
export function productSpec(): any {
    return SPEC;
}

/** Every operation in the vendored community spec, in stable (path, method) order. */
export function productOps(): Op[] {
    const ops: Op[] = [];
    for (const [path, item] of Object.entries(productSpec().paths ?? {}) as [string, any][]) {
        for (const m of METHODS) {
            if (item[m]) ops.push({ method: m, path });
        }
    }
    ops.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
    return ops;
}

/** The product's tag for an op (first tag), for the conformance table. */
export function productTag(method: string, path: string): string {
    const item = productSpec().paths?.[path]?.[method.toLowerCase()];
    return item?.tags?.[0] ?? '?';
}

/**
 * Build the framework's emitted OpenAPI document: every vendored op declared,
 * with `x-implemented` set from the IMPLEMENTED registry. Schemas/path items are
 * carried from the vendored spec (the contract); implemented ops are marked true.
 *
 * Removing a declaration here (or in the stub registry) removes the op from the
 * emitted spec → the drift gate (contract-diff.mjs) reports it MISSING.
 */
export function buildFrameworkSpec(implemented: Set<OpKey>): any {
    const product = productSpec();
    const paths: Record<string, any> = {};
    for (const op of productOps()) {
        const key = opKey(op.method, op.path);
        const item = product.paths[op.path][op.method];
        // Deep-ish copy of the operation, stamp the implementation flag.
        const copy = JSON.parse(JSON.stringify(item));
        copy['x-implemented'] = implemented.has(key);
        (paths[op.path] ??= {})[op.method] = copy;
    }
    return {
        openapi: product.openapi,
        info: { ...product.info, title: `${product.info.title} (framework compat surface)` },
        // Components are shared verbatim — stubs reference them, and implemented
        // routes validate against the same vendored Zod so the schemas agree.
        components: JSON.parse(JSON.stringify(product.components ?? {})),
        paths,
    };
}

/** Convert OpenAPI path `/x/{id}/` → Hono route `/x/:id/`, preserving the exact
 *  trailing slash. The product client calls the EXACT OpenAPI path (with/without
 *  trailing slash as defined), so the stub must match it verbatim — only the
 *  `{param}` → `:param` syntax changes. */
export function toHonoPath(openapiPath: string): string {
    return openapiPath.replace(/\{([^}]+)\}/g, ':$1');
}
