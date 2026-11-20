import { z } from 'zod';
import type { PageComponent, PageLayoutData } from '../ssr/types.js';
import { projectEditorialBody } from './editorial.js';
import { validateDirectoryBrowsing, directoryBrowsingSchema } from './browsing.js';
import { landingQueryLimit, landingRootSchema, projectTemplatePresentation, publishedLandingPresentation, templateSettingsSchema } from './template-settings.js';
import { dateDetailFields, detailTextFields, numericDetailFields } from './detail-fields.js';
const numericFields = new Set<string>(numericDetailFields);
const dateFields = new Set<string>(dateDetailFields);
let groupedNumber: Intl.NumberFormat | undefined;

const path = z.string().max(400).refine(v => {
    try { const decoded = decodeURIComponent(v); return v.startsWith('/') && !decoded.startsWith('//') && !/[\\?#{}\s\x00-\x20]/.test(decoded) && !decoded.split('/').some(p => p === '.' || p === '..'); }
    catch { return false; }
});
const listParams = z.object({ q: z.string().trim().max(100).optional(), offset: z.number().int().min(0).max(19999).optional(), limit: z.number().int().min(1).max(48).optional(), sort: z.enum(['title-asc','title-desc']).optional(), match: z.enum(['contains','startsWith','equals']).optional() }).strict();
const programParams = listParams.extend({ institutionId: z.union([z.string().min(1).max(128), z.number().int().positive()]).optional() }).strict();
const detailParams = z.object({ path }).strict();
const binding = <T extends string, S extends z.ZodTypeAny>(queryId: T, params: S) => z.object({ version: z.literal(1), queryId: z.literal(queryId), params }).strict();
/** Authoring requests only. Public route parameters/approval are a later boundary. */
export const directoryQueryBindingSchema = z.discriminatedUnion('queryId', [
    binding('directory.institution.list', listParams), binding('directory.program.list', programParams), binding('directory.city.list', listParams),
    binding('directory.institution.detail', detailParams), binding('directory.program.detail', detailParams),
    binding('directory.article.list', listParams), binding('directory.article.detail', detailParams),
    binding('directory.page.detail', detailParams),
]);
export type DirectoryQueryBinding = z.infer<typeof directoryQueryBindingSchema>;
export const directoryRecordBindingSchema = z.object({
    text: z.enum(['title', 'summary', 'body', 'byline', 'publishedAt', ...detailTextFields]).optional(), href: z.enum(['originalPath','website']).optional(),
    fallbackText: z.literal('summary').optional(),
    sectionText: z.enum(['body', 'summary', ...detailTextFields]).optional(),
    blocks: z.literal('body').optional(),
    ariaLabel: z.literal('title').optional(),
    src: z.enum(['cover', 'logo']).optional(), alt: z.enum(['title','coverAlt']).optional(),
    relatedQuery: z.string().min(1).max(160).optional(),
    fallbackSrcQuery: z.string().min(1).max(160).optional(),
    media: z.literal('gallery').optional(),
    altFallback: z.literal('title').optional(),
    hideWhenEmpty: z.boolean().optional(),
    format: z.enum(['date', 'number']).optional(),
}).strict();
/** Manifest collection each legacy list query renders — the shared record-unit identity namespace
 *  that translation discovery and page capture must agree on. */
export const directoryListCollections: Record<string, 'institutions' | 'programs' | 'cities' | 'articles'> = {
    'directory.institution.list': 'institutions', 'directory.program.list': 'programs',
    'directory.city.list': 'cities', 'directory.article.list': 'articles' };
const liveDetailRecordCollections: Readonly<Record<string,string>> = Object.freeze({
    'directory.institution.detail':'institutions', 'directory.program.detail':'programs', 'directory.article.detail':'articles',
});
const stampableRecordColumns = new Set(['title', 'summary', 'coverAlt', 'byline', ...detailTextFields.filter(field => !numericFields.has(field))]);

export const siteBindingsSchema = z.object({
    text: z.enum(['site.name', 'site.destination']).optional(),
    href: z.enum(['contacts.email', 'contacts.whatsapp', 'routes.directory']).optional(),
    hideWhenEmpty: z.boolean().optional(),
}).strict();
export function validateSiteBinding(node: PageComponent): void {
    if (node.props?.siteBindings === undefined) return;
    const binding = siteBindingsSchema.parse(node.props.siteBindings);
    if (binding.hideWhenEmpty !== undefined && (node.type !== 'Link' || !binding.href)) throw new Error('invalid_site_binding_component');
}

/** Validate saved nodes without fetching rows. Avoid nested query multiplication. */
type DirectoryQuery = { id: string; binding: DirectoryQueryBinding };
type DirectoryInstructions = {
    queries: DirectoryQuery[];
    records: Map<PageComponent, z.infer<typeof directoryRecordBindingSchema>>;
    controls: Map<PageComponent, z.infer<typeof directoryBrowsingSchema>>;
    landing: z.infer<typeof templateSettingsSchema> | undefined;
};
type PublishDirectoryNode = (node: PageComponent, path: readonly number[]) => void;
function compileDirectoryInstructions(layout: PageLayoutData, publishNode?: PublishDirectoryNode): DirectoryInstructions {
    const landing = layout?.root?.directoryLanding === undefined ? undefined : landingRootSchema.parse(layout.root.directoryLanding).settings;
    const requests: DirectoryQuery[] = [];
    const records: DirectoryInstructions['records'] = new Map();
    const controls: DirectoryInstructions['controls'] = new Map();
    let visited = 0, browsing = 0;
    const walk = (nodes: PageComponent[], inQuery = false, depth = 0, articleQuery = false, parent?: readonly number[]) => {
        if (depth > 20) throw new Error('directory_template_depth');
        for (let index = 0; index < nodes.length; index++) {
            const node = nodes[index]!;
            if (++visited > 2000) throw new Error('directory_template_size');
            const props = node.props || {}; let isArticle = false;
            if(props.templateHeroState!==undefined || props.templateSearchState!==undefined || props.templateMenuLabels!==undefined)throw new Error('transient_template_state');
            for(const marker of ['templateHero','templateSearch'])if(props[marker]!==undefined){
                (marker==='templateHero'?z.object({version:z.literal(1),settings:templateSettingsSchema.shape.hero.optional()}):z.object({version:z.literal(1),defaultCollection:z.enum(['institution','program']).optional()})).strict().parse(props[marker]);
                if(node.type!=='Container' || inQuery || props.directoryQuery!==undefined || (node.children?.length??0)>0 || layout.root?.directoryLanding===undefined)throw new Error('invalid_template_component');
            }
            if(props.templateMenu!==undefined){z.object({version:z.literal(1)}).strict().parse(props.templateMenu);if(node.type!=='Container'||inQuery||layout.root?.directoryLanding===undefined)throw new Error('invalid_template_component');}
            validateDirectoryBrowsing(node, inQuery);
            if (props.directoryResultsFor !== undefined) {
                if (typeof props.directoryResultsFor !== 'string' || props.directoryResultsFor.length > 160)
                    throw new Error('invalid_directory_query_reference');
            }
            if(props.directoryControls !== undefined){controls.set(node, directoryBrowsingSchema.parse(props.directoryControls));if(node.type!=='Repeater'||inQuery||props.directoryQuery===undefined)throw new Error('invalid_repeater_controls');}
            if (props.directoryBrowsing !== undefined && (++browsing > 1 || !['directory', 'article-index'].includes(String((layout.root?.siteConfiguration as {role?:string} | undefined)?.role)))) throw new Error('invalid_directory_browsing_role');
            validateSiteBinding(node);
            if (props.directoryQuery !== undefined) {
                if (inQuery || requests.length >= 8 || requests.some(r => r.id === node.id) || props.binding || node.binding) throw new Error('ambiguous_directory_query');
                const query = directoryQueryBindingSchema.parse(props.directoryQuery);
                isArticle = query.queryId === 'directory.article.detail' || query.queryId === 'directory.page.detail';
                if (node.type !== (query.queryId.endsWith('.list') ? 'Repeater' : 'Container')) throw new Error('invalid_directory_query_component');
                requests.push({ id: node.id, binding: query });
            }
            if (props.recordBindings !== undefined) {
                if (!inQuery) throw new Error('record_binding_without_query');
                const record = directoryRecordBindingSchema.parse(props.recordBindings);
                records.set(node, record);
                if (record.text && !['Text', 'Heading', 'Paragraph', 'Link', 'Badge'].includes(node.type)
                    || record.fallbackText && (record.text ?? record.sectionText) !== 'body'
                    || record.sectionText && (node.type !== 'Container' || Object.keys(record).length !== (record.fallbackText ? 2 : 1))
                    || record.format === 'date' && !dateFields.has(record.text ?? '')
                    || record.format === 'number' && !numericFields.has(record.text ?? '')
                    || record.relatedQuery && !record.text && !record.href
                    || record.fallbackSrcQuery && !record.src
                    || record.altFallback && (!['Image', 'Gallery'].includes(node.type) || record.alt !== 'coverAlt')
                    || record.ariaLabel && (node.type !== 'Link' || !record.href)
                    || record.href && node.type !== 'Link' || (record.src || record.alt) && !['Image', 'Gallery'].includes(node.type)
                    || record.media && node.type !== 'Gallery'
                    || record.blocks && (node.type !== 'Container' || !articleQuery || Object.keys(record).length !== 1 || (node.children?.length ?? 0) > 0)
                    || record.hideWhenEmpty !== undefined && !(node.type === 'Image' && record.src || record.text || node.type === 'Link' && record.href === 'website')
                    || props.siteBindings !== undefined) throw new Error('invalid_record_binding_component');
            }
            const path = publishNode ? Object.freeze([...(parent ?? []), index]) : undefined;
            if (path) publishNode!(node, path);
            walk(node.children || [], inQuery || props.directoryQuery !== undefined, depth + 1, articleQuery || isArticle, path);
        }
    };
    walk(layout?.content || []);
    const institutionQueries = new Set(requests.filter(query => query.binding.queryId === 'directory.institution.detail').map(query => query.id));
    for (const record of records.values()) {
        if (record.relatedQuery && !institutionQueries.has(record.relatedQuery)
            || record.fallbackSrcQuery && !institutionQueries.has(record.fallbackSrcQuery)) throw Error('invalid_related_record_query');
    }
    return { queries: requests, records, controls, landing };
}
export function directoryLayoutQueries(layout: PageLayoutData): DirectoryQuery[] {
    return compileDirectoryInstructions(layout).queries;
}

const literal = (value: unknown) => typeof value === 'string' ? value.replace(/\{(?=[{%])/g, '{\u200b') : '';
const httpsUrl = (value: unknown) => {
    if (typeof value !== 'string' || /["'<>\\\x00-\x20]/.test(value)) return '';
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};

// Locale configuration only; dates and formatted record values are never retained.
const editorialDateFormatters=new Map<string,Intl.DateTimeFormat>();
/** ISO-only input; never infer timezone or allow Date.parse calendar rollover. */
function formatEditorialDate(value: unknown, locale?: string): string {
    if (typeof value !== 'string') return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
    if (!match) return '';
    const [, y, m, d, h, minute, second, , zone] = match;
    const year = Number(y), month = Number(m), day = Number(d);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!
        || h !== undefined && (Number(h) > 23 || Number(minute) > 59 || Number(second) > 59)
        || zone && zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return '';
    const date = new Date(h === undefined ? `${value}T00:00:00Z` : value);
    if (!Number.isFinite(date.getTime())) return '';
    const requested=locale&&locale.length<=35&&/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)?locale:'en';
    let formatter=editorialDateFormatters.get(requested);
    if(!formatter){
        let selected='en';
        try{if(Intl.DateTimeFormat.supportedLocalesOf([requested]).length)selected=requested;}catch{/* stable fallback */}
        formatter=new Intl.DateTimeFormat(selected,{timeZone:'UTC',calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'long',day:'numeric'});
        if(editorialDateFormatters.size>=64)editorialDateFormatters.delete(editorialDateFormatters.keys().next().value!);
        editorialDateFormatters.set(requested,formatter);
    }
    return formatter.format(date);
}

/** Transient plain-component projection through the SAME renderer; never save its rows.
 *  Materialized record-bound rows are stamped with `translationRecord`/`translationSources` so the
 *  localization surface extraction keys their text to the shared record unit instead of rendered
 *  position — transient projection state only, refused in authored layouts and never persisted. */
export function projectDirectoryRecords<T extends PageLayoutData>(layout: T, records: Map<string, Record<string, unknown>[]>, options: { locale?: string } = {}): T {
    return projectCompiledDirectory(layout, compileDirectoryInstructions(layout), records, options);
}

/** A compiled projector is bound to an immutable authored tree. It receives only
 * current rows and the request's inactive branch IDs, never replacement bindings. */
export function compileDirectoryProjection<T extends PageLayoutData>(layout: T) {
    const instructions = compileDirectoryInstructions(layout);
    const queries = instructions.queries.map(query => {
        const landingLimit = landingQueryLimit(layout, query.id, instructions.landing);
        return landingLimit === undefined ? query : { ...query, landingLimit };
    });
    return directoryProjection(layout, instructions, queries);
}

function directoryProjection<T extends PageLayoutData>(
    layout: T,
    instructions: DirectoryInstructions,
    requests: (DirectoryQuery & { landingLimit?: number })[],
    projectPresentation: typeof projectTemplatePresentation = projectTemplatePresentation,
) {
    const queries = Object.freeze(requests.map(query =>
        Object.freeze({ ...query, binding: Object.freeze({ ...query.binding, params: Object.freeze({ ...query.binding.params }) }) })));
    const project = (records: Map<string, Record<string, unknown>[]>, options: { locale?: string; inactive?: ReadonlySet<string>; liveDetailRecords?: boolean } = {}) =>
        projectCompiledDirectory(layout, instructions, records, options);
    return Object.freeze({ queries, project, projectPresentation });
}

type NodePath = readonly number[];
type PublishedQuery = Readonly<{ path: NodePath; landingLimit?: number }>;
/** Contains only layout instructions. The layout bytes beside this plan still own
 * the validated binding properties, while each request supplies new rows. */
export type PublishedDirectoryProjectionPlan = Readonly<{
    version: 1;
    queries: readonly PublishedQuery[];
    records: readonly NodePath[];
    controls: readonly NodePath[];
    heroes: readonly NodePath[];
    landing: boolean;
}>;

export function compilePublishedDirectoryProjection(layout: PageLayoutData): PublishedDirectoryProjectionPlan {
    const queries: PublishedQuery[] = [];
    const records: NodePath[] = [];
    const controls: NodePath[] = [];
    const heroes: NodePath[] = [];
    const locations: { id: string; path: NodePath }[] = [];
    const instructions = compileDirectoryInstructions(layout, (node, path) => {
        if (node.props?.directoryQuery !== undefined) locations.push({ id: node.id, path });
        if (node.props?.recordBindings !== undefined) records.push(path);
        if (node.props?.directoryControls !== undefined) controls.push(path);
        if (node.props?.templateHero !== undefined) heroes.push(path);
    });
    for (const { id, path } of locations) {
        const landingLimit = landingQueryLimit(layout, id, instructions.landing);
        queries.push(Object.freeze(landingLimit === undefined ? { path } : { path, landingLimit }));
    }
    return Object.freeze({ version: 1, queries: Object.freeze(queries), records: Object.freeze(records),
        controls: Object.freeze(controls), heroes: Object.freeze(heroes), landing: instructions.landing !== undefined });
}

function invalidPublicationPlan(): never { throw new Error('directory_projection_plan_invalid'); }

function resolvePublishedNode(layout: PageLayoutData, path: readonly number[]): PageComponent {
    if (!Array.isArray(path) || path.length < 1 || path.length > 21) return invalidPublicationPlan();
    let children = layout.content;
    let node: PageComponent | undefined;
    for (const index of path) {
        if (!Number.isInteger(index) || index < 0 || index >= (children?.length ?? 0)) return invalidPublicationPlan();
        node = children[index];
        if (!node || !Object.isFrozen(node)) return invalidPublicationPlan();
        children = node.children ?? [];
    }
    return node!;
}

/** Rebind a stored plan to the frozen layout after the owner-scoped store has
 * verified their shared artifact digest. Raw authoring inputs use the compiler. */
export function restorePublishedDirectoryProjection<T extends PageLayoutData>(layout: T, value: unknown) {
    const plan = value as PublishedDirectoryProjectionPlan;
    if (!Object.isFrozen(layout) || !Object.isFrozen(layout.content) || !plan || !Object.isFrozen(plan)
        || plan.version !== 1 || Object.keys(plan).length !== 6 || typeof plan.landing !== 'boolean'
        || !Array.isArray(plan.queries) || plan.queries.length > 8
        || !Array.isArray(plan.records) || plan.records.length > 2000
        || !Array.isArray(plan.controls) || plan.controls.length > plan.queries.length
        || !Array.isArray(plan.heroes) || plan.heroes.length > 2000
        || plan.records.length + plan.heroes.length + plan.queries.length > 2000
        || plan.landing !== (layout.root?.directoryLanding !== undefined)) return invalidPublicationPlan();

    const landing = plan.landing ? (layout.root?.directoryLanding as { settings?: DirectoryInstructions['landing'] })?.settings : undefined;
    if (plan.landing && (!landing || !Object.isFrozen(landing))) return invalidPublicationPlan();
    const ids = new Set<string>();
    const queries = new Map<PageComponent, DirectoryQuery & { landingLimit?: number }>();
    const records: DirectoryInstructions['records'] = new Map();
    const controls: DirectoryInstructions['controls'] = new Map();
    const heroes = new WeakSet<object>();
    for (const query of plan.queries as readonly PublishedQuery[]) {
        if (!query || Object.keys(query).length !== (query.landingLimit === undefined ? 1 : 2)) return invalidPublicationPlan();
        const node = resolvePublishedNode(layout, query.path);
        const { landingLimit } = query;
        const binding = node.props?.directoryQuery as DirectoryQueryBinding | undefined;
        if (!binding || !binding.params || !Object.isFrozen(binding) || !Object.isFrozen(binding.params) || ids.has(node.id)
            || binding.version !== 1 || typeof binding.queryId !== 'string'
            || node.type !== (binding.queryId.endsWith('.list') ? 'Repeater' : 'Container')
            || landingLimit !== undefined && (!landing || !Number.isInteger(landingLimit) || landingLimit < 1 || landingLimit > 12)) return invalidPublicationPlan();
        const params = binding.params as { q?: string };
        const normalized = typeof params.q === 'string'
            ? { ...binding, params: { ...binding.params, q: params.q.trim() } } as DirectoryQueryBinding
            : binding;
        ids.add(node.id);
        queries.set(node, landingLimit === undefined ? { id: node.id, binding: normalized } : { id: node.id, binding: normalized, landingLimit });
    }
    for (const path of plan.records) {
        const node = resolvePublishedNode(layout, path);
        const binding = node.props?.recordBindings as z.infer<typeof directoryRecordBindingSchema> | undefined;
        if (!binding || !Object.isFrozen(binding) || records.has(node)) return invalidPublicationPlan();
        records.set(node, binding);
    }
    for (const path of plan.controls) {
        const node = resolvePublishedNode(layout, path);
        const binding = node.props?.directoryControls as z.infer<typeof directoryBrowsingSchema> | undefined;
        if (!binding || !Object.isFrozen(binding) || node.type !== 'Repeater' || !queries.has(node) || controls.has(node)) return invalidPublicationPlan();
        controls.set(node, binding);
    }
    for (const path of plan.heroes) {
        const node = resolvePublishedNode(layout, path);
        const hero = node.props?.templateHero;
        if (!landing || !hero || typeof hero !== 'object' || !Object.isFrozen(hero) || node.type !== 'Container' || heroes.has(hero)) return invalidPublicationPlan();
        heroes.add(hero);
    }
    const requests = [...queries.values()];
    return directoryProjection(layout, { queries: requests, records, controls, landing }, requests, publishedLandingPresentation(landing, heroes));
}

function projectCompiledDirectory<T extends PageLayoutData>(
    layout: T,
    instructions: DirectoryInstructions,
    records: Map<string, Record<string, unknown>[]>,
    options: { locale?: string; inactive?: ReadonlySet<string>; liveDetailRecords?: boolean },
): T {
    const queries = new Map(instructions.queries.map(query => [query.id, query.binding]));
    const inactive = options.inactive;
    const controlsOwned = [...instructions.controls.keys()].some(node => !inactive?.has(node.id));
    const visible = (nodes: PageComponent[]) => inactive?.size ? nodes.filter(node => !inactive.has(node.id)) : nodes;
    let projected = 0;
    const walk = (node: PageComponent, row?: Record<string, unknown>, index = 0, collection?: string): PageComponent => {
        if (++projected > 4000) throw new Error('directory_projection_size');
        const props = { ...node.props }; const query = props.directoryQuery;
        const resultSource = props.directoryResultsFor;
        if (typeof resultSource === 'string' && resultSource) {
            delete props.directoryResultsFor;
            if (!records.get(resultSource)?.length) return { id: node.id, type: 'Container', props: {}, styles: { display: 'none' }, children: [] };
        }
        if(controlsOwned && props.directoryBrowsing!==undefined)return {...node,props:{},styles:{display:'none'},children:[]};
        if (query !== undefined) {
            const parsed = queries.get(node.id);
            if (!parsed) throw new Error('invalid_directory_query_component');
            const rows = records.get(node.id);
            if (!rows || rows.length > (parsed.queryId.endsWith('.list') ? 48 : 1)) throw new Error('directory_records_unavailable');
            const { directoryQuery: _query, directoryControls: controls, ...rest } = props;
            const list = parsed.queryId.endsWith('.list'); const columns = Math.min(4, Math.max(1, Number(props.columns) || 3));
            if (list) rest.className = `${typeof rest.className === 'string' ? rest.className : ''} ${props.layout === 'list' ? 'flex flex-col' : `grid grid-cols-1 ${columns > 1 ? 'md:grid-cols-2' : ''} ${columns > 2 ? `lg:grid-cols-${Math.floor(columns)}` : ''}`} gap-6`;
            // Live detail fields use the same record unit/edit destination as list fields.
            // Retain positional identities when reading older, reviewed locale publications.
            const rowCollection = directoryListCollections[parsed.queryId]
                ?? (options.liveDetailRecords ? liveDetailRecordCollections[parsed.queryId] : undefined);
            // With browsing controls the empty hint renders from the browsing labels (released
            // patterns, page language); only a control-less list keeps a projected fallback text.
            const projected: PageComponent = { ...node, type: 'Container', props: rest,
                ...(list ? { styles: { gap: '24px', ...node.styles } } : {}),
                children: rows.length ? rows.flatMap((record, i) => visible(node.children || []).map(child => walk(child, record, i, rowCollection)))
                    : controls === undefined && !props.hideWhenNoRecords ? [{ id: `${node.id}-empty`, type: 'Text', props: { text: 'No records matched this preview.' } }] : [] };
            if (!rows.length && props.hideWhenNoRecords) return { ...projected, styles: { ...projected.styles, display: 'none' } };
            if(list && controls !== undefined){
                const options=instructions.controls.get(node)!,position=options.paginationPosition||'top';
                const top:PageComponent={id:`${node.id}-controls`,type:'Container',props:{directoryBrowsing:{...options,pagination:options.pagination && position!=='bottom'}}};
                const bottom:PageComponent={id:`${node.id}-pagination`,type:'Container',props:{directoryBrowsing:{...options,tabs:false,search:false,sorting:false,filters:false,recordCount:false}}};
                return {...node,type:'Container',props:{},styles:{},children:[top,{...projected,id:`${node.id}-records`},...(options.pagination && position!=='top'?[bottom]:[])]};
            }
            return projected;
        }
        const id = index ? `${node.id}-preview-${index}` : node.id;
        const { recordBindings: _bindings, ...rest } = props;
        if (props.recordBindings !== undefined) {
            const b = instructions.records.get(node)!;
            if (!row) throw new Error('record_context_unavailable');
            const hidden = (): PageComponent => ({ id, type: 'Container', props: {}, styles: { display: 'none' }, children: [] });
            if (b.relatedQuery) {
                row = records.get(b.relatedQuery)?.[0];
                if (!row) return hidden();
                collection = options.liveDetailRecords ? 'institutions' : undefined;
            }
            const record = row;
            if (b.blocks) { const children = projectEditorialBody(row.body, id); projected += children.reduce((n,c) => n + 1 + (c.children?.length ?? 0), 0); if (projected > 4000) throw new Error('directory_projection_size'); return { ...node, id, props: rest, children }; }
            const hasText = (field: string) => numericFields.has(field)
                ? (typeof record[field] === 'number' || typeof record[field] === 'string') && Number.isFinite(Number(record[field])) && Number(record[field]) > 0
                : typeof record[field] === 'string' && String(record[field]).trim().length > 0;
            const sourceText = (field: string) => hasText(field) ? field : b.fallbackText && hasText(b.fallbackText) ? b.fallbackText : undefined;
            if (b.sectionText && !sourceText(b.sectionText)) return { id, type: 'Container', props: {}, styles: { display: 'none' }, children: [] };
            const textField = b.text && sourceText(b.text);
            if (b.text) {
                delete rest.content; delete rest.value;
                rest.text = b.format === 'date' ? formatEditorialDate(row[b.text], options.locale)
                    : b.format === 'number' && textField ? (groupedNumber ??= new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 })).format(Number(row[textField]))
                    : literal(textField ? String(row[textField]) : '');
                if ((b.format === 'date' || b.hideWhenEmpty) && !rest.text) return hidden();
                // Date output is re-formatted from the row in the page language at serve time; the
                // marker keeps extraction from owning it as a translatable text unit.
                if (b.format || b.text === 'updatedAt') rest.translationLiteral = b.text;
                if (b.fallbackText && textField === 'body' && String(rest.text).length > 12000) rest.translationLiteral = 'body';
            }
            if (b.href) {
                rest.href = b.href === 'website' ? httpsUrl(row.website) : path.safeParse(row.originalPath).success ? row.originalPath : '';
                if (b.hideWhenEmpty && !rest.href) return { id, type: 'Container', props: {}, styles: { display: 'none' }, children: [] };
            }
            if (b.ariaLabel) {
                const title = literal(row.title);
                rest.ariaLabel = title ? `${literal(String(rest.text || rest.label || rest.children || 'Link'))}: ${title}` : '';
            }
            if (b.src) {
                delete rest.url;
                const src = httpsUrl(row[b.src]);
                if (b.fallbackSrcQuery) {
                    const fallback = httpsUrl(records.get(b.fallbackSrcQuery)?.[0]?.cover);
                    if (fallback) rest.fallbackSrc = fallback;
                }
                if (b.hideWhenEmpty && !src && !rest.fallbackSrc) return hidden();
                rest[node.type === 'Gallery' ? 'coverSrc' : 'src'] = src;
            }
            if (b.alt) rest.alt = literal(row[b.alt]) || (b.altFallback === 'title' ? literal(row.title) : '');
            if (b.media && typeof row[b.media] === 'string' && String(row[b.media]).trim()) rest.media = row[b.media];
            const recordColumns: Record<string, string> = {};
            if (textField && rest.translationLiteral === undefined && (stampableRecordColumns.has(textField) || textField === 'body' && b.fallbackText)) recordColumns.text = textField;
            // A composed link label is a record unit keyed to the composite column (`ariaLabel:<textCol>`)
            // so capture, discovery and translation memory agree on one identity — never row position.
            // Date-bound or fallback text columns never compose: their output is not the stored source.
            if (b.ariaLabel && recordColumns.text) recordColumns.ariaLabel = `ariaLabel:${textField}`;
            if (b.alt) recordColumns.alt = b.alt;
            if (collection && (typeof row.id === 'string' || typeof row.id === 'number') && Object.keys(recordColumns).length) {
                rest.translationRecord = { connectionId: 'frontbase:publication', collection, key: [{ column: 'id', value: row.id as string | number }] };
                rest.translationSources = recordColumns;
            }
        }
        return { ...node, id, props: rest, ...(node.children ? { children: visible(node.children).map(child => walk(child, row, index, collection)) } : {}) };
    };
    return { ...layout, content: visible(layout.content).map(node => walk(node)) };
}
