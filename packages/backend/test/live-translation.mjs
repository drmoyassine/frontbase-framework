import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {SqliteTranslationPersistence} from '../../translation/dist/adapters/sqlite.js';
import {TranslationLifecycle,homepageDisplayFields} from '@frontbase/edge-core/localization';
import {displayTranslationUnit,localizeLiveLayout} from '../dist/compat/live-translation.js';

const database=new DatabaseSync(':memory:'),reader=new SqliteTranslationPersistence(database);reader.initialize();
const engine=new TranslationLifecycle(reader),scope={tenantId:'owner',projectId:'live-site'},pageId='page';
const layout={content:[{id:'heading',type:'Heading',props:{text:'Study here'}}]};
const field=homepageDisplayFields(layout)[0],unit=displayTranslationUnit(field,scope,pageId,'en');
const source=await engine.syncSource(scope,unit,null,{version:1,role:'Heading'});
const revision=(id,text,expectedHead)=>({version:1,unitId:source.unitId,locale:'ar',sourceVersion:source.sourceVersion,sourceFingerprint:source.sourceFingerprint,contextFingerprint:source.contextFingerprint,revisionId:id,text,expectedHead});
assert.equal((await engine.writeManual(scope,revision('first','ادرس هنا',null))).status,'committed');
const options={scope,pageId,sourceLocale:'en',locale:'ar',reader};
const text=async(input=layout,opts=options)=>(await localizeLiveLayout(input,opts)).content[0].props.text;
assert.equal(await text(),'ادرس هنا');
assert.equal((await engine.writeManual(scope,revision('second','ابدأ دراستك هنا','first'))).status,'committed');
assert.equal(await text(),'ابدأ دراستك هنا','current translation head, no release/republication');
assert.equal(await text(layout,{...options,locale:'en'}),'Study here','source language stays unchanged');
const changed=structuredClone(layout);changed.content[0].props.text='Changed source';
assert.equal(await text(changed),'Changed source','stale translation cannot override a live source edit');
assert.equal(await text(layout,{...options,scope:{tenantId:'other',projectId:'live-site'}}),'Study here','tenant isolation');
const failed={readMany:async()=>{throw Error('storage failed');}};
await assert.rejects(()=>text(layout,{...options,reader:failed}),/storage failed/,'no saved translation fallback');
const foreign={readMany:async(...args)=>{const rows=await reader.readMany(...args);rows[0].head.scope.tenantId='other';return rows;}};
await assert.rejects(()=>text(layout,{...options,reader:foreign}),/scope_mismatch/);

const {currentTranslationValueSchema}=await import('../../translation/dist/revisions.js');
let currentReads=0;
const currentReader={readMany:async()=>{throw Error('duplicate full read');},readCurrentMany:async(...args)=>{currentReads++;return (await reader.readMany(...args)).map(row=>currentTranslationValueSchema.parse(row));}};
assert.equal(await text(layout,{...options,reader:currentReader}),'ابدأ دراستك هنا');assert.equal(currentReads,1,'one current translation read per page');
for(const field of ['sourceVersion','sourceFingerprint','contextFingerprint']){
 const changedHead={...currentReader,readCurrentMany:async(...args)=>{const rows=await currentReader.readCurrentMany(...args);if(rows[0].head)rows[0].head[field]=field==='sourceVersion'?999:'f'.repeat(64);return rows;}};
 assert.equal(await text(layout,{...options,reader:changedHead}),'Study here',field+' freshness check preserved in public projection');
}
database.close();
console.log('live translation: current heads, source freshness, tenant isolation, source locale and unavailable-store refusal PASS');

// Normalizing chrome must not mutate shared inputs or current record objects.
const {homepageDisplayLayout}=await import('@frontbase/edge-core/localization');
const input={root:{},content:[{id:'hero',type:'Container',props:{templateSearchState:{labels:{search:'Find'}},directoryBrowsingState:[{labels:{next:'Next'}}],templateHeroState:[{settings:{heading:'At {destination}'},destination:'Home'}],initialRows:[{id:'r',title:'Current'}]}}]};
const before=JSON.stringify(input),display=homepageDisplayLayout(input);assert.equal(JSON.stringify(input),before);assert.equal(display.content[0].props.templateHeroState[0].settings.heading,'At Home');
assert.equal(display.content[0].props.initialRows,input.content[0].props.initialRows);
