import { evaluateCondition, isJsonValue, parseCondition, conditionUsesClient, type ConditionInput, type VariableReader } from './conditions.js';

/** Alternatives contain sparse Default-relative overrides, never another parent. */
export interface BlockVersion {
    id: string;
    name: string;
    when?: ConditionInput;
    overrides: BlockOverrides;
}
export interface VersionedBlock {
    id: string;
    type: string;
    props?: Record<string, any>;
    styles?: Record<string, any>;
    stylesData?: Record<string, any>;
    binding?: Record<string, any>;
    visibility?: { mobile: boolean; tablet: boolean; desktop: boolean };
    visibilityCondition?: string;
    children?: VersionedBlock[];
    versions?: BlockVersion[];
}
export interface BlockOverrides {
    props?: Record<string, any>;
    styles?: Record<string, any>;
    stylesData?: Record<string, any>;
    binding?: Record<string, any> | null;
    visibility?: { mobile: boolean; tablet: boolean; desktop: boolean };
    children?: VersionedBlock[];
}
const own = (object: object, key: string) => Object.hasOwn(object, key);
const versionKeys = new Set(['id', 'name', 'when', 'overrides']);
const overrideKeys = new Set(['props', 'styles', 'stylesData', 'binding', 'visibility', 'children']);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Validate the whole tree, including inactive structures. Reject ambiguous IDs. */
export function validateBlockVersions(nodes: VersionedBlock[]): void {
    const ids = new Set<string>();
    let count = 0;
    const visit = (list: VersionedBlock[], depth: number) => {
        if (!Array.isArray(list) || depth > 64) throw Error('Invalid block tree');
        for (const node of list) {
            if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !node.id || typeof node.type !== 'string' || !node.type || ++count > 20000) throw Error('Invalid block');
            if (ids.has(node.id)) throw Error('Duplicate block ID');
            ids.add(node.id);
            if (node.children) visit(node.children, depth + 1);
            if (node.versions === undefined) continue;
            if (!Array.isArray(node.versions) || node.versions.length > 32) throw Error('Too many block versions');
            const versionIds = new Set<string>();
            for (const version of node.versions) {
                if (!version || typeof version !== 'object' || Object.keys(version).some(k => !versionKeys.has(k)) || !idPattern.test(version.id) || version.id === 'default' || versionIds.has(version.id) || typeof version.name !== 'string' || !version.name.trim() || version.name.length > 120) throw Error('Invalid block version');
                versionIds.add(version.id);
                const overrides = version.overrides;
                if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || Object.keys(overrides).some(k => !overrideKeys.has(k))) throw Error('Invalid version overrides');
                // Authoring may contain an incomplete condition; the evaluator fails closed.
                if (version.when !== undefined && !isJsonValue(version.when)) throw Error('Invalid version condition');
                for (const key of ['props', 'styles', 'stylesData', 'binding', 'visibility'] as const) {
                    const value = overrides[key];
                    if (value !== undefined && (value === null ? key !== 'binding' : !isJsonValue(value) || Array.isArray(value) || typeof value !== 'object')) throw Error('Invalid override value');
                }
                if (overrides.visibility && ['mobile', 'tablet', 'desktop'].some(key => typeof (overrides.visibility as any)[key] !== 'boolean')) throw Error('Invalid visibility override');
                if (overrides.children) visit(overrides.children, depth + 1);
            }
        }
    };
    visit(nodes, 0);
}

/** Props are field-level; binding/actions and structure are atomic groups. */
export function applyBlockVersion<T extends VersionedBlock>(node: T, versionId?: string): T {
    const { versions: _versions, ...base } = node;
    const overrides = node.versions?.find(v => v.id === versionId)?.overrides;
    const normalized = (result:VersionedBlock):T => {
        // Enrichment aliases props.binding at the root. An alternative must never
        // keep Default's alias after overriding the authored binding group.
        if (result.props && own(result.props,'binding')) result.binding=result.props.binding??undefined;
        return result as T;
    };
    if (!overrides) return normalized({ ...base });
    const result: VersionedBlock = { ...base };
    for (const key of ['props', 'styles'] as const) {
        if (overrides[key]) result[key] = { ...node[key], ...overrides[key] };
    }
    if (overrides.stylesData) {
        result.stylesData = { ...node.stylesData, ...overrides.stylesData,
            values: { ...node.stylesData?.values, ...overrides.stylesData.values } };
    }
    if(result.stylesData&&overrides.styles){
        result.stylesData={...result.stylesData,values:{...node.stylesData?.values,...overrides.styles,...overrides.stylesData?.values},activeProperties:[...new Set([...(result.stylesData.activeProperties??[]),...Object.keys(overrides.styles)])]};
    }
    for (const key of ['binding', 'visibility', 'children'] as const) {
        if (own(overrides, key)) (result as any)[key] = overrides[key] === null ? undefined : overrides[key];
    }
    return normalized(result);
}

export function selectBlockVersion(node: VersionedBlock, read: VariableReader): string {
    return node.versions?.find(version => version.when !== undefined && evaluateCondition(version.when, read))?.id ?? 'default';
}

/** False means a server-known branch rules out this alternative, even in mixed groups. */
export function blockVersionPossible(input: ConditionInput, read: VariableReader): boolean {
    const parsed = parseCondition(input);
    if (!parsed) return false;
    const tri = (condition: NonNullable<typeof parsed>): boolean | undefined => {
        if ('all' in condition) { const values = condition.all.map(tri); return values.includes(false) ? false : values.every(v => v === true) ? true : undefined; }
        if ('any' in condition) { const values = condition.any.map(tri); return values.includes(true) ? true : values.every(v => v === false) ? false : undefined; }
        // A repeated template has no record during page-level projection. Its
        // record predicates are evaluated later by the same renderer per row.
        const perRecord=[condition.left,condition.right].some(operand=>operand?.kind==='variable'&&operand.path.startsWith('record.'));
        return conditionUsesClient(condition)||perRecord ? undefined : evaluateCondition(condition, read);
    };
    return tri(parsed) !== false;
}

/** Remove server-ineligible branches before serializing a public layout bootstrap. */
export function publicBlockTree<T extends VersionedBlock>(nodes: T[], read: VariableReader): T[] {
    return nodes.filter(node => !node.visibilityCondition || blockVersionPossible(node.visibilityCondition, read)).map(node => ({
        ...node,
        ...(node.children ? { children: publicBlockTree(node.children, read) } : {}),
        ...(node.versions ? { versions: node.versions.filter(version => version.when !== undefined && blockVersionPossible(version.when, read)).map(version => ({
            ...version, overrides: { ...version.overrides, ...(version.overrides.children ? { children: publicBlockTree(version.overrides.children, read) } : {}) }
        })) } : {})
    } as T));
}

/** Force selections are editor-only inputs, never saved into the page schema. */
export function resolveBlockTree<T extends VersionedBlock>(nodes: T[], read: VariableReader, force: Readonly<Record<string, string>> = {}): T[] {
    return nodes.map(node => {
        const effective = applyBlockVersion(node, force[node.id] ?? selectBlockVersion(node, read));
        return { ...effective, ...(effective.children ? { children: resolveBlockTree(effective.children, read, force) } : {}) } as T;
    });
}

/** Visit Default and every alternative structure for schema/query/ID discovery. */
export function walkBlockTree(nodes: VersionedBlock[], visit: (node: VersionedBlock) => void): void {
    for (const node of nodes) {
        visit(node);
        if (node.children) walkBlockTree(node.children, visit);
        for (const version of node.versions ?? []) if (version.overrides.children) walkBlockTree(version.overrides.children, visit);
    }
}

/** Clone an owned tree including alternatives and known internal element references. */
export function cloneBlockTree<T extends VersionedBlock>(nodes: T[], makeId: () => string): T[] {
    const ids = new Map<string, string>();
    const components=new WeakSet<object>();
    walkBlockTree(nodes, node => {ids.set(node.id, makeId());components.add(node);});
    const clone = (value: any, key = ''): any => {
        if (typeof value === 'string') {
            if (/(?:componentId|elementId|targetId|parentId|sourceId)$/i.test(key)) return ids.get(value) ?? value;
            if (['href', 'target', 'selector'].includes(key) && value.startsWith('#')) return ids.has(value.slice(1)) ? '#' + ids.get(value.slice(1)) : value;
            return value;
        }
        if (Array.isArray(value)) return value.map(child => clone(child));
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, name==='id'&&components.has(value)?ids.get(String(child))??child:clone(child, name)]));
    };
    return clone(nodes);
}

export function overrideBlockField<T extends VersionedBlock>(node: T, versionId: string, group: 'props' | 'styles', field: string, value: unknown, reset = false): T {
    if (!(idPattern.test(field)||group==='styles'&&/^--[\w-]{1,125}$/.test(field)) || ['__proto__', 'constructor', 'prototype'].includes(field) || (!reset && !isJsonValue(value))) throw Error('Invalid override field');
    return { ...node, versions: node.versions?.map(version => {
        if (version.id !== versionId) return version;
        const values = { ...version.overrides[group] };
        if (reset) delete values[field]; else values[field] = value;
        const overrides = { ...version.overrides, [group]: values };
        if(reset&&group==='styles'&&overrides.stylesData?.values){overrides.stylesData={...overrides.stylesData,values:{...overrides.stylesData.values}};delete overrides.stylesData.values[field];}
        if (!Object.keys(values).length) delete overrides[group];
        return { ...version, overrides };
    }) };
}
