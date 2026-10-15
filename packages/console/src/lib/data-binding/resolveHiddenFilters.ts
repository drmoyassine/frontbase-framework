import {contextReader} from '@frontbase/edge-core/conditions';
import { HiddenFilter } from '@/hooks/data/useSimpleData';
import { resolveHiddenFilterRules } from '@frontbase/types';

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
    return resolveHiddenFilterRules(hidden,contextReader(ctx));
}
