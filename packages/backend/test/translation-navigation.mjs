import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {localizePublicHref,localizeNavigationProps} from '@frontbase/edge-core/localization';
import {renderPage} from '@frontbase/edge-core';
import {publicThemeScript} from '@frontbase/edge-core/browser/theme';
import {homepageLanguageLinks,addHomepageLanguageLinks} from '../dist/compat/translation-homepage-serving.js';
const origins=['https://stage.test','https://site.test'];
for(const [value,expected] of [
 ['/explore/?type=program#results','/ar/explore/?type=program#results'],['/ar/explore/?page=2','/ar/explore/?page=2'],
 ['https://site.test/blog/guide/','/ar/blog/guide/'],['https://other.test/blog/','https://other.test/blog/'],
 ['mailto:help@site.test','mailto:help@site.test'],['tel:123','tel:123'],['#results','#results'],['//other.test/x','//other.test/x'],
 ['/api/data/execute','/api/data/execute'],['/frontbase-admin/pages','/frontbase-admin/pages'],['/static/logo.png','/static/logo.png'],
 ['/brochure.pdf','/brochure.pdf'],['javascript:alert(1)','javascript:alert(1)'],['https://user:pass@site.test/x','https://user:pass@site.test/x']
])assert.equal(localizePublicHref(value,'ar',origins),expected,value);
const source={href:'/blog/',src:'/cover.png',text:'/not-a-link',binding:'{{ record.originalPath }}',languageSwitcher:[{href:'/'}],initialRows:[{originalPath:'/program/'}],pageUrl:'/explore/',ctaLink:'/about/',secondaryCtaLink:'https://site.test/privacy/'};
const projected=localizeNavigationProps(source,'ar',origins);assert.equal(projected.href,'/ar/blog/');assert.equal(projected.src,source.src);assert.equal(projected.text,source.text);assert.equal(projected.binding,source.binding);assert.equal(projected.languageSwitcher[0].href,'/');assert.equal(projected.initialRows[0].originalPath,'/ar/program/');assert.equal(projected.pageUrl,'/ar/explore/');assert.equal(projected.ctaLink,'/ar/about/');assert.equal(projected.secondaryCtaLink,'/ar/privacy/');assert.equal(source.href,'/blog/');
// Switcher hrefs are embedded into the language picker, whose contract rejects whitespace and
// \<> characters with a whole-page 503: request queries arrive percent-encoded, never raw.
const links=homepageLanguageLinks('en',['ar','fr'],'ar','/explore/?q=a b');assert.equal(links[1].href,'/ar/explore/?q=a%20b');assert.equal(links[0].href,'/explore/?q=a%20b');
assert.equal(homepageLanguageLinks('en',['ar'],'ar','/explore/?q=a\\b')[1].href,'/ar/explore/?q=a%5Cb');
assert.equal(homepageLanguageLinks('en',Array.from({length:20},(_,index)=>`l${index}`),'en','/').length,21,'the raw mapper renders every locale (invalid tags degrade to the code)');
const capped=addHomepageLanguageLinks({content:[{id:'nav',type:'Navbar',props:{}}]},'en',Array.from({length:20},(_,index)=>`l${index}`),'en','/');
assert.equal(capped.content[0].props.languageSwitcher.length,16,'the switcher cap holds below the 16-link refusal');
const labelled=addHomepageLanguageLinks({content:[{id:'nav',type:'Navbar',props:{localeLabels:{language:'Sprache'}}}]},'en',['ar'],'ar','/');
assert.equal(labelled.content[0].props.localeLabels.language,'Sprache','operator switcher labels survive the injection');
const defaulted=addHomepageLanguageLinks({content:[{id:'nav',type:'Navbar',props:{}}]},'en',['ar'],'ar','/');
assert.equal(defaulted.content[0].props.localeLabels.language,'اللغة');
// Logo-link localization pin: the Navbar logo root link follows the served locale, the source
// serve keeps '/', and the logo rewrite never touches a non-root logo link. The switcher and
// CTA anchors also render <a> inside the header, so the logo anchor is selected by its unique
// `flex items-center gap-2` class (renderNavbar, shell path: renderPage -> landing dispatcher).
const logoLocalized=addHomepageLanguageLinks({content:[{id:'nav',type:'Navbar',props:{logo:{type:'text',text:'Brand',link:'/'}}}]},'en',['ar'],'ar','/');
assert.equal(logoLocalized.content[0].props.logo.link,'/ar/','the localized serve rewrites the Navbar logo root link');
const logoSource=addHomepageLanguageLinks({content:[{id:'nav',type:'Navbar',props:{logo:{type:'text',text:'Brand',link:'/'}}}]},'en',['ar'],'en','/');
assert.equal(logoSource.content[0].props.logo.link,'/','the source serve keeps the Navbar logo root link');
const logoCustom=addHomepageLanguageLinks({content:[{id:'nav',type:'Navbar',props:{logo:{type:'text',text:'Brand',link:'/about/'}}}]},'en',['ar'],'ar','/');
assert.equal(logoCustom.content[0].props.logo.link,'/about/','only root logo links are rewritten');
const shellContext={user:{secret:'PRIVATE_CANARY'},page:{},app:{},visitor:{},url:{},system:{},cookies:{},local:{},session:{}};
const renderedLogoHref=async(layout,expected,message)=>{const dom=new JSDOM(await renderPage(layout,shellContext));assert.equal(dom.window.document.querySelector('header.fb-navbar a.flex.items-center.gap-2').getAttribute('href'),expected,message);dom.window.close();};
await renderedLogoHref(logoLocalized,'/ar/','the rendered logo anchor points at the localized root');
await renderedLogoHref(logoSource,'/','the rendered logo anchor keeps the source root');
await renderedLogoHref(logoCustom,'/about/','a non-root rendered logo anchor is untouched');
const dom=new JSDOM(`<html><body><div data-fb-nav-locale="ar" data-fb-nav-origins='["https://stage.test","https://site.test"]'><a id="dynamic" href="/blog/?page=2#top">Guide</a><a id="english" href="/blog/?page=2" data-fb-locale="en">English</a><a id="switch" href="/en/blog/?page=2" data-fb-locale="en">English</a><form method="get" action="/explore/"></form></div></body></html>`,{url:'https://stage.test/ar/',runScripts:'outside-only'});
const {window}=dom;window.eval(publicThemeScript());window.document.addEventListener('click',event=>event.preventDefault());
window.document.querySelector('#dynamic').click();assert.equal(window.document.querySelector('#dynamic').getAttribute('href'),'/ar/blog/?page=2#top');
window.document.querySelector('#english').click();assert.equal(window.document.querySelector('#english').getAttribute('href'),'/blog/?page=2');assert.equal(window.localStorage.getItem('frontbase:public-language'),'en');
window.location.hash='top';window.document.querySelector('#switch').click();assert.equal(window.document.querySelector('#switch').getAttribute('href'),'/en/blog/?page=2#top','switcher clicks keep the scrolled position');
const form=window.document.querySelector('form');form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(form.getAttribute('action'),'/ar/explore/');window.close();
console.log('translation-navigation: internal/query/hash paths, external/API/assets exclusions, nonmutating projection (openPage/Hero keys), dynamic anchors, GET forms, switcher encoding/fragment, explicit source-language return and Navbar logo-link localization (rendered anchors) PASS');
