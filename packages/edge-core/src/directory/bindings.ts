import { z } from 'zod';
import type { PageComponent, PageLayoutData } from '../ssr/types.js';
import { projectEditorialBody } from './editorial.js';
import { validateDirectoryBrowsing, directoryBrowsingSchema } from './browsing.js';
import { landingRootSchema,templateSettingsSchema } from './template-settings.js';

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
    text: z.enum(['title', 'summary', 'body', 'byline', 'publishedAt']).optional(), href: z.literal('originalPath').optional(),
    blocks: z.literal('body').optional(),
    ariaLabel: z.literal('title').optional(),
    src: z.enum(['cover', 'logo']).optional(), alt: z.enum(['title','coverAlt']).optional(),
    altFallback: z.literal('title').optional(),
    hideWhenEmpty: z.boolean().optional(),
    format: z.literal('date').optional(),
}).strict();
/** Manifest collection each legacy list query renders — the shared record-unit identity namespace
 *  that translation discovery and page capture must agree on. */
export const directoryListCollections: Record<string, 'institutions' | 'programs' | 'cities' | 'articles'> = {
    'directory.institution.list': 'institutions', 'directory.program.list': 'programs',
    'directory.city.list': 'cities', 'directory.article.list': 'articles' };
/** Record text columns a list row may own as a translatable unit — dates and plain bodies never do. */
const stampableRecordColumns = new Set(['title', 'summary', 'coverAlt', 'byline']);

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
export function directoryLayoutQueries(layout: PageLayoutData): { id: string; binding: DirectoryQueryBinding }[] {
    if(layout?.root?.directoryLanding!==undefined)landingRootSchema.parse(layout.root.directoryLanding);
    const requests: { id: string; binding: DirectoryQueryBinding }[] = []; let visited = 0, browsing = 0;
    const walk = (nodes: PageComponent[], inQuery = false, depth = 0, articleQuery = false) => {
        if (depth > 20) throw new Error('directory_template_depth');
        for (const node of nodes) {
            if (++visited > 2000) throw new Error('directory_template_size');
            const props = node.props || {}; let isArticle = false;
            if(props.templateHeroState!==undefined || props.templateSearchState!==undefined)throw new Error('transient_template_state');
            for(const marker of ['templateHero','templateSearch'])if(props[marker]!==undefined){
                (marker==='templateHero'?z.object({version:z.literal(1),settings:templateSettingsSchema.shape.hero.optional()}):z.object({version:z.literal(1),defaultCollection:z.enum(['institution','program']).optional()})).strict().parse(props[marker]);
                if(node.type!=='Container' || inQuery || props.directoryQuery!==undefined || (node.children?.length??0)>0 || layout.root?.directoryLanding===undefined)throw new Error('invalid_template_component');
            }
            if(props.templateMenu!==undefined){z.object({version:z.literal(1)}).strict().parse(props.templateMenu);if(node.type!=='Container'||inQuery||layout.root?.directoryLanding===undefined)throw new Error('invalid_template_component');}
            validateDirectoryBrowsing(node, inQuery);
            if(props.directoryControls !== undefined){directoryBrowsingSchema.parse(props.directoryControls);if(node.type!=='Repeater'||inQuery||props.directoryQuery===undefined)throw new Error('invalid_repeater_controls');}
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
                if (record.text && !['Text', 'Heading', 'Paragraph', 'Link'].includes(node.type)
                    || record.format && record.text !== 'publishedAt'
                    || record.altFallback && (node.type !== 'Image' || record.alt !== 'coverAlt')
                    || record.ariaLabel && (node.type !== 'Link' || !record.href)
                    || record.href && node.type !== 'Link' || (record.src || record.alt) && node.type !== 'Image'
                    || record.blocks && (node.type !== 'Container' || !articleQuery || Object.keys(record).length !== 1 || (node.children?.length ?? 0) > 0)
                    || record.hideWhenEmpty !== undefined && (node.type !== 'Image' || !record.src)
                    || props.siteBindings !== undefined) throw new Error('invalid_record_binding_component');
            }
            walk(node.children || [], inQuery || props.directoryQuery !== undefined, depth + 1, articleQuery || isArticle);
        }
    };
    walk(layout?.content || []); return requests;
}

const literal = (value: unknown) => typeof value === 'string' ? value.replace(/\{(?=[{%])/g, '{\u200b') : '';
const imageUrl = (value: unknown) => {
    if (typeof value !== 'string' || /["'<>\\\x00-\x20]/.test(value)) return '';
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};

/** ISO-only input; never infer timezone or allow Date.parse calendar rollover. */
function formatEditorialDate(value: unknown, locale?: string): string {
    if (typeof value !== 'string') return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
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
    let selected = 'en';
    try {
        if (locale && locale.length <= 35 && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)
            && Intl.DateTimeFormat.supportedLocalesOf([locale]).length) selected = locale;
    } catch { /* unsupported/invalid locale uses the stable declared fallback */ }
    return new Intl.DateTimeFormat(selected, { timeZone: 'UTC', calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

/** Transient plain-component projection through the SAME renderer; never save its rows.
 *  Materialized record-bound rows are stamped with `translationRecord`/`translationSources` so the
 *  localization surface extraction keys their text to the shared record unit instead of rendered
 *  position — transient projection state only, refused in authored layouts and never persisted. */
export function projectDirectoryRecords<T extends PageLayoutData>(layout: T, records: Map<string, Record<string, unknown>[]>, options: { locale?: string } = {}): T {
    directoryLayoutQueries(layout);
    const ownControls = (nodes: PageComponent[]): boolean => nodes.some(node=>node.props?.directoryControls!==undefined || ownControls(node.children||[]));
    const controlsOwned=ownControls(layout.content);
    let projected = 0;
    const walk = (node: PageComponent, row?: Record<string, unknown>, index = 0, collection?: string): PageComponent => {
        if (++projected > 4000) throw new Error('directory_projection_size');
        const props = { ...node.props }; const query = props.directoryQuery;
        if(controlsOwned && props.directoryBrowsing!==undefined)return {...node,props:{},styles:{display:'none'},children:[]};
        if (query !== undefined) {
            const parsed = directoryQueryBindingSchema.parse(query); const rows = records.get(node.id);
            if (!rows || rows.length > (parsed.queryId.endsWith('.list') ? 48 : 1)) throw new Error('directory_records_unavailable');
            const { directoryQuery: _query, directoryControls: controls, ...rest } = props;
            const list = parsed.queryId.endsWith('.list'); const columns = Math.min(4, Math.max(1, Number(props.columns) || 3));
            if (list) rest.className = `${typeof rest.className === 'string' ? rest.className : ''} ${props.layout === 'list' ? 'flex flex-col' : `grid grid-cols-1 ${columns > 1 ? 'md:grid-cols-2' : ''} ${columns > 2 ? `lg:grid-cols-${Math.floor(columns)}` : ''}`} gap-6`;
            const rowCollection = directoryListCollections[parsed.queryId];
            const projected: PageComponent = { ...node, type: 'Container', props: rest,
                ...(list ? { styles: { gap: '24px', ...node.styles } } : {}),
                children: rows.length ? rows.flatMap((record, i) => (node.children || []).map(child => walk(child, record, i, rowCollection)))
                    : [{ id: `${node.id}-empty`, type: 'Text', props: { text: 'No records matched this preview.' } }] };
            if(list && controls !== undefined){
                const options=directoryBrowsingSchema.parse(controls),position=options.paginationPosition||'top';
                const top:PageComponent={id:`${node.id}-controls`,type:'Container',props:{directoryBrowsing:{...options,pagination:options.pagination && position!=='bottom'}}};
                const bottom:PageComponent={id:`${node.id}-pagination`,type:'Container',props:{directoryBrowsing:{...options,tabs:false,search:false,sorting:false,filters:false,recordCount:false}}};
                return {...node,type:'Container',props:{},styles:{},children:[top,{...projected,id:`${node.id}-records`},...(options.pagination && position!=='top'?[bottom]:[])]};
            }
            return projected;
        }
        const id = index ? `${node.id}-preview-${index}` : node.id;
        const { recordBindings: _bindings, ...rest } = props;
        if (props.recordBindings !== undefined) {
            const b = directoryRecordBindingSchema.parse(props.recordBindings);
            if (!row) throw new Error('record_context_unavailable');
            if (b.blocks) { const children = projectEditorialBody(row.body, id); projected += children.reduce((n,c) => n + 1 + (c.children?.length ?? 0), 0); if (projected > 4000) throw new Error('directory_projection_size'); return { ...node, id, props: rest, children }; }
            if (b.text) {
                delete rest.content; delete rest.value;
                rest.text = b.format === 'date' ? formatEditorialDate(row[b.text], options.locale) : literal(row[b.text]);
                if (b.format === 'date' && !rest.text) return { id, type: 'Container', props: {}, styles: { display: 'none' }, children: [] };
            }
            if (b.href) rest.href = path.safeParse(row.originalPath).success ? row.originalPath : '';
            if (b.ariaLabel) {
                const title = literal(row.title);
                rest.ariaLabel = title ? `${literal(String(rest.text || rest.label || rest.children || 'Link'))}: ${title}` : '';
            }
            if (b.src) { delete rest.url; rest.src = imageUrl(row[b.src]); }
            if (b.src && b.hideWhenEmpty && !rest.src) return { id, type: 'Container', props: {}, styles: { display: 'none' }, children: [] };
            if (b.alt) rest.alt = literal(row[b.alt]) || (b.altFallback === 'title' ? literal(row.title) : '');
            const recordColumns: Record<string, string> = {};
            if (b.text === 'title' || b.text === 'summary' || b.text === 'byline') recordColumns.text = b.text;
            if (b.alt) recordColumns.alt = b.alt;
            if (collection && (typeof row.id === 'string' || typeof row.id === 'number') && Object.keys(recordColumns).length) {
                rest.translationRecord = { connectionId: 'frontbase:publication', collection, key: [{ column: 'id', value: row.id as string | number }] };
                rest.translationSources = recordColumns;
            }
        }
        return { ...node, id, props: rest, ...(node.children ? { children: node.children.map(child => walk(child, row, index, collection)) } : {}) };
    };
    return { ...layout, content: layout.content.map(node => walk(node)) };
}
