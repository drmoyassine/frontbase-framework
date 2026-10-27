import {it,expect} from 'vitest';
import {markSharedMenuPreview,isSharedMenuPreview} from './sharedMenuPreview';
it('marks projected regions without marking the page body',()=>{
    const doc=document.implementation.createHTMLDocument();
    doc.body.innerHTML='<header id="managed-menu-header" class="fb-navbar"><a>Shared link</a></header><main class="fb-managed-page-body"><p>Body</p></main><aside class="fb-managed-sidebar"><p>Sidebar</p></aside>';
    markSharedMenuPreview(doc);
    expect(isSharedMenuPreview(doc.querySelector('a'))).toBe(true);
    expect(isSharedMenuPreview(doc.querySelector('aside p'))).toBe(true);
    expect(isSharedMenuPreview(doc.querySelector('main p'))).toBe(false);
    expect(doc.querySelector('header')?.title).toBe('Shared menu — edit in Menus');
});
