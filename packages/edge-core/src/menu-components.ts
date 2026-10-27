import type {MenuDefinition,MenuItem,VerifiedMenuAudience} from './menus.js';
import {visibleMenuItems} from './menus.js';
import type {PageComponent,PageLayoutData} from './ssr/types.js';
const hsl=(hex:string)=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) as [number,number,number];const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360;}return `${h.toFixed(2)} ${(s*100).toFixed(2)}% ${(l*100).toFixed(2)}%`;};
export function menuComponent(menu:MenuDefinition,audience:VerifiedMenuAudience|null,siteName=''):PageComponent {
    if(!menu.design.brand&&siteName)menu={...menu,design:{...menu.design,brand:siteName}};
    const items=visibleMenuItems(menu.items,audience),props=menu.design.componentProps??{};
    const nav=(nodes:MenuItem[]):unknown[]=>nodes.filter(i=>!i.tone||i.tone==='navigation').map(i=>({id:i.id,label:i.label,navType:'link',target:i.href,...(i.children.length?{subItems:nav(i.children)}:{})}));
    const button=(tone:'primary'|'secondary')=>{const i=items.find(i=>i.tone===tone);return i?{enabled:true,text:i.label,navType:'link',target:i.href,variant:i.variant??'default'}: {enabled:false};};
    return {id:`managed-menu-${menu.id}`,type:menu.slot==='footer'?'Footer':menu.slot.includes('sidebar')?'Sidebar':'Navbar',props:{...props,regionName:menu.name,contentMaxWidth:menu.design.maxWidth,themeSurface:menu.slot==='footer',
        ...(menu.slot==='footer'?{logoText:menu.design.brand,logo:menu.design.logoUrl,copyright:menu.design.copyright,columns:items.filter(i=>(!i.tone||i.tone==='navigation')&&i.children.length).map(i=>({id:i.id,title:i.label,links:i.children.map(c=>({id:c.id,text:c.label,href:c.href}))})),socials:items.filter(i=>i.tone==='social').map(i=>({icon:i.icon??'website',href:i.href}))}
        :{logo:{...(props.logo as object??{}),type:menu.design.logoUrl?'image':'text',text:menu.design.brand,imageUrl:menu.design.logoUrl,link:menu.design.brandHref},menuItems:nav(items),primaryButton:button('primary'),secondaryButton:button('secondary'),sticky:menu.design.sticky}),
        className:menu.slot.includes('sidebar')?'fb-managed-sidebar':'fb-managed-region'},styles:{values:{backgroundColor:menu.design.background,color:menu.design.foreground,'--background':hsl(menu.design.background),'--foreground':hsl(menu.design.foreground),'--muted-foreground':hsl(menu.design.foreground),width:'100%',...(menu.slot.includes('sidebar')?{maxWidth:`${menu.design.maxWidth}px`}:{}),...(menu.slot.includes('sidebar')&&menu.design.sticky?{position:'sticky',top:'0px'}:{}),marginLeft:'auto',marginRight:'auto'}}};
}
/** Project already authorized regions through existing component rendering, never a second renderer. */
export function composeMenuRegions(layout:PageLayoutData,regions:Partial<Record<MenuDefinition['slot'],MenuDefinition>>,audience:VerifiedMenuAudience|null,siteName=''):PageLayoutData {
    const content:PageComponent[]=[];
    if(regions.header)content.push(menuComponent(regions.header,audience,siteName));
    if(regions['left-sidebar']||regions['right-sidebar']){
        const children:PageComponent[]=[];
        for(const slot of ['left-sidebar','content','right-sidebar'] as const){if(slot==='content')children.push({id:'managed-menu-page-body',type:'Container',props:{className:'fb-managed-page-body'},styles:{minWidth:0,flex:'1'},children:layout.content});else if(regions[slot])children.push({id:`managed-${slot}`,type:'Container',props:{className:'fb-managed-sidebar-slot'},styles:{width:'260px',flexShrink:0},stylesData:{viewportOverrides:{mobile:{width:'100%'}}},children:[menuComponent(regions[slot]!,audience,siteName)]});}
        content.push({id:'managed-menu-body',type:'Container',props:{className:'fb-managed-app-body'},styles:{display:'flex',width:'100%',gap:'24px'},stylesData:{viewportOverrides:{mobile:{flexDirection:'column'}}},children});
    }else content.push(...layout.content);
    if(regions.footer)content.push(menuComponent(regions.footer,audience,siteName));return {...layout,content};
}
