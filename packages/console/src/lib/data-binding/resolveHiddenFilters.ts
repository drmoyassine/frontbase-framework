import { HiddenFilter } from '@/hooks/data/useSimpleData';
import { resolveDateOperator } from '@frontbase/types';

export interface WireFilter {
    column: string;
    op?: string;
    filterType?: string;
    value?: any;
}

/**
 * Resolves template variables in hidden filters against a provided context.
 * Used primarily for builder preview.
 */
export function resolveHiddenFilters(
    hidden: HiddenFilter[] | undefined,
    ctx: Record<string, any>,
    opts?: { dropUnresolved?: boolean }
): WireFilter[] {
    if (!hidden || hidden.length === 0) return [];

    return hidden.map(filter => {
        let finalValue = filter.value;

        // Very basic template resolution for builder preview
        if (finalValue && typeof finalValue === 'string' && finalValue.includes('{{')) {
            finalValue = finalValue.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, expr) => {
                const parts = expr.trim().split('.');
                let current = ctx;
                for (const part of parts) {
                    if (current == null) break;
                    current = current[part];
                }
                return current !== undefined && current !== null ? String(current) : '';
            });

        // Fallback to previewValue if resolution fails
            if (!finalValue || finalValue.trim() === '') {
                finalValue = filter.previewValue || '';
            }
        }

        // Date operators desugar to standard lt/lte/gt/gte (UTC) via the shared helper.
        const dateExpanded = resolveDateOperator({ column: filter.column, op: filter.operator, value: finalValue });
        if (dateExpanded !== null) return dateExpanded;

        return [{ column: filter.column, op: filter.operator, value: finalValue }];
    }).flat().filter(f => {
        // Drop unresolved unless it's is_null/not_null
        if (f.op === 'is_null' || f.op === 'not_null') return true;
        if (opts?.dropUnresolved && (!f.value || String(f.value).trim() === '')) return false;
        return true;
    });
}
