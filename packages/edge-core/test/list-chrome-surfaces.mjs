import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderDataComponent } from '../dist/ssr/components/data.js';
import { renderDirectoryBrowsing } from '../dist/ssr/components/directoryBrowsing.js';
import { homepageDisplayLayout } from '../dist/localization/surfaces.js';

// Task 7 slice C: pin what list components actually render on localized published pages.
// The localized Repeater is server-only (no client re-fetch, no client chrome); DataTable/Grid
// render skeletons with no server-side record text (client bundle strings are a task-10
// residual, their record identity a task-8 residual); the directory browsing node is the one
// list chrome the real target renders, and its labels merge release text over defaults.
const rows = [{ id: 1, title: 'Alpha', summary: 'Alpha summary' }];
const repeaterHtml = renderDataComponent('Repeater', 'list', {
    binding: { componentId: 'list', dataSourceId: 'frontbase:publication', tableName: 'institutions' },
    initialRows: rows, localeReadOnly: true }, '<h2>Alpha</h2>');
assert.ok(repeaterHtml.includes('<h2>Alpha</h2>'), 'server-rendered rows survive');
assert.ok(!repeaterHtml.includes('data-react-component="Repeater"'), 'localized lists never re-fetch on the client');

const hydrated = renderDataComponent('Repeater', 'list2', {
    binding: { componentId: 'list2', dataSourceId: 'frontbase:publication', tableName: 'institutions' }, initialRows: rows }, '');
assert.ok(hydrated.includes('data-react-component="Repeater"'), 'unlocalized lists still hydrate');

assert.throws(() => homepageDisplayLayout({ root: {}, content: [{ id: 'list', type: 'Repeater',
    props: { binding: { componentId: 'list', dataSourceId: 'frontbase:publication', tableName: 'institutions' },
        initialRows: rows, controls: { loadMore: true } } }] }), /localized_interactive_list_not_supported/,
    'interactive list controls refuse localization rather than silently dropping the strings');

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
console.log('list chrome surfaces PASS: localized Repeater server-only, interactive-control refusal, DataTable/Grid skeleton-only residuals, browsing label merge');
