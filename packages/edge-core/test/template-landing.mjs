import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createEducationLanding,defaultTemplateSettings,templateSettingsSchema,directoryLayoutQueries,projectSharedDirectoryPreview,projectDirectoryRecords,projectTemplatePresentation,landingQueryParams,compileDirectoryProjection,compilePublishedDirectoryProjection,restorePublishedDirectoryProjection} from '../dist/directory/configuration.js';
import {renderPage} from '../dist/index.js';
import {startHeroSlides} from '../dist/hero-behavior.js';

const settings=defaultTemplateSettings();settings.hero.heading='Study in {destination}: {{ user.private }}';settings.hero.introduction='<script>BAD</script>';
settings.hero.mode='slider';settings.hero.slides=[{src:'https://media.test/first.png',alt:'First campus',focalX:40,focalY:50},{src:'https://media.test/second.png',alt:'Second campus',focalX:50,focalY:30}];
settings.programCount=2;settings.articleCount=1;
const layout=createEducationLanding(settings),before=JSON.stringify(layout);
const config={site:{name:'Study directory',destination:'Hungary',origin:'https://site.test',locale:'en'},contacts:{email:'counselor@example.test',whatsapp:'https://wa.me/123456789'},routes:{directory:'/explore/',blog:'/guides/'},browsing:{defaultCollection:'program'}};
// Shared projection schema needs the full existing mapping shape.
const {emptyDirectoryConfiguration}=await import('../dist/directory/configuration.js');const emptyConfig=emptyDirectoryConfiguration(),full={...emptyConfig,...config,routes:{...emptyConfig.routes,...config.routes},browsing:{...emptyConfig.browsing,...config.browsing}};
const queries=directoryLayoutQueries(layout),records=new Map(queries.map(q=>[q.id,q.binding.queryId.includes('program')?[{title:'Engineering',summary:'Public summary',cover:null,coverAlt:'',originalPath:'/original-program/'}]:[{title:'Study guide',summary:'Guide summary',cover:null,coverAlt:'',originalPath:'/original-guide/'}]]));
assert.equal(landingQueryParams(layout,queries[0].id,queries[0].binding.params).limit,2);
const projected=projectTemplatePresentation(projectDirectoryRecords(projectSharedDirectoryPreview(layout,full),records),full);
assert.equal(JSON.stringify(layout),before);
const context={user:{private:'PRIVATE_CONTEXT_CANARY'},page:{},app:{},visitor:{},url:{},system:{},cookies:{},local:{},session:{}};
const html=await renderPage(projected,context);
function frozen(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) frozen(child);
        Object.freeze(value);
    }
    return value;
}
const authored=projectSharedDirectoryPreview(layout,full);
const plan=compilePublishedDirectoryProjection(authored);
assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.queries)&&Object.isFrozen(plan.queries[0].path));
const serialized=JSON.stringify(plan);
assert.ok(!serialized.includes('Guide summary')&&!serialized.includes('PRIVATE_CONTEXT_CANARY'));
const stored=frozen(JSON.parse(JSON.stringify(authored)));
const restored=restorePublishedDirectoryProjection(stored,frozen(JSON.parse(serialized)));
assert.deepEqual(restored.queries,compileDirectoryProjection(stored).queries);
for(const locale of ['en','ar']){
    const legacy=compileDirectoryProjection(stored);
    const expected=await renderPage(legacy.projectPresentation(legacy.project(records,{locale}),full),context);
    const actual=await renderPage(restored.projectPresentation(restored.project(records,{locale}),full),context);
    assert.equal(actual,expected);
}
assert.equal(restored.queries[0].landingLimit,2);
assert.throws(()=>restorePublishedDirectoryProjection(authored,plan),/projection_plan_invalid/);
for(const corrupt of [
    p=>{p.queries[0].path=[99];},
    p=>{p.queries[0].landingLimit=13;},
    p=>{p.records.push(p.records[0]);},
    p=>{p.heroes=[[0]];},
    p=>{p.landing=false;},
    p=>{p.cachedRows=[];},
]){
    const bad=JSON.parse(serialized);
    corrupt(bad);
    assert.throws(()=>restorePublishedDirectoryProjection(stored,frozen(bad)),/projection_plan_invalid/);
}
const invalid=structuredClone(authored);
invalid.root.directoryLanding.settings.programCount=13;
assert.throws(()=>compilePublishedDirectoryProjection(invalid));
assert.ok(html.includes('Study in Hungary'));assert.ok(!html.includes('PRIVATE_CONTEXT_CANARY'));assert.ok(!html.includes('<script>BAD'));
assert.ok(html.includes('method="get" action="/explore/"'));assert.ok(html.includes('name="type"'));assert.ok(html.includes('href="/original-program/"'));assert.ok(html.includes('href="/original-guide/"'));
assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.ok(html.includes('data-hero-next'));assert.ok(!html.includes('Featured institutions'));
assert.ok(html.includes('grid-cols-1 md:grid-cols-2 lg:grid-cols-3'));
assert.ok(!templateSettingsSchema.safeParse({...settings,colors:{primary:'red;url(secret)'}}).success);
assert.ok(!templateSettingsSchema.safeParse({...settings,hero:{...settings.hero,slides:[{...settings.hero.slides[0],src:'https://media.test/private.png?token=SECRET'}]}}).success);
assert.throws(()=>directoryLayoutQueries({...layout,content:[{id:'bad',type:'Container',props:{templateSearch:{version:1},templateSearchState:{path:'//evil.test'}}}]}));
const charcoal=projectTemplatePresentation(projectDirectoryRecords(projectSharedDirectoryPreview({...layout,root:{directoryLanding:{version:1,settings:{...settings,preset:'charcoal'}}}},full),records),full);
assert.ok((await renderPage(charcoal,context)).includes('#252a32'));
const charcoalDocument=new JSDOM(await renderPage(charcoal,context)).window.document;
assert.equal(charcoalDocument.querySelector('.fb-page').style.getPropertyValue('--fb-template-primary'),'#252a32');
const empty=structuredClone(settings);empty.hero.slides=[];empty.sections.programs=false;
const emptyLayout=createEducationLanding(empty),emptyRows=new Map(directoryLayoutQueries(emptyLayout).map(q=>[q.id,[]]));
const emptyHtml=await renderPage(projectTemplatePresentation(projectDirectoryRecords(projectSharedDirectoryPreview(emptyLayout,full),emptyRows),full),context);
assert.ok(!emptyHtml.includes('data-hero-next'));assert.ok(!emptyHtml.includes('<img data-hero-slide'));assert.ok(!emptyHtml.includes('Explore study programs'));
const dom=new JSDOM(html,{url:'https://site.test/'});globalThis.window=dom.window;globalThis.document=dom.window.document;
startHeroSlides();startHeroSlides();const images=[...document.querySelectorAll('[data-hero-slide]')];document.querySelector('[data-hero-next]').click();assert.equal(images[1].hidden,false);assert.equal(images[0].hidden,true);
document.querySelector('[data-hero-prev]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(images[0].hidden,false);
dom.window.close();
const autoSettings={...settings,hero:{...settings.hero,autoplay:true}};
const autoLayout=createEducationLanding(autoSettings),autoRecords=new Map(directoryLayoutQueries(autoLayout).map(q=>[q.id,[]]));
const autoHtml=await renderPage(projectTemplatePresentation(projectDirectoryRecords(projectSharedDirectoryPreview(autoLayout,full),autoRecords),full),context);
const autoDom=new JSDOM(autoHtml,{url:'https://site.test/',pretendToBeVisual:true});globalThis.window=autoDom.window;globalThis.document=autoDom.window.document;
let tick;const motion={matches:true};window.setInterval=fn=>{tick=fn;return 1;};window.clearInterval=()=>{};window.matchMedia=()=>motion;startHeroSlides();tick();assert.equal(document.querySelectorAll('[data-hero-slide]')[1].hidden,true);motion.matches=false;tick();assert.equal(document.querySelectorAll('[data-hero-slide]')[1].hidden,false);document.querySelector('[data-hero-pause]').click();tick();assert.equal(document.querySelectorAll('[data-hero-slide]')[1].hidden,false);assert.equal(document.querySelector('[data-hero-pause]').getAttribute('aria-pressed'),'true');
autoDom.window.close();
console.log('template landing: safe configurable SSR, immutable projection, relative search, optional media/sections, preset, manual/keyboard/idempotent slider and reduced-motion PASS');
