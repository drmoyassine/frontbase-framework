import { useState, useEffect, useMemo } from 'react';
import { useVariables, Variable } from './useVariables';
import { useRecord } from '@/components/builder/context/RecordContext';
import { createLiquidEngine, renderSafe, renderSync, isSimpleInterpolation } from '@frontbase/liquid-core';

// One engine for the builder preview (shares filters/limits with SSR via the
// shared core). Created once at module load.
const previewEngine = createLiquidEngine();

function sampleFor(v: Variable): unknown {
    switch (v.type) {
        case 'number':
            return 42;
        case 'boolean':
            return true;
        case 'array':
            return ['Sample'];
        case 'object':
            return {};
        default:
            return 'Sample';
    }
}

/** Set a value at a dotted path on a nested object (e.g. "user.name"). */
function setPath(obj: Record<string, any>, path: string, value: unknown): void {
    const parts = String(path).split('.');
    let cur = obj;
    for (let i = 0; i < parts.length; i++) {
        const k = parts[i];
        if (i === parts.length - 1) {
            cur[k] = value;
        } else {
            cur[k] = cur[k] ?? {};
            cur = cur[k];
        }
    }
}

export interface LiquidPreviewResult {
    text: string;
    error: string | null;
}

/**
 * Render a template string the way the published edge page will, against a
 * preview context built from the variable registry (synthesized samples) merged
 * with the current Repeater record. Because SSR and this preview both use the
 * shared @frontbase/liquid-core engine + filters, output is identical for
 * identical context (WYSIWYG parity).
 *
 * Sync fast path for plain `{{ }}` interpolation; async full Liquid (tags/loops)
 * via renderSafe with a structured error for malformed templates.
 */
export function useLiquidPreview(template: string | undefined | null): LiquidPreviewResult {
    const { variables } = useVariables();
    const record = useRecord();

    const context = useMemo(() => {
        const ctx: Record<string, any> = {};
        for (const v of variables) {
            setPath(ctx, v.path, sampleFor(v));
        }
        if (record) ctx.record = record;
        return ctx;
    }, [variables, record]);

    const tpl = typeof template === 'string' ? template : '';

    const [state, setState] = useState<LiquidPreviewResult>({ text: tpl, error: null });

    useEffect(() => {
        let cancelled = false;

        // Plain literals and simple {{ }} interpolation resolve synchronously.
        // (Assign to a boolean so the `is string` type-guard doesn't narrow `tpl`
        // to `never` in the branches below.)
        const isSimple: boolean = isSimpleInterpolation(tpl);
        if (isSimple) {
            setState({ text: renderSync(tpl, context), error: null });
            return;
        }

        // No tokens at all (defensive): show as-is.
        if (!tpl.includes('{%') && !tpl.includes('{{')) {
            setState({ text: tpl, error: null });
            return;
        }

        // Tags / filters → full async Liquid render with DoS limits.
        renderSafe(previewEngine, tpl, context).then((r) => {
            if (cancelled) return;
            if (r.ok) {
                setState({ text: r.output ?? '', error: null });
            } else {
                // Fall back to the raw template so the author can see/fix it.
                setState({ text: tpl, error: r.error ?? 'Liquid render error' });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [tpl, context]);

    return state;
}
