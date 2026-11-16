import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderDataComponent } from '../dist/ssr/components/data.js';
import { renderDirectoryBrowsing } from '../dist/ssr/components/directoryBrowsing.js';
import { homepageDisplayLayout, homepageDisplayFields, applyHomepageDisplayFields } from '../dist/localization/surfaces.js';

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
// Only the selected Block Version receives rows. Chrome identities must not
// depend on whether this request selected Default or an alternative.
const withoutSeed=structuredClone(interactive);delete withoutSeed.content[0].props.initialRows;delete withoutSeed.content[0].props.localeLabels;
const normalizedWithoutSeed=homepageDisplayLayout(withoutSeed);
const chromeFields=layout=>homepageDisplayFields(layout).filter(f=>!f.record).map(f=>[f.blockId,f.versionId??'default',f.path,f.text]);
assert.deepEqual(chromeFields(normalizedWithoutSeed),chromeFields(interactive),'live bound list chrome is stable before its rows arrive');

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
const frozenText=Object.freeze({id:'article-text',type:'Text',props:Object.freeze({text:'Current database text'})});
const frozenNav=Object.freeze({id:'nav',type:'Navbar',props:Object.freeze({})});
const frozenChildren=Object.freeze([frozenText]);
const frozenContainer=Object.freeze({id:'article',type:'Container',children:frozenChildren});
const frozenVersion=Object.freeze({id:'mobile',name:'Mobile',overrides:Object.freeze({children:Object.freeze([frozenNav,frozenText])})});
const frozenInput=Object.freeze({root:Object.freeze({}),content:Object.freeze([frozenContainer,Object.freeze({id:'versioned',type:'Container',versions:Object.freeze([frozenVersion])})])});
const normalizedFrozen=homepageDisplayLayout(frozenInput);
assert.equal(normalizedFrozen.content[0],frozenContainer,'ordinary text subtree is reused without retaining it beyond this request');
assert.equal(normalizedFrozen.content[1].versions[0].overrides.children[1],frozenText);
assert.equal(normalizedFrozen.content[1].versions[0].overrides.children[0].props.localeLabels.language,'Language');
assert.equal(frozenNav.props.localeLabels,undefined,'normalization must not mutate authored or shared inputs');
assert.equal(homepageDisplayLayout({content:[{id:'fresh',type:'Text',props:{text:'Changed database text'}}]}).content[0].props.text,'Changed database text');
// The renderer fast path and public async API must agree, including nested Actions
// and full Liquid programs; no record values may carry into a later invocation.
const {resolveProps,resolvePropsValue}=await import('../dist/ssr/resolve.js');
const bindingProps={text:'{{ record.title }}',actionBindings:[{href:'/program/{{ record.id }}'}]};
const firstContext={record:{title:'First program',id:'one'}};
const direct=resolvePropsValue(bindingProps,firstContext);
assert.equal(direct instanceof Promise,false);
assert.deepEqual(direct,await resolveProps(bindingProps,firstContext));
assert.equal(resolvePropsValue(bindingProps,{record:{title:'Updated program',id:'two'}}).text,'Updated program');
assert.equal(bindingProps.text,'{{ record.title }}');
const liquidProps={text:'{% if record.available %}Open{% else %}Closed{% endif %}'};
assert.deepEqual(await resolvePropsValue(liquidProps,{record:{available:true}}),{text:'Open'});
assert.deepEqual(await resolvePropsValue(liquidProps,{record:{available:false}}),{text:'Closed'});

// Publication instructions contain bindings, never request records or translations.
const {compileDisplaySurfacePlan}=await import('../dist/localization/surfaces.js');
const authored={root:{},content:[{id:'cards',type:'Repeater',props:{binding:{dataSourceId:'db',tableName:'programs'}},children:[
 {id:'title',type:'Heading',props:{text:'{{ record.title }}'}},
 {id:'city',type:'Text',props:{text:'{{ record.institution.city }}'}},
 {id:'link',type:'Link',props:{text:'View',href:'{{ record.secret }}'}}
]}]};
const compiled=JSON.parse(JSON.stringify(compileDisplaySurfacePlan(authored)));
const currentLayout=structuredClone(authored);
currentLayout.content[0].props.initialRows=[{id:1,title:'First',institution:{city:'City'},secret:'not display'}];
const compiledFields=homepageDisplayFields(currentLayout,compiled);
assert.deepEqual(compiledFields,homepageDisplayFields(currentLayout),'compiled and existing display identities agree');
assert.ok(!JSON.stringify(compiled).includes('First'));
assert.ok(!compiledFields.some(field=>field.text==='not display'));
currentLayout.content[0].props.initialRows[0].title='Changed';
assert.ok(homepageDisplayFields(currentLayout,compiled).some(field=>field.text==='Changed'),'compiled instructions reread current values');
const untouched={id:'untouched',type:'Text',props:{text:'Unchanged'}};
const patchInput={root:{},content:[{id:'change',type:'Text',props:{text:'Before'}},untouched]};
const patchFields=homepageDisplayFields(patchInput);
const changedField=patchFields.find(field=>field.blockId==='change');
const patch=applyHomepageDisplayFields(patchInput,new Map([[JSON.stringify(['change','default',changedField.path]),'After']]),{partial:true,fields:patchFields});
assert.equal(patch.content[1],untouched,'translation application preserves untouched subtrees');
assert.equal(patch.content[0].props.text,'After');assert.equal(patchInput.content[0].props.text,'Before');

const {compileInterpolation,renderCompiledInterpolation,renderSync}=await import('../dist/liquid-core/sync.js');
const expressions=['{{ record.title }}','At {{ record["institution.city"] }}','{{ record.image || record.institution.image || "none" }}','{{ false || "yes" }}','{{ 0 || 12 }}','{{ null || "none" }}',"{{ 'literal' }}"];
for(const expression of expressions)for(const record of [{},{title:'New',institution:{city:'Nested',image:'cover'}},{title:'Changed','institution.city':'Flat',image:''}]){
 const compiledExpression=compileInterpolation(expression);assert.ok(compiledExpression);
 assert.equal(renderCompiledInterpolation(compiledExpression,{record}),renderSync(expression,{record}),'same safe grammar and current values');
}
assert.equal(compileInterpolation('{{ record.constructor }}'),null,'prototype access never compiles');
assert.equal(compileInterpolation('{% if record.title %}yes{% endif %}'),null,'full Liquid keeps its existing execution path');
const {displayPlanInterpolations}=await import('../dist/localization/surfaces.js');
assert.equal(resolvePropsValue(authored.content[0].children[0].props,{record:{title:'Latest'}},displayPlanInterpolations(compiled)).text,'Latest');

for(const expression of ['{{ 01 }}','{{ "\\q" }}'])assert.equal(compileInterpolation(expression),null,'legacy invalid literals keep the existing noncompiled path');
