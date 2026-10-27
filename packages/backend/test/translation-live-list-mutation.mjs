import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const list=new URL('../dist/compat/publication-list-source.js',import.meta.url),locale=new URL('../dist/compat/translation-homepage.js',import.meta.url);
const suite=fileURLToPath(new URL('./translation-live-list.mjs',import.meta.url));
const faults=[
 ['localized endpoint catalog',list,'await readLocalizedLiveList(owner, admitted, query, request, liveQuery, localized.catalog)','await liveQuery(owner, admitted, query, request)'],
 ['source prefilter before translated search',list,'filters: [...(query.sourceFilters ?? []), ...query.filters.filter((filter) => !columns.has(filter.column))]','filters:query.filters'],
 ['mandatory authored predicates',list,'sourceFilters: mandatory, filters: [...mandatory, ...input.filters]','sourceFilters: [], filters: input.filters'],
 ['numeric-order text join',list,'copy[column] = field.text','copy[column] = row[column]'],
 ['fresh effective text',list,"entry.sourceText === undefined || entry.sourceText === String(row[column] ?? '')",'true'],
 ['version admission',list,'if (!version?.when || !blockVersionPossible(version.when, read))','if (false)'],
 ['locale language header',list,"localized?.catalog ? { 'Content-Language': localized.locale } : undefined",'undefined'],
 ['browser locale path',locale,"_localePath: '/' + release.locale + release.path","_localePath: release.path"],
 ['browser reviewed labels',locale,'_localeLabels: node.props.localeLabels ?? {}','_localeLabels: {}'],
];
const run=hook=>spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(hook??''),suite],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,windowsHide:true});
const baseline=run();assert.equal(baseline.status,0,baseline.stdout+baseline.stderr);
for(const[name,url,from,to]of faults){const original=readFileSync(url,'utf8');assert.ok(original.includes(from),'missing fault anchor '+name);const hook=`import {registerHooks} from 'node:module';registerHooks({load(url,context,next){let result=next(url,context);if(url===${JSON.stringify(url.href)})result={...result,source:String(result.source).replaceAll(${JSON.stringify(from)},${JSON.stringify(to)})};return result;}});`;const result=run(hook);assert.ok(result.status!==0&&/AssertionError/.test(result.stderr),'fault did not cause a behavioral assertion: '+name+'\n'+result.stdout+result.stderr);assert.equal(readFileSync(url,'utf8'),original);console.log('caught:',name);}
assert.equal(run().status,0,'restored baseline');console.log('translation-live-list: nine in-memory faults caught; files unchanged');
