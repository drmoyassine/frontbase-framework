import assert from 'node:assert/strict';
import {renderBlock} from '../dist/ssr/PageRenderer.js';
import {renderPage} from '../dist/index.js';
import {projectRelativeSiteLinks} from '../dist/directory/configuration.js';
const context=()=>({page:{},app:{},system:{env:'test'},user:null});
async function rendered(target,locale){const layout=projectRelativeSiteLinks({root:{...(locale?{localeNavigation:{locale,origins:['https://source.test','https://staging.test']}}:{})},content:[{id:'link',type:'Link',props:{text:'Record',actionBindings:[{trigger:'onClick',actionType:'openPage',config:{pageUrl:'{{ record.destination }}'}}]}},{id:'image',type:'Image',props:{src:'https://source.test/image.png',alt:''}}]},'https://source.test');return renderPage(layout,{...context(),record:{destination:target}});}
for(const [target,expected]of [['https://source.test/campus/?a=1#section','/campus/?a=1#section'],['https://external.test/campus/','https://external.test/campus/'],['https://source.test//external.test/','https://source.test//external.test/'],['https://source.test/%2F%2Fexternal.test/','https://source.test/%2F%2Fexternal.test/'],['https://user:password@source.test/path/','https://user:password@source.test/path/'],['mailto:help@example.org','mailto:help@example.org']]){const html=await rendered(target);assert.ok(html.includes('href="'+expected+'"'),target);assert.ok(html.includes('src="https://source.test/image.png"'));}
const arabic=await rendered('https://source.test/campus/','ar');assert.ok(arabic.includes('href="/ar/campus/"'));assert.ok(!arabic.includes('href="/ar/ar/'));assert.ok((await rendered('/ar/campus/','ar')).includes('href="/ar/campus/"'));
console.log('Actions navigation: interpolated record URLs, source-host portability, locale prefix, external/media preservation and ambiguous/userinfo guards passed');

for(const locale of [undefined,'ar']){
 const layout=projectRelativeSiteLinks({root:{publicationRecordContext:{recordId:7},...(locale?{localeNavigation:{locale,origins:['https://source.test','https://staging.test']}}:{})},content:[{id:'scope',type:'Container',props:{},visibilityCondition:'page.recordId == 7',children:[]}]},'https://source.test');
 const html=await renderPage(layout,{...context(),app:{privateNote:'NEVER_EXPOSE'}}),boot=JSON.parse(html.match(/window.__CONDITION_CONTEXT__=(.*?);<\/script>/)[1]);
 assert.equal(boot.app.siteNavigationOrigin,'https://source.test');assert.ok(!JSON.stringify(boot).includes('NEVER_EXPOSE'));
 const hydrated=await renderBlock({id:'client-link',type:'Link',props:{text:'Record',actionBindings:[{trigger:'onClick',actionType:'openPage',config:{pageUrl:'{{ record.destination }}'}}]}},{...context(),...boot,record:{destination:'https://source.test/campus/'}});
 assert.ok(hydrated.includes('href="'+(locale?'/ar/campus/':'/campus/')+'"'),'hydrated record navigation keeps host and locale');
}
