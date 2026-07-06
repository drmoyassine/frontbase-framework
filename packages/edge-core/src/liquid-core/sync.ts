/**
 * Synchronous fast-path resolver for plain {{ dot.path }} interpolation.
 *
 * LiquidJS render is async-only. For the common case — a string containing
 * only `{{ a.b.c }}` tokens (no `{% %}` tags, no `|` filters) — we resolve
 * synchronously and avoid an async round-trip / render flash. Anything more
 * complex (tags, filters, loops) is reported as non-simple by
 * `isSimpleInterpolation` so the caller falls back to the async `renderSafe`.
 *
 * This is the generalization of the edge client's `resolveClientTemplate` over a
 * flat context object (e.g. `{ record, user, page, ... }`).
 */

export function resolvePath(obj: any, path: string): any {
    if (obj == null) return undefined;
    const parts = String(path).split('.');
    let cur: any = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

function formatScalar(val: any): string {
    if (typeof val === 'object') {
        try {
            return JSON.stringify(val);
        } catch {
            return String(val);
        }
    }
    return String(val);
}

/**
 * True when `template` is a string that contains only plain `{{ dot.path }}`
 * interpolation (or no interpolation at all). False for non-strings, or strings
 * containing `{% %}` tags, filters (`|`), or any expression that isn't a bare
 * dot path — those need the full async engine.
 */
export function isSimpleInterpolation(template: unknown): template is string {
    if (typeof template !== 'string') return false;
    if (template.includes('{%') || template.includes('%}')) return false;
    const matches = template.match(/\{\{([\s\S]*?)\}\}/g);
    if (!matches) return true; // plain literal string
    return matches.every(raw => {
        const inner = raw.slice(2, -2).trim();
        if (!inner) return false;
        if (inner.includes('|')) return false;
        // A bare dot path (a.b[0].c) contains no spaces; filters/expressions do.
        if (inner.includes(' ')) return false;
        return true;
    });
}

/** Resolve a simple-interpolation template synchronously against a flat context. */
export function renderSync(template: string, context: Record<string, any> = {}): string {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr) => {
        const val = resolvePath(context, String(expr).trim());
        return val !== undefined && val !== null ? formatScalar(val) : '';
    });
}
