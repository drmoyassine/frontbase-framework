import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {SqliteTranslationPersistence} from '../../translation/dist/adapters/sqlite.js';
import {TranslationLifecycle,compileDisplaySurfacePlan,homepageDisplayFields,homepageDisplayLayout,translationUnitId} from '@frontbase/edge-core/localization';
import {displayTranslationUnit,localizeLiveLayout} from '../dist/compat/live-translation.js';
import {compileTranslationIds} from '../dist/compat/live-translation-identities.js';

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
const extended={content:[...layout.content,{id:'untranslated',type:'Paragraph',props:{text:'Source only'}}]};
const identityPlan=await compileTranslationIds(extended,compileDisplaySurfacePlan(extended),scope,pageId);
assert.ok(identityPlan.entries.some(([,id])=>id===source.unitId),'prepared ID equals the existing writer ID');
assert.doesNotMatch(JSON.stringify(identityPlan),/Study here|Source only/,'identity artifact contains no source content');
const recordField={...field,record:{connectionId:'source',collection:'programs',key:[{column:'id',value:19}]}};
const recordId=await translationUnitId(scope,displayTranslationUnit(recordField,scope,pageId,'en').resource);
assert.ok(!identityPlan.entries.some(([,id])=>id===recordId),'compiled layout IDs do not replace record IDs');
const record={connectionId:'frontbase:publication',collection:'programs',key:[{column:'id',value:19}]};
const titleLayout={content:[
 {id:'title',type:'Heading',props:{text:'Advertising',translationRecord:record,translationSources:{text:'title'}}},
 {id:'inline',type:'Text',props:{text:'Requirements',inlineBefore:'Advertising',inlineAfter:'Advertising',translationRecord:record,translationSources:{inlineBefore:'title',inlineAfter:'title'}}},
]};
const titleField=homepageDisplayFields(titleLayout).find(field=>field.blockId==='title');
const currentTitle=await engine.syncSource(scope,displayTranslationUnit(titleField,scope,pageId,'en'),null,{version:1,role:'Heading'});
assert.equal((await engine.writeManual(scope,{version:1,unitId:currentTitle.unitId,locale:'ar',sourceVersion:currentTitle.sourceVersion,
 sourceFingerprint:currentTitle.sourceFingerprint,contextFingerprint:currentTitle.contextFingerprint,revisionId:'record-title',text:'الإعلان',expectedHead:null})).status,'committed');
let titleReads=0;
const titleReader={readMany:async(scope,ids,locale)=>{assert.equal(ids.filter(id=>id===currentTitle.unitId).length,1);titleReads++;return reader.readMany(scope,ids,locale);}};
const localizedTitle=await localizeLiveLayout(titleLayout,{...options,reader:titleReader});
assert.equal(titleReads,1);
assert.equal(localizedTitle.content[0].props.text,'الإعلان');
assert.equal(localizedTitle.content[1].props.inlineBefore,'الإعلان');
assert.equal(localizedTitle.content[1].props.inlineAfter,'الإعلان');
assert.equal((await localizeLiveLayout(titleLayout,{...options,locale:'en'})).content[1].props.inlineAfter,'Advertising');
const editedTitle=structuredClone(titleLayout);editedTitle.content[1].props.inlineAfter='New title';
assert.equal((await localizeLiveLayout(editedTitle,options)).content[1].props.inlineAfter,'New title');
const head=currentTranslationValueSchema.parse(await reader.read(scope,source.unitId,'ar'));
let reads=0,lastIds,resolved;
const sparse={readMany:async()=>{throw Error('unexpected dense read');},readCurrentMany:async()=>{throw Error('unexpected current dense read');},
 readCurrentHeads:async(_scope,ids)=>{reads++;lastIds=ids;return ids.includes(source.unitId)?new Map([[source.unitId,head]]):new Map();}};
const prepared={...options,reader:sparse,identityPlan,resolvedFields:fields=>{resolved=fields;}};
const projected=await localizeLiveLayout(extended,prepared);
assert.equal(reads,1);assert.equal(lastIds.length,homepageDisplayFields(homepageDisplayLayout(extended)).length);
assert.equal(projected.content[0].props.text,'ابدأ دراستك هنا');
assert.equal(projected.content[1],extended.content[1],'missing head does not patch the second component');
assert.equal(resolved.find(field=>field.blockId==='untranslated').text,'Source only','untouched fields remain available to SEO');
assert.equal(await text(changed,prepared),'Changed source','compiled IDs still require current source fingerprints');
assert.equal(await text(extended,{...prepared,scope:{...scope,projectId:'different'}}),'Study here','identity plan never crosses translation projects');
assert.ok(!lastIds.includes(source.unitId));
assert.equal(await text(extended,{...prepared,pageId:'another-page'}),'Study here','identity plan never crosses pages');
assert.ok(!lastIds.includes(source.unitId));
const unexpected={...sparse,readCurrentHeads:async()=>new Map([['f'.repeat(64),head]])};
await assert.rejects(()=>text(extended,{...prepared,reader:unexpected}),/response_invalid/);
const foreignHead={...sparse,readCurrentHeads:async()=>new Map([[source.unitId,{...head,head:{...head.head,scope:{...scope,tenantId:'other'}}}]])};
await assert.rejects(()=>text(extended,{...prepared,reader:foreignHead}),/scope_mismatch/);
database.close();
console.log('live translation: current heads, source freshness, tenant isolation, source locale and unavailable-store refusal PASS');

// Normalizing chrome must not mutate shared inputs or current record objects.
const input={root:{},content:[{id:'hero',type:'Container',props:{templateSearchState:{labels:{search:'Find'}},directoryBrowsingState:[{labels:{next:'Next'}}],templateHeroState:[{settings:{heading:'At {destination}'},destination:'Home'}],initialRows:[{id:'r',title:'Current'}]}}]};
const before=JSON.stringify(input),display=homepageDisplayLayout(input);assert.equal(JSON.stringify(input),before);assert.equal(display.content[0].props.templateHeroState[0].settings.heading,'At Home');
assert.equal(display.content[0].props.initialRows,input.content[0].props.initialRows);
