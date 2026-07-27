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
 *   - openapi.community.json  (286 ops / 202 schemas / 31 tags)
 *   - zod.gen.ts              (zod v3 — runtime validation in the routes)
 */
import SPEC from './community-spec.js';

export type Method = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options';
export const METHODS: readonly Method[] = ['get', 'post', 'put', 'delete', 'patch', 'options'] as const;

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

/**
 * CF-22 Gate 1 — the set of contract ops the app ACTUALLY serves, read off Hono's
 * route table.
 *
 * This replaces a hand-maintained registry of 285 op keys. That registry was a
 * second source of truth that nothing verified: listing an op there suppressed its
 * 501 stub AND stamped `x-implemented: true`, so a typo'd path or a handler that
 * was never wired would emit a spec claiming an endpoint that 404s in production.
 * Deriving from the routes makes that unrepresentable — if no handler is
 * registered, the op is not implemented, by construction.
 *
 * MUST be called BEFORE registerStubs: a 501 stub is a registered Hono route like
 * any other, so calling this on a finished app reports the whole contract as
 * implemented. Use `implementedOps(app)` to read the set captured at build time.
 *
 * Note this is config-dependent: the ~20 `/api/auth/*` ops register only when
 * `sessionSecret` + `userStoreFor` are supplied, so callers wanting the full
 * surface (spec emission) must build a fully-configured app.
 */
export function routedOps(app: { routes?: { method: string; path: string }[] }): Set<OpKey> {
    const contract = new Set(productOps().map((op) => opKey(op.method, op.path)));
    const found = new Set<OpKey>();
    for (const { method, path } of app.routes ?? []) {
        if (method === 'ALL' || path.includes('*')) continue; // middleware, not an endpoint
        // Hono `:param` → OpenAPI `{param}`. A param named differently from the
        // contract yields a key the contract lacks, which is exactly the mistake
        // we want surfaced (it shows up as MISSING rather than silently passing).
        const key = opKey(method, path.replace(/:([A-Za-z0-9_]+)/g, '{$1}'));
        if (contract.has(key)) found.add(key);
    }
    return found;
}

/** Where createCompatApp stashes the pre-stub derived set. */
const IMPLEMENTED_OPS = Symbol.for('frontbase.compat.implementedOps');

export function attachImplementedOps(app: object, ops: Set<OpKey>): void {
    (app as Record<symbol, unknown>)[IMPLEMENTED_OPS] = ops;
}

/**
 * The ops a built compat app actually implements — the set `routedOps` produced
 * before the 501 stubs were layered on. Throws rather than guessing, because a
 * silently-wrong implemented set is exactly the failure this replaced.
 */
export function implementedOps(app: object): Set<OpKey> {
    const ops = (app as Record<symbol, unknown>)[IMPLEMENTED_OPS];
    if (!(ops instanceof Set)) throw new Error('implementedOps: app was not built by createCompatApp');
    return ops as Set<OpKey>;
}

/** Convert OpenAPI path `/x/{id}/` → Hono route `/x/:id/`, preserving the exact
 *  trailing slash. The product client calls the EXACT OpenAPI path (with/without
 *  trailing slash as defined), so the stub must match it verbatim — only the
 *  `{param}` → `:param` syntax changes. */
export function toHonoPath(openapiPath: string): string {
    return openapiPath.replace(/\{([^}]+)\}/g, ':$1');
}
