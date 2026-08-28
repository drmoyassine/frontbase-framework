import type { LiquidEngine } from './types';

/** Tunable DoS limits for rendering user-authored templates. */
export interface LiquidLimits {
    /** Max characters of template source (default 100_000). Parse-time guard. */
    maxTemplateLength?: number;
    /** Max nesting depth of block tags `{% if %}/{% for %}/...` (default 64). Parse-time guard. */
    maxNestingDepth?: number;
    /**
     * Max total tag/output/loop iterations rendered in one call (default 100_000).
     * Maps to LiquidJS `templateLimit` — enforced *inside* the render pump, so it
     * catches CPU-bound runaway loops (unlike an external wall-clock timer).
     */
    maxIterations?: number;
    /**
     * Wall-clock budget per render in ms (default 2_000). Maps to LiquidJS
     * `renderLimit` — also enforced internally.
     */
    timeoutMs?: number;
}

export const DEFAULT_LIMITS: Required<LiquidLimits> = {
    maxTemplateLength: 100_000,
    maxNestingDepth: 64,
    maxIterations: 100_000,
    timeoutMs: 2_000,
};

export interface RenderSafeOptions extends LiquidLimits {
    /** Use the compiled-template LRU cache (default: true). */
    cache?: boolean;
}

export interface RenderResult {
    ok: boolean;
    output?: string;
    error?: string;
}

const BLOCK_TAGS = new Set(['if', 'unless', 'for', 'case', 'capture', 'tablerow', 'raw']);

/**
 * Estimate the maximum nesting depth of block tags in a template. Used as a
 * cheap parse-time DoS guard before invoking the engine.
 */
export function maxBlockDepth(template: string): number {
    let depth = 0;
    let max = 0;
    const re = /\{%-?\s*(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(template)) !== null) {
        const name = m[1].toLowerCase();
        if (name.startsWith('end')) {
            const base = name.slice(3);
            if (BLOCK_TAGS.has(base)) depth = Math.max(0, depth - 1);
        } else if (BLOCK_TAGS.has(name)) {
            depth++;
            if (depth > max) max = depth;
        }
    }
    return max;
}

// --- compiled-template LRU cache (per engine instance) ---
const MAX_CACHE = 256;
const cacheStore = new WeakMap<object, Map<string, unknown[]>>();

function getCache(engine: object): Map<string, unknown[]> {
    let c = cacheStore.get(engine);
    if (!c) {
        c = new Map();
        cacheStore.set(engine, c);
    }
    return c;
}

function parseCached(engine: LiquidEngine, template: string, useCache: boolean): unknown[] {
    if (!useCache) return engine.parse(template);
    const cache = getCache(engine);
    const hit = cache.get(template);
    if (hit) {
        cache.delete(template);
        cache.set(template, hit); // refresh recency
        return hit;
    }
    const tpl = engine.parse(template);
    cache.set(template, tpl);
    if (cache.size > MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    return tpl;
}

/**
 * Render a template safely, enforcing DoS limits.
 *
 * Parse-time guards (template length, nesting depth) reject pathological inputs
 * before the engine runs. The render itself enforces `templateLimit` (total
 * iterations) and `renderLimit` (wall-clock) *inside* LiquidJS's render pump, so
 * a CPU-bound runaway loop aborts quickly instead of hanging the worker/tab.
 * Compiled templates are cached per engine.
 *
 * This never throws — callers can `await` and branch on `ok`.
 */
export async function renderSafe(
    engine: LiquidEngine,
    template: string,
    context: Record<string, any> = {},
    options: RenderSafeOptions = {},
): Promise<RenderResult> {
    if (typeof template !== 'string') return { ok: false, error: 'template is not a string' };

    const maxLen = options.maxTemplateLength ?? DEFAULT_LIMITS.maxTemplateLength;
    const maxDepth = options.maxNestingDepth ?? DEFAULT_LIMITS.maxNestingDepth;
    const maxIterations = options.maxIterations ?? DEFAULT_LIMITS.maxIterations;
    const timeoutMs = options.timeoutMs ?? DEFAULT_LIMITS.timeoutMs;

    if (template.length > maxLen) {
        return { ok: false, error: `template exceeds max length ${maxLen}` };
    }
    const depth = maxBlockDepth(template);
    if (depth > maxDepth) {
        return { ok: false, error: `template nesting depth ${depth} exceeds ${maxDepth}` };
    }

    try {
        const tpl = parseCached(engine, template, options.cache !== false);
        const output = await engine.render(tpl, context, {
            templateLimit: maxIterations,
            renderLimit: timeoutMs,
        });
        return { ok: true, output: output == null ? '' : String(output) };
    } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
    }
}
