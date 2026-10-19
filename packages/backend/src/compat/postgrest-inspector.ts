import { supabasePostgrestClient } from '@frontbase/edge-infra/supabase-http';
import { savedViewFilters, type SavedFilter } from '@frontbase/edge-core/saved-view-filters';
import { savedViewHttpPredicate } from './saved-view-http.js';
import { readPostgrestJson, readPostgrestMetadata } from './postgrest-connection-test.js';
import { guardedExternalFetch, type CompatFetch } from './external-http.js';

export function isNativePostgrest(ds: {kind: string; config: Record<string, unknown>}) {
    return ds.kind === 'supabase' && ds.config.endpoint_format === 'postgrest';
}
const identifier = (value: string) => /^[_A-Za-z][_A-Za-z0-9]*$/.test(value);
export interface NativeRead {offset?: number; limit?: number; filters?: unknown; sort?: string | null; order?: string; search?: string | null; searchColumns?: string[] | null; columns?: string[] | null; countOnly?: boolean}

/** Per-request metadata and client; never cache credentials or cross-tenant metadata. */
export async function nativePostgrestInspector(config: Record<string, unknown>, transport: CompatFetch) {
    const {document, options} = await readPostgrestMetadata(config, transport);
    const tables = Object.keys(document.paths).filter(path => /^\/[_A-Za-z][_A-Za-z0-9]*$/.test(path) && document.paths[path]?.get).map(path => path.slice(1)).sort();
    const definitions = document.definitions ?? document.components?.schemas ?? {};
    const schema = (table: string) => {
        if (!tables.includes(table)) throw Error('Table is not exposed in the selected schema.');
        const definition = definitions[table];
        if (!definition?.properties || typeof definition.properties !== 'object') throw Error('Column metadata is unavailable for this table.');
        const required = new Set(Array.isArray(definition.required) ? definition.required : []);
        const columns = Object.entries(definition.properties).map(([name, raw]) => {
            const column = raw as Record<string, any>;
            if (!identifier(name)) throw Error('This column name is not supported by native Inspector filters.');
            return {name, type: String(column.format ?? column.type ?? 'unknown'), nullable: column.nullable === true || !required.has(name), primary_key: /<pk\s*\/>|This is a Primary Key/i.test(String(column.description ?? '')), default_value: column.default ?? null};
        });
        const foreignKeys: {column:string;referenced_table:string;referenced_column:string}[] = [];
        for (const [name, raw] of Object.entries(definition.properties)) {
            const match = String((raw as any)?.description ?? '').match(/<fk\s+table=['"]([^'"]+)['"]\s+column=['"]([^'"]+)['"]\s*\/>/);
            if (match && tables.includes(match[1]!) && identifier(match[2]!)) foreignKeys.push({column:name,referenced_table:match[1]!,referenced_column:match[2]!});
        }
        return {table, columns, foreignKeys};
    };
    const readDeadline = AbortSignal.timeout(15_000);
    const client = supabasePostgrestClient({...options, fetchImpl: async (input, init) => {
        const method = input instanceof Request ? input.method : init?.method ?? 'GET';
        if (method !== 'GET' && method !== 'HEAD') throw Error('Native Inspector reads cannot perform mutations.');
        const response = await guardedExternalFetch(transport, input, {...init,signal:readDeadline});
        if (method === 'HEAD') return response;
        let value: unknown;
        try { value = await readPostgrestJson(response); } catch { throw Error('Native API response is invalid or exceeds the read limit.'); }
        const headers = new Headers(response.headers); headers.delete('content-length');
        return new Response(JSON.stringify(value), {status:response.status, headers});
    }});
    const rows = async (table: string, input: NativeRead = {}) => {
        const metadata = schema(table), names = metadata.columns.map(c => c.name);
        const field = (name: string) => { if (!names.includes(name)) throw Error('Unknown column in selected table.'); return name; };
        const offset = input.offset ?? 0, limit = input.limit ?? 50;
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5_000_000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw Error('Invalid native pagination.');
        if (input.order && !['asc','desc'].includes(input.order)) throw Error('Invalid native sort direction.');
        const rules = savedViewFilters(input.filters);
        const validate = (rule: SavedFilter): void => { if ('logic' in rule) rule.conditions.forEach(validate); else field(rule.field); };
        rules.forEach(validate);
        if (input.search) {
            if (input.search.length > 4000) throw Error('Search is too long.');
            const fields = input.searchColumns?.length ? input.searchColumns.map(field) : metadata.columns.filter(c => /^(text|character varying|character|string)$/.test(c.type)).map(c => c.name);
            if (!fields.length) throw Error('No text columns are available for native search.');
            rules.push({logic:'or',conditions:fields.map(name => ({field:name,operator:'contains',value:input.search}))});
        }
        const predicate = savedViewHttpPredicate(rules);
        const selection = input.columns?.length ? input.columns.map(field).join(',') : '*';
        let query = client.from(table).select(selection, {count:'exact', head: input.countOnly === true});
        if (predicate) query = query.or(predicate);
        const order = input.sort ? field(input.sort) : metadata.columns.find(c => c.primary_key)?.name ?? names[0];
        if (order) query = query.order(order, {ascending:input.order !== 'desc'});
        const result = await query.range(offset, offset + limit - 1);
        if (result.error || !Number.isSafeInteger(result.count) || result.count! < 0 || !input.countOnly && (!Array.isArray(result.data) || result.data.length > limit)) throw Error('Native record request failed or did not return an exact count.');
        const records: Record<string, unknown>[] = [];
        for (const row of result.data ?? []) {
            const value: unknown = row;
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid native record shape.');
            records.push(value as Record<string, unknown>);
        }
        return {records, total: result.count!, offset, limit, has_more: offset + records.length < result.count!, fk_columns:{}};
    };
    const relationships = () => tables.flatMap(table => schema(table).foreignKeys.map(fk => ({source_table:table,source_column:fk.column,target_table:fk.referenced_table,target_column:fk.referenced_column,relationship_type:'many_to_one'})));
    const search = async (text: string, limit: number) => {
        if (!text.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || tables.length > 50) throw Error('Native search requires text, a bounded limit and at most 50 tables.');
        const result: {table:string;record:Record<string,unknown>;matched_fields:string[];row_id:unknown}[] = [];
        for (let index=0;index<tables.length && result.length<limit;index+=2) {
            const groups=await Promise.all(tables.slice(index,index+2).map(async table=>{
                const metadata=schema(table),textFields=metadata.columns.filter(c=>/^(text|character varying|character|string)$/.test(c.type)).map(c=>c.name);
                if(!textFields.length)return [];
                const found=await rows(table,{search:text,searchColumns:textFields,limit});
                return found.records.map(record=>({table,record,matched_fields:textFields.filter(field=>String(record[field]??'').toLowerCase().includes(text.toLowerCase())),row_id:record[metadata.columns.find(c=>c.primary_key)?.name??'id']??null}));
            }));
            result.push(...groups.flat());
        }
        return result.slice(0,limit);
    };
    return {tables, schema, rows, relationships, search};
}
