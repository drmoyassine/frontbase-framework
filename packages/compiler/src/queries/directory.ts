import { z } from 'zod';
import { requireDirectorySourceConfiguration, parseEditorialBody, type DirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { defineQueries, type QueryRegistry, type QueryDef, type QueryContext } from './defineQueries.js';
import { sitePublicationArtifactSchema, type SitePublicationArtifact } from '@frontbase/edge-core/directory/publication';

const roles = ['institution', 'program', 'city', 'article', 'page'] as const;
const localPath = z.string().max(400).refine(v => {
    try { const d = decodeURIComponent(v); return v.startsWith('/') && !d.startsWith('//') && !/[\\?#\s\x00-\x20]/.test(d) && !d.split('/').some(p => p === '.' || p === '..'); }
    catch { return false; }
});
export const directoryPreviewSchema = z.object({
    source: z.enum(['published','connected']).optional(), expectedCapture: z.string().regex(/^[a-f0-9]{64}$/).optional(), expectedRevision: z.number().int().positive(), role: z.enum(roles), mode: z.enum(['list', 'detail']),
    params: z.object({ q: z.string().trim().max(100).optional(), offset: z.number().int().min(0).max(19999).optional(),
        limit: z.number().int().min(1).max(48).optional(), institutionId: z.union([z.string().max(128).min(1), z.number().int().positive()]).optional(),
        sort: z.enum(['title-asc','title-desc']).optional(), match: z.enum(['contains','startsWith','equals']).optional(), path: localPath.optional(),
        id:z.union([z.string().min(1).max(128),z.number().int().positive()]).optional() }).strict().default({}),
}).strict();

/** Original identity only: no slug generation, foreign origins or traversal. */
export function directoryOriginalPath(value: unknown, origin: string): string | null {
    if (typeof value !== 'string' || !value) return null;
    try {
        const path = value.startsWith('/') ? value : (() => { const u = new URL(value); return u.origin === origin && !u.search && !u.hash && !u.username && !u.password ? u.pathname : ''; })();
        return localPath.safeParse(path).success ? path : null;
    } catch { return null; }
}

/** Registered, server-only authoring queries. Not a public approval/activation. */
export function createDirectoryQueries(input: DirectoryConfiguration, owner: string, dialect: 'postgres' | 'sqlite',
    query: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>) : QueryRegistry {
    return directoryRegistry(input,owner,dialect,query,true);
}

/** Server-side published binding executor. Configuration must come from an owned published
 * layout, never request input. Uses the same parameter, projection and scope compiler as preview. */
export function createLiveDirectoryQueries(input:DirectoryConfiguration,owner:string,dialect:'postgres'|'sqlite',
    query:(sql:string,params:unknown[])=>Promise<Record<string,unknown>[]>,viewScope?:DirectoryViewScope):QueryRegistry{
    return directoryRegistry(input,owner,dialect,query,false,viewScope);
}

/** Resolved for the current request by the host from owned Saved Views. */
type DirectoryViewScope=(role:'institution'|'program'|'article',alias:string)=>{sql:string;params:unknown[]}|undefined;

// Compiled configuration only: never credentials, query results or request identities.
type DirectoryRead=(sql:string,params:unknown[])=>Promise<Record<string,unknown>[]>;
type DirectoryPlan=Record<string,Omit<QueryDef,'execute'>&{execute:(raw:Record<string,unknown>,ctx:QueryContext,read:DirectoryRead,viewScope?:DirectoryViewScope)=>Promise<Record<string,unknown>[]>}>;
const liveConfigurations=new Map<string,ReturnType<typeof requireDirectorySourceConfiguration>&{plans:Map<string,DirectoryPlan>}>();
function liveConfiguration(input:DirectoryConfiguration){
    const key=JSON.stringify(input),cached=liveConfigurations.get(key);if(cached)return cached;
    const compiled={...requireDirectorySourceConfiguration(input),plans:new Map<string,DirectoryPlan>()};
    if(key.length<=65536){if(liveConfigurations.size>=16)liveConfigurations.delete(liveConfigurations.keys().next().value!);liveConfigurations.set(key,compiled);}
    return compiled;
}

function directoryRegistry(input:DirectoryConfiguration,owner:string,dialect:'postgres'|'sqlite',
    query:(sql:string,params:unknown[])=>Promise<Record<string,unknown>[]>,authoring:boolean,viewScope?:DirectoryViewScope):QueryRegistry{
    if(!owner)throw Error('directory_configuration_incomplete');
    const compiled=authoring?null:liveConfiguration(input);
    const {configuration:c,sources}=compiled??requireDirectorySourceConfiguration(input);
    const quote = (name: string) => { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('invalid_mapping'); return `"${name}"`; };
    const city = sources.city, institution = sources.institution;
    const logos = c.directoryViewProjection && new Map(c.directoryViewProjection.logoReplacements.map(rule=>[rule.from,rule.to]));
    // Cache only validated compiler definitions. Runners, credentials, principals and
    // rows are injected per call and are never retained in this plan cache.
    const planKey=JSON.stringify([owner,dialect]);
    let registry=compiled?.plans.get(planKey);
    if(!registry){
    registry={} as DirectoryPlan;
    for (const role of roles) for (const mode of (authoring?['list','detail']:['list','detail','count','routes']) as ('list'|'detail'|'count'|'routes')[]) {
        if (role === 'city' && mode === 'detail') continue; // cities have no preserved-path mapping yet
        if(role==='city'&&mode==='routes')continue;
        const mapping = sources[role === 'page' ? 'article' : role];
        if ((role === 'article' || role === 'page') && !mapping.tableName) continue;
        const paramsSchema = directoryPreviewSchema.shape.params.refine(p => mode === 'detail'
            ? (Number(!!p.path)+Number(p.id!==undefined)===1) && p.q === undefined && p.offset === undefined && p.limit === undefined && p.institutionId === undefined && p.sort === undefined && p.match === undefined
            : p.path === undefined && p.id===undefined && (p.institutionId === undefined || role === 'program') && (p.limit ?? c.browsing.pageSize) <= c.browsing.pageSize);
        registry[`directory.${role}.${mode}`] = { scope: 'tenant', ttlSeconds: 0, params: paramsSchema,
            execute: async (raw, ctx, query, viewScope) => {
                if (ctx.tenant !== owner || authoring&&!ctx.user) throw new Error('principal_context_required');
                const p = paramsSchema.parse(raw);
                const values: unknown[] = []; const bind = (v: unknown) => { values.push(v); return dialect === 'postgres' ? `$${values.length}` : '?'; };
                const field = (alias: string, name: string) => `${alias}.${quote(name)}`;
                const scoped = (alias: string, m: typeof mapping, recordRole?: 'institution'|'program'|'article') => {
                    const base = `${field(alias, m.filter.column)} = ${bind(m.filter.value)}`;
                    const extra = recordRole && viewScope?.(recordRole, alias);
                    if (!extra?.sql) return base;
                    const offset=values.length;
                    values.push(...extra.params);
                    const predicate=dialect==='postgres'?extra.sql.replace(/\$(\d+)/g,(_,n)=>'$'+(offset+Number(n))):extra.sql;
                    return `(${base} AND (${predicate}))`;
                };

                const cityExists = (alias: string) => `EXISTS (SELECT 1 FROM ${quote(city.tableName)} dc WHERE ${field('dc', city.fieldMapping.id)} = ${field(alias, institution.fieldMapping.cityId)} AND ${scoped('dc', city)})`;
                const where = [scoped('d', mapping, role==='page'?'article':role==='city'?undefined:role)];
                // Canonical editorial records have an explicit public status. Live reads must
                // never replace the former approval fence with unrestricted draft reads.
                if(!authoring&&(role==='article'||role==='page'))where.push(`${field('d','status')} = ${bind('published')}`);
                if (role === 'article' || role === 'page') where.push(`${field('d', mapping.fieldMapping.contentRole)} = ${bind(role)}`, `${field('d', mapping.fieldMapping.sourceOrigin)} = ${bind(c.site.origin)}`);
                if (role === 'institution') where.push(cityExists('d'));
                if (role === 'program') where.push(`EXISTS (SELECT 1 FROM ${quote(institution.tableName)} di WHERE ${field('di', institution.fieldMapping.id)} = ${field('d', mapping.fieldMapping.institutionId)} AND ${scoped('di', institution, 'institution')} AND ${cityExists('di')})`);
                if (p.institutionId !== undefined) where.push(`${field('d', mapping.fieldMapping.institutionId)} = ${bind(p.institutionId)}`);
                if (p.q) where.push(`LOWER(CAST(${field('d', mapping.fieldMapping.title)} AS TEXT)) LIKE ${bind((p.match === 'contains' || !p.match ? '%' : '') + p.q.toLowerCase().replace(/[!%_]/g, v => '!' + v) + (p.match === 'equals' ? '' : '%'))} ESCAPE '!'`);
                if (p.path) where.push(`(${field('d', mapping.fieldMapping.originalPath)} = ${bind(p.path)} OR ${field('d', mapping.fieldMapping.originalPath)} = ${bind(c.site.origin + p.path)})`);
                if(p.id!==undefined)where.push(`${field('d',mapping.fieldMapping.id)} = ${bind(p.id)}`);
                if(mode==='count'){
                    const rows=await query(`SELECT COUNT(*) AS total FROM ${quote(mapping.tableName)} d WHERE ${where.join(' AND ')}`,values);
                    const total=Number(rows[0]?.total);
                    if(!Number.isSafeInteger(total)||total<0)throw Error('directory_count_invalid');
                    return [{total}];
                }
                const selected = Object.entries(mapping.fieldMapping).filter(([key, value]) => value && (mode==='routes'?['id','originalPath'].includes(key):!['contentRole','sourceOrigin'].includes(key) && (mode === 'detail' || !['body', 'gallery'].includes(key))));
                const projection = selected.map(([key, value]) => `${field('d', value)} AS ${quote(key)}`).join(', ');
                const rows = await query(`SELECT ${projection} FROM ${quote(mapping.tableName)} d WHERE ${where.join(' AND ')} ORDER BY ${field('d', mapping.fieldMapping.title)} ${p.sort === 'title-desc' ? 'DESC' : 'ASC'}, ${field('d', mapping.fieldMapping.id)} LIMIT ${bind(mode === 'detail' ? 2 : (p.limit ?? c.browsing.pageSize) + 1)} OFFSET ${bind(p.offset ?? 0)}`, values);
                if (mode === 'detail' && rows.length > 1) throw new Error('directory_path_ambiguous');
                // Enforce a narrow bounded projection even if a driver returns extra columns.
                return rows.slice(0, mode === 'detail' ? 1 : (p.limit ?? c.browsing.pageSize) + 1).map(row => Object.fromEntries(selected.map(([key]) => {
                    let v = row[key];
                    if(logos&&typeof v==='string'&&(key==='logo'||key==='cover')){
                        v=v.trim()||null;
                        if(key==='logo'&&typeof v==='string')v=logos.get(v)??v;
                    }
                    if ((role === 'article' || role === 'page') && key === 'body') return [key, parseEditorialBody(v)];
                    return [key, key === 'originalPath' ? directoryOriginalPath(v, c.site.origin) : typeof v === 'string' ? v.slice(0, key === 'body' ? 60000 : key === 'gallery' ? 12000 : key === 'summary' ? 1000 : 2048) : typeof v === 'number' && Number.isFinite(v) ? v : null];
                })));
            } };
    }
    if(compiled){if(compiled.plans.size>=8)compiled.plans.delete(compiled.plans.keys().next().value!);compiled.plans.set(planKey,registry);}
    }
    return defineQueries(Object.fromEntries(Object.entries(registry).map(([id,definition])=>[id,{
        ...definition,execute:(raw:Record<string,unknown>,ctx:QueryContext)=>definition.execute(raw,ctx,query,viewScope),
    }])));
}

/** Same registered-query boundary over an immutable, already-reviewed capture. */
export function createSnapshotDirectoryQueries(input: SitePublicationArtifact, owner: string): QueryRegistry {
    const artifact = sitePublicationArtifactSchema.parse(input), c = artifact.configuration;
    if (!owner) throw new Error('publication_owner_required');
    const collections = { institution: artifact.records.institutions, program: artifact.records.programs,
        city: artifact.records.cities, article: artifact.records.articles };
    const registry: QueryRegistry = {};
    for (const role of roles) for (const mode of ['list', 'detail'] as const) {
        if (role === 'page' || role === 'city' && mode === 'detail') continue;
        const params = directoryPreviewSchema.shape.params.refine(p => mode === 'detail'
            ? !!p.path && p.id===undefined && p.q === undefined && p.offset === undefined && p.limit === undefined && p.institutionId === undefined && p.sort === undefined && p.match === undefined
            : p.path === undefined && p.id===undefined && (p.institutionId === undefined || role === 'program') && (p.limit ?? c.browsing.pageSize) <= c.browsing.pageSize);
        registry[`directory.${role}.${mode}`] = { scope: 'tenant', ttlSeconds: 0, params,
            execute: async (raw, ctx) => {
                if (ctx.tenant !== owner) throw new Error('principal_context_required');
                const p = params.parse(raw);
                let rows: Record<string, unknown>[] = collections[role].map(row => ({ ...row }));
                if (p.path) rows = rows.filter(row => row.originalPath === p.path);
                if (p.q) rows = rows.filter(row => p.match === 'equals' ? String(row.title).toLowerCase() === p.q!.toLowerCase() : p.match === 'startsWith' ? String(row.title).toLowerCase().startsWith(p.q!.toLowerCase()) : String(row.title).toLowerCase().includes(p.q!.toLowerCase()));
                if (p.institutionId !== undefined) rows = rows.filter(row => String(row.institutionId) === String(p.institutionId));
                rows.sort((a,b)=>(String(a.title)<String(b.title)?-1:String(a.title)>String(b.title)?1:0)*(p.sort==='title-desc'?-1:1)||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0));
                rows = rows.slice(p.offset ?? 0, (p.offset ?? 0) + (mode === 'detail' ? 1 : (p.limit ?? c.browsing.pageSize) + 1));
                // Detail-only semantic body never rides list/search responses.
                return rows.map(row => mode === 'list' ? Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'body')) : structuredClone(row));
            } };
    }
    return defineQueries(registry);
}
