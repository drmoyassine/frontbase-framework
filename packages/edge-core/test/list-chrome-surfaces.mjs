import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderDataComponent } from '../dist/ssr/components/data.js';
import { renderDirectoryBrowsing } from '../dist/ssr/components/directoryBrowsing.js';
import { homepageDisplayLayout } from '../dist/localization/surfaces.js';

// Task 7 slice C: pin what list components actually render on localized published pages.
// Pure SSR Repeaters stay server-only; interactive lists retain localized hydration.
// Table/Grid loading shells preserve the released chrome and initial rows.
const rows = [{ id: 1, title: 'Alpha', summary: 'Alpha summary' }];
const repeaterHtml = renderDataComponent('Repeater', 'list', {
    binding: { componentId: 'list', dataSourceId: 'frontbase:publication', tableName: 'institutions' },
    initialRows: rows, localeReadOnly: true }, '<h2>Alpha</h2>');
assert.ok(repeaterHtml.includes('<h2>Alpha</h2>'), 'server-rendered rows survive');
assert.ok(!repeaterHtml.includes('data-react-component="Repeater"'), 'localized lists never re-fetch on the client');

const hydrated = renderDataComponent('Repeater', 'list2', {
    binding: { componentId: 'list2', dataSourceId: 'frontbase:publication', tableName: 'institutions' }, initialRows: rows }, '');
assert.ok(hydrated.includes('data-react-component="Repeater"'), 'unlocalized lists still hydrate');

const interactive = homepageDisplayLayout({ root: {}, content: [{ id: 'list', type: 'Repeater',
    props: { binding: { componentId: 'list', dataSourceId: 'frontbase:publication', tableName: 'institutions' },
        initialRows: rows, controls: { loadMore: true } } }] });
assert.equal(interactive.content[0].props.localeReadOnly,false,'interactive lists keep hydration through the localized endpoint');

// Task 8 slice B: a pinned publication binding re-fetches through the localized list endpoint,
// so its interactive controls stay coherent — the refusal applies only to stores without an
// evidenced localized query plan (live views keep the refusal above).
const converted = homepageDisplayLayout({ root: {}, content: [{ id: 'list', type: 'Repeater',
    props: { binding: { componentId: 'list', dataSourceId: 'frontbase:publication', tableName: 'institutions',
        source: { kind: 'publication', hash: 'a'.repeat(64) } },
        initialRows: rows, controls: { search: true, count: true } } }] });
assert.equal(converted.content[0].props.localeReadOnly, false, 'pinned publication lists still render server-side for first paint');

const binding = { dataSourceId: 'frontbase:publication', tableName: 'institutions', columnOrder: ['title', 'summary'] };
const table = renderDataComponent('DataTable', 'tbl', { binding, title: 'Catalog' }, '');
const tableDom = new JSDOM(table).window.document;
assert.ok(table.includes('>title</span>'), 'authored column headers render');
assert.ok(!table.includes('Alpha'), 'no record text is server-rendered in DataTable');
assert.ok(tableDom.querySelectorAll('.fb-skeleton').length > 0, 'DataTable renders loading skeletons only');
assert.ok(table.includes('placeholder="Search..."'), 'skeleton chrome stays source until hydrated (task-10 residual)');
const grid = renderDataComponent('Grid', 'grd', { binding }, '');
assert.ok(!grid.includes('Alpha'), 'no record text is server-rendered in Grid');
assert.ok(grid.includes('animate-pulse'), 'Grid renders loading skeletons only');

const state = { path: '/explore/', collection: 'institution', q: '', searchEnabled: true, page: 1, hasNext: true, total: 14, pageSize: 12 };
const options = { version: 1, tabs: true, search: true, sorting: true, filters: true, pagination: true };
const english = renderDirectoryBrowsing({ directoryBrowsing: options, directoryBrowsingState: [state] });
assert.ok(english.includes('>Institutions</a>'), 'chrome defaults render English');
const arabic = renderDirectoryBrowsing({ directoryBrowsing: options, directoryBrowsingState: [{ ...state, labels: { institutions: 'مؤسسات', next: 'التالي', sortAsc: 'عربي A-Z' } }] });
assert.ok(arabic.includes('>مؤسسات</a>'), 'release labels override the tab');
assert.ok(arabic.includes('>التالي</a>'), 'release labels override the pager');
assert.ok(arabic.includes('عربي A-Z'), 'release labels override the sorting options');
assert.ok(arabic.includes('>Programs</a>'), 'untranslated keys keep defaults');
const plain=homepageDisplayLayout({root:{},content:[{id:'plain',type:'Repeater',props:{initialRows:rows}}]});
assert.equal(plain.content[0].props.localeLabels,undefined,'no invented chrome/review units for a pure SSR list');
const localizedTable=renderDataComponent('DataTable','localized-table',{binding:{...binding,_localePath:'/ar/catalog/',_localeLabels:{previous:'السابق',next:'التالي',searchPlaceholder:'بحث'}},initialRows:rows,initialTotal:1},'');
const localizedDom=new JSDOM(localizedTable).window.document;
assert.equal(localizedDom.querySelector('input').placeholder,'بحث');
assert.ok(localizedDom.body.textContent.includes('السابق'));
assert.ok(localizedDom.body.textContent.includes('التالي'));
const hydration=JSON.parse(localizedDom.querySelector('[data-react-props]').dataset.reactProps);
assert.deepEqual(hydration.initialRows,rows);assert.equal(hydration.initialTotal,1);assert.equal(hydration.mode,'edge');
assert.equal(hydration.binding._localePath,'/ar/catalog/');
console.log('list chrome surfaces PASS: pure SSR stability, interactive localization, translated loading shell and seed-preserving Table/Grid hydration');
