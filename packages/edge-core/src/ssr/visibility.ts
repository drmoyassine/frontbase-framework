import {escapeHtml} from './components/lib/utils.js';
/** Shared condition evaluation and non-destructive browser visibility attributes. */
import {evaluateCondition,conditionUsesClient,contextReader} from '../conditions.js';
import type { TemplateContext } from './lib/context.js';
import type { PageComponent } from './types.js';

/** Server-only false conditions are omitted by PageRenderer. */
export async function evaluateVisibilityCondition(
    visibilityCondition: string,
    context: TemplateContext
): Promise<{ isClientSideCondition: boolean; visibilityResult: boolean }> {
    return {isClientSideCondition:conditionUsesClient(visibilityCondition),visibilityResult:evaluateCondition(visibilityCondition,contextReader(context as unknown as Record<string,unknown>))};
}

/** Preserve authored display/grid/flex styles; a separate marker hides the node. */
export function applyClientVisibilityInjection(
    component: PageComponent,
    styles: Record<string, any> | undefined,
    resolvedProps: Record<string, unknown>,
    visibilityCondition: string,
    visibilityResult: boolean
): { component: PageComponent; styles: Record<string, any> | undefined; resolvedProps: Record<string, unknown> } {
    resolvedProps['data-show-if']=visibilityCondition;
    if(!visibilityResult)resolvedProps['data-condition-hidden']=true;
    return {component,styles,resolvedProps};
}

export function clientVisibilityAttributes(props:Record<string,unknown>):string {
    const condition=props['data-show-if'];
    return typeof condition==='string'&&condition?` data-show-if="${escapeHtml(condition)}"${props['data-condition-hidden']?' data-condition-hidden="true"':''}`:'';
}
