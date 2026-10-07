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
