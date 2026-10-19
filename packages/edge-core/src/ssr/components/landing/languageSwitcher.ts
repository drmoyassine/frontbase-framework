import { escapeHtml } from '../lib/utils.js';
export interface LanguageLink { code:string; label:string; href:string; current:boolean }
/** Real crawlable links. URL wins; preference is only remembered after an explicit choice. */
export function renderLanguageSwitcher(input:LanguageLink[]|undefined,label='Language'):string {
    if(!input?.length)return '';
    if(input.length>16||input.some(link=>!/^\/[A-Za-z0-9/_-]*$/.test(link.href)||link.href.startsWith('//')||!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(link.code)))throw Error('language_links_invalid');
    return `<nav class="fb-language-switcher" aria-label="${escapeHtml(label)}" style="display:flex;gap:8px;align-items:center">${input.map(link=>`<a href="${escapeHtml(link.href)}" hreflang="${escapeHtml(link.code)}" lang="${escapeHtml(link.code)}" data-fb-locale="${escapeHtml(link.code)}"${link.current?' aria-current="page"':''} style="padding:8px;border:1px solid currentColor;border-radius:6px;text-decoration:none;color:inherit;font-size:14px">${escapeHtml(link.label)}</a>`).join('')}</nav>`;
}
