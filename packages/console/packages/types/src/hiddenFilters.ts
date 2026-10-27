import {resolveDateOperator, isBuilderCanvas, type HiddenFilter, type WireFilter} from './index';
import {evaluateCondition,resolveValue,contextReader,conditionUsesClient,valueUsesClient,type ConditionInput} from '@frontbase/edge-core/conditions';

export type HiddenFilterCondition = ConditionInput;
export type FilterVariableReader = (scope: string, key: string) => unknown;
export function hiddenFilterApplies(when: HiddenFilterCondition | undefined, read: FilterVariableReader): boolean {
    return evaluateCondition(when,read);
}

/** Scalar variable substitution; unknown/prototype paths never become query values. */
export function resolveFilterValue(value: string, read: FilterVariableReader): string {
    const result=resolveValue(value,read);
    return ['string','number','boolean'].includes(typeof result)?String(result):'';
}

export function resolveHiddenFilterRules(filters: HiddenFilter[] | undefined, read: FilterVariableReader): WireFilter[] {
    return (filters ?? []).flatMap(filter => {
        if (!filter.column || !hiddenFilterApplies(filter.when, read)) return [];
        if (filter.operator === 'is_null' || filter.operator === 'not_null') return [{column:filter.column,op:filter.operator}];
        const value = resolveValue(filter.value === undefined ? '' : filter.value, read);
        const dates = resolveDateOperator({column:filter.column,op:filter.operator,value});
        if (dates !== null) return dates;
        if (value === undefined || value === '') return [];
        if(value===null&&['eq','neq'].includes(filter.operator))return [{column:filter.column,op:filter.operator==='eq'?'is_null':'not_null'}];
        return [{column:filter.column,op:filter.operator,value:filter.operator === 'in' && typeof value==='string' ? value.split(',').map(v=>v.trim()).filter(Boolean) : value}];
    });
}

export function readBrowserFilterVariable(scope: string, key: string): unknown {
    if (typeof window === 'undefined') return undefined;
    if(!['url','local','session','cookies','app','system','page','user','visitor'].includes(scope))return undefined;
    const store = (window as any).__VARIABLE_STORE__;
    if (scope === 'url') return isBuilderCanvas() && store ? store.get('url',key) : browserFilterUrlVariables()[key];
    const context = (window as any).__CONDITION_CONTEXT__ ?? (window as any).__INITIAL_STATE__ ?? {};
    if (store && ['local','session','cookies','app'].includes(scope)) {
        const value=store.get(scope,key)??contextReader({[scope]:store[scope]})(scope,key);
        if(value!==undefined)return value;
    }
    if (scope === 'system' && key === 'date' && context.system?.date===undefined) return new Date().toISOString();
    return contextReader({...context,page:context.page??(window as any).__PAGE_DATA__??{}})(scope,key);
}

export function browserFilterUrlVariables(): Record<string,string> {
    if (typeof window === 'undefined') return {};
    let search=window.location.search;
    if(isBuilderCanvas())try{search=window.parent.location.search;}catch{/* isolated preview has no parent URL access */}
    return Object.fromEntries(new URLSearchParams(search));
}

/** Preserve SSR-resolved static/user values; re-evaluate browser-dependent rules. */
export function resolveBindingHiddenFilters(binding: {hiddenFilters?: HiddenFilter[];_resolvedHiddenFilters?: WireFilter[];_pendingHiddenFilters?: HiddenFilter[]}, read: FilterVariableReader): WireFilter[] {
    if (binding._resolvedHiddenFilters === undefined) return resolveHiddenFilterRules(binding.hiddenFilters ?? binding._pendingHiddenFilters,read);
    const dynamic=binding.hiddenFilters?.filter(filter=>conditionUsesClient(filter.when) || valueUsesClient(filter.value)) ?? binding._pendingHiddenFilters;
    const resolved=binding._resolvedHiddenFilters.flatMap(filter=>resolveDateOperator(filter)??[filter]);
    return [...resolved,...resolveHiddenFilterRules(dynamic,read)];
}

export function subscribeFilterVariables(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    let detach: (()=>void) | undefined;
    const attach = () => { detach?.(); detach=(window as any).__VARIABLE_STORE__?.subscribe(listener); listener(); };
    attach();
    window.addEventListener('frontbase:variables-ready',attach);
    window.addEventListener('popstate',listener);
    return () => { detach?.(); window.removeEventListener('frontbase:variables-ready',attach); window.removeEventListener('popstate',listener); };
}
