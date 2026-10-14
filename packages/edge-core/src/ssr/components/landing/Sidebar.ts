import {escapeHtml} from '../lib/utils.js';
import {stylesDataToCSS,type StylesData} from '../lib/styles.js';
import type {NavbarProps,NavMenuItem} from './Navbar.js';
/** Managed vertical navigation; native details provide keyboard/mobile expansion without a new runtime. */
export function renderSidebar(id:string,props:NavbarProps&{regionName?:string},styles?:StylesData):string {
    const links=(items:NavMenuItem[]):string=>items.map(item=>item.subItems?.length
        ? `<li><details><summary>${escapeHtml(item.label)}</summary><ul>${links(item.subItems)}</ul></details></li>`
        : `<li><a href="${escapeHtml(item.navType==='scroll'?'#'+item.target:item.target)}">${escapeHtml(item.label)}</a></li>`).join('');
    const logo=props.logo,brand=logo?.imageUrl?`<img src="${escapeHtml(logo.imageUrl)}" alt="${escapeHtml(logo.text??'')}" width="160" style="max-width:100%;height:auto">`:escapeHtml(logo?.text??'');
    const button=(kind:'primaryButton'|'secondaryButton')=>{const b=props[kind];return b?.enabled?`<a class="fb-sidebar-cta" href="${escapeHtml(b.navType==='scroll'?'#'+(b.target??''):b.target??'/')}">${escapeHtml(b.text??'')}</a>`:'';};
    const name=escapeHtml(props.regionName??'Sidebar navigation');
    const scale=typeof props.scale==='number'&&Number.isFinite(props.scale)?Math.max(.5,Math.min(2,props.scale)):1;
    const classes=['fb-managed-sidebar',props.hideOnMobile?'fb-sidebar-hide-mobile':'',props.hideOnDesktop?'fb-sidebar-hide-desktop':''].filter(Boolean).join(' ');
    return `<aside id="${escapeHtml(id)}" class="${classes}" style="${stylesDataToCSS(styles)};font-size:${14*scale}px"><details class="fb-sidebar-disclosure" open><summary>${name}</summary><div class="fb-sidebar-content">${brand?`<a class="fb-sidebar-brand" href="${escapeHtml(logo?.link??'/')}">${brand}</a>`:''}<nav aria-label="${name}"><ul>${links(props.menuItems??[])}</ul></nav>${button('primaryButton')}${button('secondaryButton')}${props.showDarkModeToggle?'<button type="button" data-fb-theme-toggle aria-label="Toggle dark mode">Change theme</button>':''}</div></details></aside><style>.fb-managed-sidebar{padding:16px;box-sizing:border-box}.fb-managed-sidebar ul{list-style:none;padding:0;margin:0}.fb-managed-sidebar ul ul{padding-left:16px}.fb-managed-sidebar a,.fb-managed-sidebar summary,.fb-managed-sidebar button{display:block;padding:10px 12px;min-height:44px;color:inherit}.fb-managed-sidebar a:focus-visible,.fb-managed-sidebar summary:focus-visible,.fb-managed-sidebar button:focus-visible{outline:2px solid currentColor;outline-offset:2px}.fb-sidebar-brand{font-weight:700}.fb-sidebar-disclosure>summary{display:none}.fb-sidebar-cta{border:1px solid currentColor;border-radius:8px;margin-top:8px}@media(min-width:641px){.fb-sidebar-hide-desktop{display:none}}@media(max-width:640px){.fb-sidebar-hide-mobile{display:none}.fb-sidebar-disclosure>summary{display:list-item;cursor:pointer}.fb-sidebar-disclosure:not([open])>.fb-sidebar-content{display:none}}</style>`;
}
