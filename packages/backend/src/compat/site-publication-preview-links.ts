import type {PageComponent} from '@frontbase/edge-core';
/** Keep native shared navigation and page links inside the same private capture. */
export function rewritePublicationPreviewLinks(nodes:PageComponent[],paths:Set<string>,hash:string,origin:string):PageComponent[]{
    const link=(value:unknown):unknown=>{
        if(typeof value!=='string')return value;
        try{const target=new URL(value,'https://publication-preview.invalid');
            if(target.username||target.password||target.hash||!paths.has(target.pathname)||![origin,'https://publication-preview.invalid'].includes(target.origin))return value;
            const params=new URLSearchParams({hash,path:target.pathname});for(const [key,value]of target.searchParams)params.append(key,value);
            return `/api/project/site-configuration/publication/render/?${params}`;
        }catch{return value;}
    };
    const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
    const items=(value:unknown,depth=0):unknown=>Array.isArray(value)&&depth<8?value.map(item=>record(item)?{...item,...(item.navType!=='scroll'?{target:link(item.target)}:{}),...(item.subItems?{subItems:items(item.subItems,depth+1)}:{})}:item):value;
    return nodes.map(node=>{
        const props={...node.props};if(props.href!==undefined)props.href=link(props.href);
        if(record(props.logo))props.logo={...props.logo,link:link(props.logo.link)};
        if(props.menuItems)props.menuItems=items(props.menuItems);
        for(const key of ['primaryButton','secondaryButton'])if(record(props[key])&&props[key].navType!=='scroll')props[key]={...props[key],target:link(props[key].target)};
        if(Array.isArray(props.columns))props.columns=props.columns.map(column=>record(column)&&Array.isArray(column.links)?{...column,links:column.links.map(item=>record(item)?{...item,href:link(item.href)}:item)}:column);
        if(record(props.templateSearchState))props.templateSearchState={...props.templateSearchState,previewHash:hash};
        return {...node,props,...(node.children?{children:rewritePublicationPreviewLinks(node.children,paths,hash,origin)}:{})};
    });
}
