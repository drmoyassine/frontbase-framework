import assert from 'node:assert/strict';
import { directoryLayoutQueries, projectDirectoryRecords } from '../dist/directory/configuration.js';
import { renderPage } from '../dist/index.js';
const layout = { root: { siteConfiguration: { version: 1, role: 'directory' }, custom: 'retained' }, content: [
    { id: 'custom', type: 'Text', props: { text: 'Custom content' } },
    { id: 'cards', type: 'Repeater', props: { directoryQuery: { version: 1, queryId: 'directory.institution.list', params: { limit: 12 } } }, children: [
        { id: 'card', type: 'Container', props: {}, styles: { padding: '24px' }, children: [
            { id: 'title', type: 'Heading', props: { text: 'Template', content: 'old override', recordBindings: { text: 'title' } } },
            { id: 'image', type: 'Image', props: { src: '', recordBindings: { src: 'cover', alt: 'title' } } },
            { id: 'path', type: 'Link', props: { text: 'Details', recordBindings: { href: 'originalPath' } } },
        ] },
    ] },
] };
const before = JSON.stringify(layout);
const rows = [{ title: '<script>evil()</script>{{ user.private }}', cover: 'javascript:alert(1)', originalPath: '//evil.example/' },
    { title: 'Second campus', cover: 'https://media.example.test/campus.jpg', originalPath: '/old-campus/' }];
const projected = projectDirectoryRecords(layout, new Map([['cards', rows]]));
assert.equal(JSON.stringify(layout), before); assert.deepEqual(projected.root, layout.root);
assert.equal(projected.content[0].props.text, 'Custom content');assert.equal(projected.content[1].type, 'Container');
const cards = projected.content[1].children; assert.equal(cards.length, 2);
assert.equal(cards[0].id, 'card');assert.equal(cards[1].id, 'card-preview-1');
assert.equal(cards[0].children[1].props.src, '');assert.equal(cards[0].children[2].props.href, '');
assert.equal(cards[1].children[1].props.src, 'https://media.example.test/campus.jpg');assert.equal(cards[1].children[2].props.href, '/old-campus/');
assert.ok(!JSON.stringify(projected).includes('recordBindings'));assert.ok(!JSON.stringify(projected).includes('directoryQuery'));
const html = await renderPage(projected, { user: { private: 'PRIVATE_CONTEXT_CANARY' }, page: {}, app: {}, visitor: {}, url: {}, system: {}, cookies: {}, local: {}, session: {} });
assert.ok(html.includes('Second campus'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>evil'));assert.ok(!html.includes('PRIVATE_CONTEXT_CANARY'));
assert.ok(html.includes('href="/old-campus/"'));assert.ok(!html.includes('javascript:'));
assert.throws(() => projectDirectoryRecords(layout, new Map()), /unavailable/);
assert.throws(() => projectDirectoryRecords(layout, new Map([['cards', Array(49).fill(rows[0])]])), /unavailable/);
assert.ok(JSON.stringify(projectDirectoryRecords(layout, new Map([['cards', []]]))).includes('No records matched'));
for (const mutate of [
    l => { l.content[1].props.directoryQuery.params.sql = 'SELECT private'; },
    l => { l.content[1].props.directoryQuery.params.country = 99; },
    l => { l.content[1].children[0].children[0].props.recordBindings.text = 'provider_id'; },
    l => { l.content[1].children.push(structuredClone(l.content[1])); },
    l => { l.content[1].type = 'Text'; },
    l => { l.content[1].props.binding = { tableName: 'private' }; },
    l => { l.content[0].props.recordBindings = { text: 'title' }; },
]) { const bad = structuredClone(layout);mutate(bad);assert.throws(() => directoryLayoutQueries(bad)); }
const detail = structuredClone(layout);detail.content[1].type='Container';detail.content[1].props.directoryQuery={version:1,queryId:'directory.program.detail',params:{path:'/parent/original-program/'}};
assert.equal(directoryLayoutQueries(detail)[0].binding.params.path, '/parent/original-program/');
assert.throws(() => projectDirectoryRecords(detail,new Map([['cards',rows]])),/unavailable/);
const article = {root:{siteConfiguration:{version:1,role:'article'}},content:[{id:'article',type:'Container',props:{directoryQuery:{version:1,queryId:'directory.article.detail',params:{path:'/blog/original/'}}},children:[{id:'body',type:'Container',props:{recordBindings:{blocks:'body'}}}]}]};
const articleBody=[{kind:'heading',level:1,runs:[{text:'Section'}]},{kind:'paragraph',runs:[{text:'<script>bad()</script>{{ user.private }}'},{text:'Guide',href:'https://example.test/guide/'}]}];
const articleProjection=projectDirectoryRecords(article,new Map([['article',[{body:articleBody}]]]));
assert.equal(articleProjection.content[0].children[0].children[0].props.level,'2');
assert.ok(JSON.stringify(articleProjection).includes('{\u200b{'));
assert.equal(article.content[0].children[0].children,undefined);
const articleHtml=await renderPage(articleProjection,{user:{private:'ARTICLE_PRIVATE_CANARY'},page:{},app:{},visitor:{},url:{},system:{},cookies:{},local:{},session:{}});
assert.ok(articleHtml.includes('&lt;script&gt;'));assert.ok(!articleHtml.includes('<script>bad'));assert.ok(!articleHtml.includes('ARTICLE_PRIVATE_CANARY'));assert.ok(articleHtml.includes('href="https://example.test/guide/"'));
for (const body of [[{kind:'html',runs:[{text:'bad'}]}],[{kind:'paragraph',runs:[{text:'bad',href:'javascript:bad()'}]}],[{kind:'paragraph',runs:[{text:'bad',html:'<b>'}]}],[]]) assert.throws(()=>projectDirectoryRecords(article,new Map([['article',[{body}]]])));
const wrongArticle=structuredClone(article);wrongArticle.content[0].props.directoryQuery.queryId='directory.program.detail';assert.throws(()=>directoryLayoutQueries(wrongArticle));
console.log('directory-bindings: strict requests/fields, bounded safe semantic articles, immutable projection, nested/legacy refusal and engine HTML passed');

const covered=structuredClone(article);covered.content[0].children.push({id:'cover',type:'Image',props:{recordBindings:{src:'cover',alt:'coverAlt'}}});
const coveredProjection=projectDirectoryRecords(covered,new Map([['article',[{body:articleBody,cover:'https://media.test/campus.jpg',coverAlt:'Campus <gardens> {{ user.private }}'}]]]));
assert.equal(coveredProjection.content[0].children[1].props.src,'https://media.test/campus.jpg');
const coverHtml=await renderPage(coveredProjection,{user:{private:'COVER_CANARY'},page:{},app:{},visitor:{},url:{},system:{},cookies:{},local:{},session:{}});
assert.ok(coverHtml.includes('Campus &lt;gardens&gt;'));assert.ok(!coverHtml.includes('COVER_CANARY'));
const optionalCover=structuredClone(covered);optionalCover.content[0].children[1].props.recordBindings.hideWhenEmpty=true;
const missingCover=projectDirectoryRecords(optionalCover,new Map([['article',[{body:articleBody,cover:null}]]]));
assert.equal(missingCover.content[0].children[1].type,'Container');assert.equal(missingCover.content[0].children[1].styles.display,'none');assert.deepEqual(missingCover.content[0].children[1].children,[]);
const presentCover=projectDirectoryRecords(optionalCover,new Map([['article',[{body:articleBody,cover:'https://media.test/campus.jpg'}]]]));assert.equal(presentCover.content[0].children[1].type,'Image');
const invalidOptionalCover=structuredClone(optionalCover);delete invalidOptionalCover.content[0].children[1].props.recordBindings.src;assert.throws(()=>directoryLayoutQueries(invalidOptionalCover));

// Additive optional-contact projection: source/root/custom nodes remain intact.
const {emptyDirectoryConfiguration,projectSharedDirectoryPreview}=await import('../dist/directory/configuration.js');
const config=emptyDirectoryConfiguration();config.site.name='Visible brand';
const chrome={root:{custom:'KEEP_ROOT'},content:[{id:'brand',type:'Link',props:{text:'Brand',href:'/',siteBindings:{text:'site.name'}}},{id:'email',type:'Link',props:{text:'Email',siteBindings:{href:'contacts.email',hideWhenEmpty:true}}},{id:'wa',type:'Link',props:{text:'WhatsApp',siteBindings:{href:'contacts.whatsapp',hideWhenEmpty:true}}},{id:'legacy-contact',type:'Link',props:{text:'Legacy',siteBindings:{href:'contacts.email'}}},{id:'custom',type:'Text',props:{text:'KEEP_CUSTOM'}}]};
const originalChrome=JSON.stringify(chrome),emptyChrome=projectSharedDirectoryPreview(chrome,config);
assert.equal(emptyChrome.content[0].props.text,'Visible brand');assert.equal(emptyChrome.content[0].props.href,'/');
assert.deepEqual(emptyChrome.content[1],{id:'email',type:'Container',props:{},styles:{display:'none'},children:[]});
assert.equal(emptyChrome.content[2].styles.display,'none');assert.equal(emptyChrome.content[3].type,'Link');assert.equal(emptyChrome.content[3].props.href,'');
assert.deepEqual(emptyChrome.root,chrome.root);assert.equal(emptyChrome.content[4].props.text,'KEEP_CUSTOM');assert.equal(JSON.stringify(chrome),originalChrome);
config.contacts={email:'counselor@example.test',whatsapp:'https://wa.me/123456789'};
const fullChrome=projectSharedDirectoryPreview(chrome,config);assert.equal(fullChrome.content[1].props.href,'mailto:counselor@example.test');assert.equal(fullChrome.content[2].props.href,'https://wa.me/123456789');
for(const binding of [{text:'site.name',hideWhenEmpty:true},{hideWhenEmpty:false},{href:'contacts.email',hideWhenEmpty:true,unknown:true}]) {
 const bad={root:{},content:[{id:'invalid',type:'Link',props:{siteBindings:binding}}]};assert.throws(()=>projectSharedDirectoryPreview(bad,config));assert.throws(()=>directoryLayoutQueries(bad));
}
assert.throws(()=>directoryLayoutQueries({root:{},content:[{id:'invalid',type:'Text',props:{siteBindings:{href:'contacts.email',hideWhenEmpty:true}}}]}));

const dateLayout={root:{},content:[{id:'dates',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.article.list',params:{}}},children:[{id:'date',type:'Paragraph',props:{content:'old override',recordBindings:{text:'publishedAt',format:'date'}}}]}]};
const showDate=(value,locale)=>projectDirectoryRecords(dateLayout,new Map([['dates',[{publishedAt:value}]]]),{locale}).content[0].children[0];
assert.equal(showDate('2025-04-19').props.text,'April 19, 2025');assert.equal(showDate('2025-04-19T23:30:00-02:00').props.text,'April 20, 2025');
assert.equal(showDate('2024-02-29','en-GB').props.text,'29 February 2024');
assert.equal(showDate('2025-04-19','fr').props.text,'19 avril 2025');
for(const locale of [undefined,'','<script>','xx-XX','en-US-u-ca-islamic']) assert.equal(showDate('2025-04-19',locale).props.text,'April 19, 2025');
for(const value of [null,undefined,'','bad','2025-02-29','2025-04-31','2025-13-01','2025-01-00','0000-01-01','2025-01-01T24:00:00Z','2025-01-01T00:60:00Z','2025-01-01T00:00:00+99:00','2025-01-01T00:00:00','04/19/2025','<script>bad()</script>']) assert.equal(showDate(value).styles.display,'none');
const raw=structuredClone(dateLayout);delete raw.content[0].children[0].props.recordBindings.format;
assert.equal(projectDirectoryRecords(raw,new Map([['dates',[{publishedAt:'raw date'}]]])).content[0].children[0].props.text,'raw date');
for(const binding of [{text:'title',format:'date'},{format:'date'},{text:'publishedAt',format:'expression'}]) {const bad=structuredClone(dateLayout);bad.content[0].children[0].props.recordBindings=binding;assert.throws(()=>directoryLayoutQueries(bad));}
assert.equal(dateLayout.content[0].children[0].props.content,'old override');
console.log('optional contacts and explicit UTC date projection passed');
