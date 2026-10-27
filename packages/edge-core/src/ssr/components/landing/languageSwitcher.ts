import { escapeHtml } from '../lib/utils.js';
export interface LanguageLink { code:string; label:string; href:string; current:boolean }
/** Real crawlable links. URL wins; preference is only remembered after an explicit choice. */
export function renderLanguageSwitcher(input:LanguageLink[]|undefined,label='Language'):string {
    if(!input?.length)return '';
    if(input.length>16||input.some(link=>!/^\/[^\s<>\\]*$/.test(link.href)||link.href.startsWith('//')||!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(link.code)))throw Error('language_links_invalid');
    const current=input.find(link=>link.current)??input[0]!;
    return `<details class="fb-language-switcher" data-fb-language-picker style="position:relative"><summary aria-label="${escapeHtml(label)}: ${escapeHtml(current.label)}" style="cursor:pointer;padding:8px 10px;border:1px solid currentColor;border-radius:6px;white-space:nowrap;font-size:14px">${escapeHtml(current.label)}</summary><nav aria-label="${escapeHtml(label)}" style="position:absolute;inset-inline-end:0;top:calc(100% + 8px);z-index:80;min-width:140px;padding:6px;background:hsl(var(--background,0 0% 100%));color:hsl(var(--foreground,222 47% 11%));border:1px solid currentColor;border-radius:8px;box-shadow:0 8px 24px #0003">${input.map(link=>`<a href="${escapeHtml(link.href)}" hreflang="${escapeHtml(link.code)}" lang="${escapeHtml(link.code)}" data-fb-locale="${escapeHtml(link.code)}"${link.current?' aria-current="page"':''} style="display:block;padding:8px 10px;text-decoration:none;color:inherit;font-size:14px">${escapeHtml(link.label)}${link.current?' ✓':''}</a>`).join('')}</nav></details>`;
}
