import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {localizePublicHref,localizeNavigationProps} from '@frontbase/edge-core/localization';
import {publicThemeScript} from '@frontbase/edge-core/browser/theme';
const origins=['https://stage.test','https://site.test'];
for(const [value,expected] of [
 ['/explore/?type=program#results','/ar/explore/?type=program#results'],['/ar/explore/?page=2','/ar/explore/?page=2'],
 ['https://site.test/blog/guide/','/ar/blog/guide/'],['https://other.test/blog/','https://other.test/blog/'],
 ['mailto:help@site.test','mailto:help@site.test'],['tel:123','tel:123'],['#results','#results'],['//other.test/x','//other.test/x'],
 ['/api/data/execute','/api/data/execute'],['/frontbase-admin/pages','/frontbase-admin/pages'],['/static/logo.png','/static/logo.png'],
 ['/brochure.pdf','/brochure.pdf'],['javascript:alert(1)','javascript:alert(1)'],['https://user:pass@site.test/x','https://user:pass@site.test/x']
])assert.equal(localizePublicHref(value,'ar',origins),expected,value);
const source={href:'/blog/',src:'/cover.png',text:'/not-a-link',binding:'{{ record.originalPath }}',languageSwitcher:[{href:'/'}],initialRows:[{originalPath:'/program/'}]};
const projected=localizeNavigationProps(source,'ar',origins);assert.equal(projected.href,'/ar/blog/');assert.equal(projected.src,source.src);assert.equal(projected.text,source.text);assert.equal(projected.binding,source.binding);assert.equal(projected.languageSwitcher[0].href,'/');assert.equal(projected.initialRows[0].originalPath,'/ar/program/');assert.equal(source.href,'/blog/');
const dom=new JSDOM(`<html><body><div data-fb-nav-locale="ar" data-fb-nav-origins='["https://stage.test","https://site.test"]'><a id="dynamic" href="/blog/?page=2#top">Guide</a><a id="english" href="/blog/?page=2" data-fb-locale="en">English</a><form method="get" action="/explore/"></form></div></body></html>`,{url:'https://stage.test/ar/',runScripts:'outside-only'});
const {window}=dom;window.eval(publicThemeScript());window.document.addEventListener('click',event=>event.preventDefault());
window.document.querySelector('#dynamic').click();assert.equal(window.document.querySelector('#dynamic').getAttribute('href'),'/ar/blog/?page=2#top');
window.document.querySelector('#english').click();assert.equal(window.document.querySelector('#english').getAttribute('href'),'/blog/?page=2');assert.equal(window.localStorage.getItem('frontbase:public-language'),'en');
const form=window.document.querySelector('form');form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(form.getAttribute('action'),'/ar/explore/');window.close();
console.log('translation-navigation: internal/query/hash paths, external/API/assets exclusions, nonmutating projection, dynamic anchors, GET forms and explicit source-language return PASS');
