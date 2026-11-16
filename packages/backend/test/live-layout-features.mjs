import assert from 'node:assert/strict';
import {runtimeFeatures,renderPage} from '@frontbase/edge-core';
import {liveLayoutFeatures} from '../dist/compat/live-layout-runtime.js';

const context={user:{role:'reader'},url:{type:'institution'},local:{},app:{},system:{},visitor:{},page:{},session:{},cookies:{}};
const layout={
    root:{appMenus:{version:1,hash:'a'.repeat(64),pageId:'p1'}},
    content:[
        {id:'nav',type:'Text',props:{text:'hello'}},
        {id:'row-list',type:'Repeater',props:{binding:{tableName:'institutions'},initialRows:[{title:'A record field named versions',versions:'not-a-layout-key'}]},styles:{color:'blue'},stylesData:{values:{color:'blue'}},visibility:'x',
            children:[{id:'row-card',type:'Card',props:{title:'{{ record.title }}'},styles:{padding:'8px'},visibility:{mobile:true,tablet:true,desktop:true}}]},
        {id:'versioned',type:'Heading',props:{text:'base'},versions:[{id:'alt',name:'Alt',when:'url.type == "program"',overrides:{props:{text:'Alt'}}}]},
        {id:'guarded',type:'Text',props:{text:'g'},visibilityCondition:'user.role == "admin"'},
        {id:'filtered',type:'Container',props:{hiddenFilters:{q:'x'}}},
        {id:'chrome',type:'Navbar',props:{logo:{type:'text'}}},
    ],
};
Object.freeze(layout);
for(const freeze of [layout.content[1],layout.content[1].styles,layout.content[1].stylesData,layout.content[2],layout.content[2].versions,layout.content[4],layout.content[5]])Object.freeze(freeze);

const features=liveLayoutFeatures(layout);
// runtimeFeatures semantics over the content subtree: the versions KEY anywhere,
// visibilityCondition/hiddenFilters anywhere (hydrated initialRows skipped).
const walked=runtimeFeatures({content:layout.content});
assert.equal(features.versions,walked.versions,'versions-key flag equals the in-render walk');
assert.equal(features.conditions,walked.conditions,'conditions flag equals the in-render walk');
assert.equal(features.versions,true,'versions key present');
assert.equal(features.versionsArrays,true,'non-empty versions array present');
assert.equal(features.legacyMenuRegion,true,'Navbar content is the pre-composition conflict');
// Threading the flags reproduces the walked render byte-for-byte.
const threadedHtml=await renderPage({content:layout.content},context,undefined,undefined,{versions:features.versions,conditions:features.conditions});
const walkedHtml=await renderPage({content:layout.content},context);
assert.equal(threadedHtml,walkedHtml,'threaded flags render byte-identical HTML');
assert.ok(threadedHtml.includes('__CONDITION_CONTEXT__'),'condition bootstrap still emitted');
// The record context is request data, not layout: a record field named "versions"
// must not flip the layout flags.
const recordPoisoned={...layout,root:{...layout.root,publicationRecordContext:{id:1,versions:'row value',visibilityCondition:'record-ish'}}};
const poisoned=liveLayoutFeatures(recordPoisoned);
assert.equal(poisoned.versions,true,'authored versions dominate');
assert.equal(runtimeFeatures({content:layout.content,root:recordPoisoned.root}).versions,true,'today in-render walk would flip on the record field');
assert.deepEqual(liveLayoutFeatures(layout),poisoned,'precomputed flags ignore the record context');
// Frozen layouts memoize; unfrozen drafts recompute.
assert.equal(liveLayoutFeatures(layout),features,'frozen layout memoized');
const draft=JSON.parse(JSON.stringify(layout));
const draftFeatures=liveLayoutFeatures(draft);
assert.notEqual(draftFeatures,features,'unfrozen draft recomputed');
// Projection with hydrated rows is key-pure: flags on the projected tree match.
const projected=JSON.parse(JSON.stringify(layout));
projected.content[1].props={...projected.content[1].props,initialRows:[{title:'Row A'},{title:'Row B'}]};
const projectedFlags=liveLayoutFeatures(projected);
assert.deepEqual([projectedFlags.versions,projectedFlags.versionsArrays,projectedFlags.conditions,projectedFlags.legacyMenuRegion],
    [features.versions,features.versionsArrays,features.conditions,features.legacyMenuRegion],'projected-tree flags equal authored flags');
// No menus, no conditions, no versions: everything false, no bootstrap.
const plain=liveLayoutFeatures({root:{},content:[{id:'t',type:'Text',props:{text:'x'}}]});
assert.deepEqual(plain,{versions:false,versionsArrays:false,conditions:false,legacyMenuRegion:false});
const plainHtml=await renderPage({content:[{id:'t',type:'Text',props:{text:'x'}}]},context,undefined,undefined,{versions:false,versionsArrays:false,conditions:false});
const plainWalked=await renderPage({content:[{id:'t',type:'Text',props:{text:'x'}}]},context);
assert.equal(plainHtml,plainWalked);
assert.ok(!plainHtml.includes('__CONDITION_CONTEXT__'));
console.log('live layout features: publication-time flags equal per-request walks, memoize on frozen layouts, and ignore record context PASS');
