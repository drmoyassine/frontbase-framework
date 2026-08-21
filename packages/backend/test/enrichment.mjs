/**
 * Serve-time binding enrichment + RPC-body validation (the FastAPI
 * public.py → convert_component port and its /api/data/execute grammar gate).
 * Pure-function tests: no server, no DB.
 */
import { enrichLayoutBindings, computeProxyDataRequest, buildColumnsSql, buildJoinsFromBinding, stripLayoutEnrichment } from '../dist/compat/enrichment.js';
import { validateRpcQueryBody } from '../dist/compat/rpc-body.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// ---- 1. validateRpcQueryBody: the client-rebuilt body (rH proxy shape) ----
const clientBody = {
    table_name: 'Corvinus University of Budapest  fees', // spaces are legal
    columns: '"Corvinus University of Budapest  fees".*',
    joins: [],
    page: 1,
    page_size: 20,
    filters: [],
    sort_col: null,
    sort_dir: 'asc',
};
let v = validateRpcQueryBody(clientBody);
check('accepts the canonical client body', v.ok === true && v.payload.table_name === clientBody.table_name && v.search === false);
check('defaults page/page_size when absent', (() => { const r = validateRpcQueryBody({ table_name: 't', columns: '*', joins: [] }); return r.ok && r.payload.page === 1 && r.payload.page_size === 20; })());
check('search body routes to search RPC', (() => { const r = validateRpcQueryBody({ ...clientBody, search_query: 'budapest', search_cols: ['program name'] }); return r.ok && r.search === true && r.payload.search_cols.length === 1; })());
check('empty search_query is NOT search', (() => { const r = validateRpcQueryBody({ ...clientBody, search_query: '  ' }); return r.ok && r.search === false; })());

// quoted multi-column lists + related-column aliases (what enrichment bakes)
check('accepts quoted column list with alias', (() => { const r = validateRpcQueryBody({ ...clientBody, columns: '"t"."a", "countries"."flag" AS "countries.flag", "t".*' }); return r.ok; })());
check('accepts bare *', (() => { const r = validateRpcQueryBody({ ...clientBody, columns: '*' }); return r.ok; })());

// ---- 2. validateRpcQueryBody: injection grammar gate ----
check('rejects SQL in columns (union)', validateRpcQueryBody({ ...clientBody, columns: '1) UNION SELECT apikey FROM x --' }).ok === false);
check('rejects unquoted columns fragment', validateRpcQueryBody({ ...clientBody, columns: 'id, name' }).ok === false);
check('rejects semicolon in table_name', validateRpcQueryBody({ ...clientBody, table_name: 'users; DROP TABLE x' }).ok === false);
check('rejects parenthesized table_name', validateRpcQueryBody({ ...clientBody, table_name: '(SELECT 1) x' }).ok === false);
check('rejects join ON injection', validateRpcQueryBody({ ...clientBody, joins: [{ type: 'left', table: 'x', on: 'a.b = c.d OR 1=1' }] }).ok === false);
check('rejects join ON stacked predicate', validateRpcQueryBody({ ...clientBody, joins: [{ type: 'left', table: '"x"', on: '"a"."b" = "c"."d"; SELECT 1' }] }).ok === false);
check('rejects unknown join type', validateRpcQueryBody({ ...clientBody, joins: [{ type: 'CROSS', table: 'x', on: '"a"."b" = "c"."d"' }] }).ok === false);
check('rejects oversized page_size', validateRpcQueryBody({ ...clientBody, page_size: 100000 }).ok === false);
check('rejects page 0 / negative', validateRpcQueryBody({ ...clientBody, page: 0 }).ok === false && validateRpcQueryBody({ ...clientBody, page: -3 }).ok === false);
check('rejects unknown filter op', validateRpcQueryBody({ ...clientBody, filters: [{ column: 'a', op: 'pg_sleep', value: '1' }] }).ok === false);
check('rejects filter column with quote', validateRpcQueryBody({ ...clientBody, filters: [{ column: 'a" OR true --', value: 'x' }] }).ok === false);
check('rejects sort_col injection', validateRpcQueryBody({ ...clientBody, sort_col: 'a; DELETE FROM x' }).ok === false);
check('rejects sort_dir other than asc/desc', validateRpcQueryBody({ ...clientBody, sort_dir: 'ASC; DROP' }).ok === false);
check('rejects non-object body', validateRpcQueryBody('nope').ok === false && validateRpcQueryBody([1, 2]).ok === false);
check('accepts legal filter shapes (frontend + hidden)', (() => {
    const r = validateRpcQueryBody({ ...clientBody, filters: [
        { column: 'program name', filterType: 'text', value: 'budapest' },
        { column: 'Position', op: 'gte', value: 2 },
        { column: 'program name', op: 'in', value: ['A', 'B'] },
        { column: 'program fees', op: 'is_null' },
    ] });
    return r.ok && r.payload.filters.length === 4;
})());

// ---- 3. buildColumnsSql / buildJoinsFromBinding ----
check('empty columnOrder → "T".*', buildColumnsSql('My Table', []) === '"My Table".*');
check('plain columns are table-qualified', buildColumnsSql('T', ['a', 'b']) === '"T"."a", "T"."b"');
check('related column gets alias', buildColumnsSql('T', ['countries.flag']) === '"countries"."flag" AS "countries.flag"');
check('column dicts resolve by name', buildColumnsSql('T', [{ name: 'a' }, { name: 'b' }]) === '"T"."a", "T"."b"');
check('fk list → quoted left joins', JSON.stringify(buildJoinsFromBinding('T', [
    { column: 'country_id', referencedTable: 'countries', referencedColumn: 'id' },
])) === JSON.stringify([{ type: 'left', table: 'countries', on: '"T"."country_id" = "countries"."id"' }]));
check('malformed fks produce no joins', buildJoinsFromBinding('T', [{ column: 'x' }, null, 'nope']).length === 0);

// ---- 4. computeProxyDataRequest ----
const ds = { id: 'ds-1', kind: 'supabase' };
const dr = computeProxyDataRequest({ tableName: 'T', dataSourceId: 'ds-1', pagination: { enabled: true, pageSize: 25 }, sorting: { enabled: true, direction: 'desc', column: 'Position' } }, ds);
check('bakes proxy strategy with datasourceId', dr.fetchStrategy === 'proxy' && dr.datasourceId === 'ds-1' && dr.url === '' && dr.headers && Object.keys(dr.headers).length === 0);
check('queryConfig carries RPC shape', dr.queryConfig.tableName === 'T' && dr.queryConfig.columns === '"T".*' && dr.queryConfig.sortColumn === 'Position' && dr.queryConfig.sortDirection === 'desc' && dr.queryConfig.pageSize === 25);
check('no tableName → null (product parity)', computeProxyDataRequest({ dataSourceId: 'ds-1' }, ds) === null);
check('sorting disabled → null sortColumn', computeProxyDataRequest({ tableName: 'T', sorting: { enabled: false, column: 'x' } }, ds).queryConfig.sortColumn === null);
check('pageSize capped at 500', computeProxyDataRequest({ tableName: 'T', pagination: { enabled: true, pageSize: 99999 } }, ds).queryConfig.pageSize === 500);
check('baked columns/joins pass the validator', (() => {
    const withFks = computeProxyDataRequest({ tableName: 'My Table', columnOrder: ['a', 'rel.flag'], foreignKeys: [{ column: 'rel_id', referencedTable: 'rel', referencedColumn: 'id' }] }, ds);
    const body = { table_name: withFks.queryConfig.tableName, columns: withFks.queryConfig.columns, joins: withFks.queryConfig.joins, page: 2, page_size: 7, filters: [] };
    const r = validateRpcQueryBody(body);
    return r.ok === true;
})());

// ---- 5. enrichLayoutBindings: layout walk ----
const layout = {
    content: [
        { id: 'c1', type: 'DataTable', props: { binding: { dataSourceId: 'ds-1', tableName: 'T' } }, children: [] },
        { id: 'c2', type: 'Section', children: [
            { id: 'c3', type: 'InfoList', props: { binding: { datasource_id: 'ds-1', table_name: 'U' } } },
            { id: 'c6', type: 'DataTable', props: { binding: { dataSourceId: 'ds-1', tableName: 'V', dataRequest: { url: 'keep-me' } } } },
        ] },
        { id: 'c4', type: 'DataTable', props: { binding: { dataSourceId: 'missing', tableName: 'X' } } },
        { id: 'c5', type: 'Text', props: { text: 'hi' } },
    ],
};
const out = enrichLayoutBindings(structuredClone(layout), [ds]);
const c1 = out.content[0];
check('props.binding normalized + enriched', c1.binding.dataRequest.fetchStrategy === 'proxy' && c1.binding.datasourceId === 'ds-1');
check('nested child enriched (datasource_id variant)', out.content[1].children[0].binding.dataRequest.fetchStrategy === 'proxy');
check('existing dataRequest preserved', out.content[1].children[1].binding.dataRequest.url === 'keep-me');
check('unknown datasource untouched', !out.content[2].binding.dataRequest);
check('text component untouched', !out.content[3].binding);
check('columns mapped to columnOrder (product parity)', (() => {
    const o = enrichLayoutBindings({ content: [{ type: 'DataTable', binding: { dataSourceId: 'ds-1', tableName: 'T', columns: ['a', 'b'] } }] }, [ds]);
    return JSON.stringify(o.content[0].binding.columnOrder) === JSON.stringify(['a', 'b']);
})());
check('empty datasource list → layout unchanged', enrichLayoutBindings(layout, []).content[0].props.binding.dataRequest === undefined);

// ---- 6. stripLayoutEnrichment: the save-path counterpart ----
const stored = structuredClone(layout);
const enriched = enrichLayoutBindings(stored, [ds]);
const restored = stripLayoutEnrichment(enriched);
check('strip reverts to the stored layout exactly', JSON.stringify(restored) === JSON.stringify(layout));
check('strip keeps legacy (non-proxy) dataRequest', (() => {
    const withLegacy = stripLayoutEnrichment(enrichLayoutBindings(structuredClone(layout), [ds]));
    return withLegacy.content[1].children[1].props.binding.dataRequest.url === 'keep-me';
})());
check('strip handles string layouts', typeof stripLayoutEnrichment(JSON.stringify(enriched)) === 'string'
    && JSON.parse(stripLayoutEnrichment(JSON.stringify(enriched))).content[0].props.binding.dataRequest === undefined);
check('strip leaves plain layouts untouched', JSON.stringify(stripLayoutEnrichment(structuredClone(layout))) === JSON.stringify(layout));
check('enrich → strip → enrich is idempotent', (() => {
    const first = enrichLayoutBindings(structuredClone(layout), [ds]);
    const snapshot = JSON.stringify(first);
    const round = stripLayoutEnrichment(first); // mutates first — snapshot taken before
    return JSON.stringify(enrichLayoutBindings(round, [ds])) === snapshot;
})());

// ---- 7. all-databound-component bakes: chart aggregate, RPC body, columns ----
const chartDr = computeProxyDataRequest({
    tableName: 'cities', dataSourceId: 'ds-1',
    chartConfig: { category: 'country', aggregation: 'count', sort: 'none', maxRows: 10 },
}, ds);
check('chart count aggregate query baked with __HF__ marker', chartDr.body.query === 'SELECT "country" AS category, COUNT(*) AS value FROM "cities" WHERE TRUE/*__HF__*/ GROUP BY "country" LIMIT 10' && chartDr.body.params.length === 0);
check('chart aggregate flags queryConfig.isChartAggregate', chartDr.queryConfig.isChartAggregate === true);
check('chart sum + sort desc', (() => {
    const dr = computeProxyDataRequest({ tableName: 'T', chartConfig: { category: 'c', aggregation: 'sum', value: 'v', sort: 'desc', maxRows: 5 } }, ds);
    return dr.body.query === 'SELECT "c" AS category, SUM("v") AS value FROM "T" WHERE TRUE/*__HF__*/ GROUP BY "c" ORDER BY value DESC LIMIT 5';
})());
check('chart aggregation without value column → no dataRequest', computeProxyDataRequest({ tableName: 'T', chartConfig: { category: 'c', aggregation: 'sum' } }, ds) === null);
check('non-chart body is RPC-shaped (Form/InfoList record loads)', (() => {
    const b = computeProxyDataRequest({ tableName: 'T' }, ds).body;
    return b.table_name === 'T' && b.columns === '"T".*' && Array.isArray(b.joins) && b.page === 1 && typeof b.page_size === 'number' && Array.isArray(b.filters);
})());
check('RPC-shaped body passes the validator', (() => {
    const b = computeProxyDataRequest({ tableName: 'T' }, ds).body;
    const r = validateRpcQueryBody({ ...b, page_size: 1, filters: [{ column: 'id', filterType: 'equal', value: 2 }] });
    return r.ok === true;
})());

// Schema snapshots (Form/InfoList binding.columns bake)
const snap = [
    { name: 'id', type: 'integer', nullable: false, primary_key: true, default_value: null },
    { name: 'email', type: 'text', nullable: false, primary_key: false, default_value: null },
];
const schemas = new Map([['ds-1::contacts', snap], ['ds-1::T', snap]]);
const bound = {
    content: [
        { id: 'f1', type: 'Form', props: { binding: { dataSourceId: 'ds-1', tableName: 'contacts' } } },
        { id: 'i1', type: 'InfoList', props: { binding: { datasource_id: 'ds-1', table_name: 'contacts' } } },
        { id: 'd1', type: 'DataTable', props: { binding: { dataSourceId: 'ds-1', tableName: 'T' } } },
        { id: 'f2', type: 'Form', props: { binding: { dataSourceId: 'ds-1', tableName: 'authored', columns: [{ name: 'keep' }] } } },
    ],
};
const enrichedBound = enrichLayoutBindings(structuredClone(bound), [ds], schemas);
check('Form gets baked columns snapshot', JSON.stringify(enrichedBound.content[0].binding.columns) === JSON.stringify(snap));
check('InfoList gets baked columns (table_name variant)', JSON.stringify(enrichedBound.content[1].binding.columns) === JSON.stringify(snap));
check('DataTable does NOT get the snapshot', enrichedBound.content[2].binding.columns === undefined);
check('authored columns never overwritten', JSON.stringify(enrichedBound.content[3].binding.columns) === JSON.stringify([{ name: 'keep' }]));
check('snapshot objects do NOT become columnOrder', enrichedBound.content[0].binding.columnOrder === undefined);
check('strip removes baked columns with the dataRequest', (() => {
    const round = stripLayoutEnrichment(enrichLayoutBindings(structuredClone(bound), [ds], schemas));
    // the props.binding → binding alias is stripped too, so the authored shape is back
    const b = round.content[0].props.binding;
    return b.columns === undefined && b.dataRequest === undefined;
})());
check('strip keeps authored object columns (no proxy dataRequest case)', (() => {
    const authored = { content: [{ type: 'Form', props: { binding: { dataSourceId: 'ds-1', tableName: 'x', columns: [{ name: 'keep' }] } } }] };
    return JSON.stringify(stripLayoutEnrichment(authored).content[0].props.binding.columns) === JSON.stringify([{ name: 'keep' }]);
})());
check('authored object columns survive a baked dataRequest (regression)', (() => {
    // enrich bakes a dataRequest for the authored binding but must NOT touch its
    // columns (non-empty) — and strip must not mistake them for a snapshot bake.
    const enriched = enrichLayoutBindings(structuredClone(bound), [ds], schemas);
    const f2 = enriched.content[3].props.binding;
    return JSON.stringify(f2.columns) === JSON.stringify([{ name: 'keep' }])
        && JSON.stringify(stripLayoutEnrichment(enriched).content[3].props.binding.columns) === JSON.stringify([{ name: 'keep' }]);
})());
check('baked snapshot carries the schemaSnapshot marker', enrichedBound.content[0].binding.schemaSnapshot === true);
check('enrich → strip → enrich idempotent with schemas', (() => {
    const first = enrichLayoutBindings(structuredClone(bound), [ds], schemas);
    const snapshot = JSON.stringify(first);
    stripLayoutEnrichment(first);
    return JSON.stringify(enrichLayoutBindings(first, [ds], schemas)) === snapshot;
})());

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
