import {publicMenuAudience,type MenuDefinition,type MenuItem} from '@frontbase/edge-core/menus';
export function nativeMenuProps(menu:MenuDefinition):Record<string,any>{
    const nav=(nodes:MenuItem[]):any[]=>nodes.filter(i=>!i.tone||i.tone==='navigation').map(i=>({id:i.id,label:i.label,navType:'link',target:i.href,subItems:nav(i.children)}));
    const button=(tone:string)=>{const i=menu.items.find(i=>i.tone===tone);return i?{enabled:true,text:i.label,navType:'link',target:i.href,variant:i.variant??'default'}:{enabled:false};};
    return {...menu.design.componentProps,logo:menu.slot==='footer'?menu.design.logoUrl:{...menu.design.componentProps?.logo,type:menu.design.logoUrl?'image':'text',text:menu.design.brand,imageUrl:menu.design.logoUrl,link:menu.design.brandHref},logoText:menu.design.brand,menuItems:nav(menu.items),primaryButton:button('primary'),secondaryButton:button('secondary'),sticky:menu.design.sticky,copyright:menu.design.copyright,
        columns:menu.items.filter(i=>!i.tone||i.tone==='navigation').map(i=>({id:i.id,title:i.label,links:i.children.map(c=>({id:c.id,text:c.label,href:c.href}))})),socials:menu.items.filter(i=>i.tone==='social').map(i=>({id:i.id,icon:i.icon,href:i.href}))};
}
export function changeNativeProp(menu:MenuDefinition,key:string,value:any):MenuDefinition{
    const prior=new Map<string,MenuItem>();const walk=(nodes:MenuItem[])=>nodes.forEach(i=>{prior.set(i.id,i);walk(i.children);});walk(menu.items);
    const node=(id:string,label:string,href:string,children:MenuItem[]=[],tone:MenuItem['tone']='navigation'):MenuItem=>({id,label,href,audience:prior.get(id)?.audience??publicMenuAudience(),children,tone});
    if(key==='menuItems'){const parse=(rows:any[]):MenuItem[]=>(rows??[]).map(i=>node(i.id??crypto.randomUUID(),i.label??'',i.navType==='scroll'?'#'+i.target:i.target??'/',parse(i.subItems??[])));return {...menu,items:[...parse(value),...menu.items.filter(i=>i.tone&&i.tone!=='navigation')]};}
    if(key==='columns')return {...menu,items:[...(value??[]).map((c:any)=>node(c.id??crypto.randomUUID(),c.title??'','/',(c.links??[]).map((l:any)=>node(l.id??crypto.randomUUID(),l.text??'',l.href??'/')))),...menu.items.filter(i=>i.tone&&i.tone!=='navigation')]};
    if(key==='primaryButton'||key==='secondaryButton'){const tone=key==='primaryButton'?'primary':'secondary',id=menu.items.find(i=>i.tone===tone)?.id??crypto.randomUUID();return {...menu,items:[...menu.items.filter(i=>i.tone!==tone),...(value.enabled?[{...node(id,value.text??'Contact',value.navType==='scroll'?'#'+value.target:value.target??value.href??'/',[],tone),variant:value.variant??'default'}]:[])]};}
    if(key==='socials')return {...menu,items:[...menu.items.filter(i=>i.tone!=='social'),...(value??[]).map((s:any)=>({...node(s.id??menu.items.find(i=>i.tone==='social'&&i.icon===s.icon)?.id??crypto.randomUUID(),s.icon??'Social',s.href??'/',[],'social'),icon:s.icon}))]};
    if(key==='logo'&&typeof value==='string')return {...menu,design:{...menu.design,logoUrl:value}};
    if(key==='logo')return {...menu,design:{...menu.design,brand:value.text??menu.design.brand,logoUrl:value.imageUrl??'',brandHref:value.link??'/',componentProps:{...menu.design.componentProps,logo:value}}};
    if(key==='logoText'||key==='copyright'||key==='sticky')return {...menu,design:{...menu.design,[key==='logoText'?'brand':key]:value}};
    return {...menu,design:{...menu.design,componentProps:{...menu.design.componentProps,[key]:value}}};
}
