import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData,PageComponent} from '@frontbase/edge-core';
import {applyBlockVersion} from '@frontbase/edge-core/block-versions';
import type {SitePublicationManifest} from './site-publication-manifest.js';
import {publicationHash} from './publication-hash.js';

const roles={institutions:'institution',programs:'program',articles:'article'} as const;
const literal=(value:unknown)=>`'${String(value).replaceAll("'","''")}'`;
const quote=(name:string)=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error('invalid_live_view_identifier');return `"${name}"`;};

/** Native views shape public fields only. Every selection predicate is saved data. */
export async function pilotLiveViewPlan(base:SitePublicationManifest,owner:string,baseHash:string,targets?:Partial<Record<keyof typeof roles,string>>){
    const namespace=(await publicationHash({owner})).slice(0,8),origin=base.configuration.site.origin;
    return (Object.keys(roles) as (keyof typeof roles)[]).map(collection=>{
        const mapping=base.configuration.collections[roles[collection]],entries=base.index.filter(row=>row.collection===collection);
        if(!entries.length)throw Error('live_view_population_missing');
        const table=targets?.[collection]??`fb_live_${namespace}_${baseHash.slice(0,8)}_${collection}`;
        const fields=['id','title','summary','cover','coverAlt','logo',...(collection==='programs'?['institutionId']:collection==='institutions'?['cityId']:['byline','publishedAt'])];
        const projection=fields.map(key=>{
            const field=mapping.fields[key as keyof typeof mapping.fields];
            return `${field?['cover','logo'].includes(key)?`NULLIF(BTRIM(d.${quote(field)}::text),'')`:key==='summary'?`LEFT(d.${quote(field)}::text,${collection==='articles'?10000:1000})`:`d.${quote(field)}`:key==='summary'||key==='coverAlt'?"''":'NULL'} AS ${quote(key)}`;
        });
        const path=`d.${quote(mapping.fields.originalPath)}::text`;
        projection.push(`CASE WHEN LEFT(${path},${origin.length})=${literal(origin)} THEN SUBSTRING(${path} FROM ${origin.length+1}) ELSE ${path} END AS "originalPath"`,`d.${quote(mapping.scope.field)} AS "country_id"`);
        const filters:any[]=[{field:'country_id',operator:'eq',value:mapping.scope.value,label:'Destination country'}];
        let join='',extraColumns:string[]=[];
        if(collection==='articles'){
            projection.push('d."revision" AS "revision"',`d.${quote(mapping.fields.contentRole)}::text AS "contentRole"`,`d.${quote(mapping.fields.sourceOrigin)}::text AS "sourceOrigin"`);
            filters.push({field:'contentRole',operator:'eq',value:'article'},{field:'sourceOrigin',operator:'eq',value:origin});extraColumns=['contentRole','sourceOrigin'];
        }else{
            const parent=base.configuration.collections[collection==='institutions'?'city':'institution'];
            const fk=collection==='institutions'?mapping.fields.cityId:mapping.fields.institutionId;
            join=` LEFT JOIN public.${quote(parent.table)} parent ON parent.${quote(parent.fields.id)}::text=d.${quote(fk)}::text`;
            projection.push(`parent.${quote(parent.scope.field)}::text AS "parent_country_id"`);extraColumns=['parent_country_id'];
            filters.push({field:'parent_country_id',operator:'eq',value:String(parent.scope.value),label:'Parent destination country'});
            if(collection==='programs')filters.push({field:'institutionId',operator:'in',value:base.index.filter(row=>row.collection==='institutions').map(row=>row.id),label:'Selected parent institutions'});
        }
        filters.push({logic:'or',label:'Migrated selection — edit or remove to change membership',conditions:entries.map(row=>({logic:'and',label:String(row.id),conditions:[
            {field:'id',operator:'eq',value:row.id},{field:'originalPath',operator:'eq',value:row.originalPath},
            ...(collection==='articles'?[{field:'revision',operator:'eq',value:row.revision}]:[{field:collection==='institutions'?'cityId':'institutionId',operator:'eq',value:row.parentId}])
        ]}))});
        const select=`SELECT ${projection.join(',')} FROM public.${quote(mapping.table)} d${join}`;
        const sql=`CREATE OR REPLACE VIEW public.${quote(table)} WITH (security_invoker=true) AS ${select}; REVOKE ALL ON public.${quote(table)} FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.${quote(table)} TO service_role;`;
        return {collection,table,sql,filters,extraColumns,expected:entries.length,columns:[...fields,'originalPath','country_id',...(collection==='articles'?['revision']:[]),...extraColumns]};
    });
}
export type PilotLiveViews=Record<keyof typeof roles,{id:string;name:string;target_table:string;columns:string[]}>&{datasourceId:string};

function mapItem(nodes:PageComponent[]):PageComponent[]{return nodes.map(node=>{
    const {recordBindings,...props}=node.props??{},mapping=recordBindings as Record<string,any>|undefined;
    if(mapping){
        if(mapping.blocks)throw Error('detail_body_not_a_list');
        for(const field of ['text','href','src','alt'])if(mapping[field])props[field]=`{{ record.${mapping[field]} }}`;
        if(mapping.altFallback)props.alt=`{{ record.${mapping.alt} | default: record.${mapping.altFallback} }}`;
        if(mapping.ariaLabel)props.ariaLabel='{{ record.title }}';
    }
    return {...node,props,...(mapping?.hideWhenEmpty?{visibilityCondition:`record.${mapping.src} != null and record.${mapping.src} != ""`}:{}),...(node.children?{children:mapItem(node.children)}:{})};
});}

/** Change bindings in place, preserving IDs, layout, owner overrides and unrelated elements. */
export function convertPilotLiveLists(layout:PageLayoutData,views:PilotLiveViews):PageLayoutData{
    let browsing:Record<string,any>={};
    const findBrowsing=(nodes:PageComponent[])=>{for(const node of nodes){if(node.props?.directoryBrowsing)browsing=node.props.directoryBrowsing as any;if(node.children)findBrowsing(node.children);}};findBrowsing(layout.content);
    const walk=(nodes:PageComponent[]):PageComponent[]=>nodes.map(node=>{
        const convert=(current:PageComponent):PageComponent=>{
            const old=(current.props?.binding??current.binding) as any,legacy=current.props?.directoryQuery as any;
            const collection=old?.source?.kind==='publication'?old.tableName:legacy?.queryId?.endsWith('.list')?({institution:'institutions',program:'programs',article:'articles'} as any)[legacy.queryId.split('.')[1]]:undefined;
            if(!collection){
                const {directoryBrowsing,...props}=current.props??{};
                return {...current,props,...(current.children?{children:walk(current.children)}:{})};
            }
            const view=views[collection as keyof typeof roles];if(!view)throw Error('live_view_missing');
            const {directoryQuery,directoryControls,...props}=current.props??{},controls={...browsing,...(directoryControls as any??{})};
            // Legacy homepage teasers never rendered directory browsing controls.
            // Preserve their visible presentation; an explicitly authored standard controls group still wins.
            const teaser=!!layout.root?.directoryLanding&&!old;
            const binding={componentId:node.id,dataSourceId:views.datasourceId,tableName:view.target_table,viewId:view.id,viewName:view.name,
                pagination:old?.pagination??{enabled:teaser?false:controls.pagination??false,page:0,pageSize:legacy.params?.limit??12},
                sorting:old?.sorting??{enabled:true,column:'title',direction:'asc'},filtering:old?.filtering??{searchEnabled:false,filters:{}},
                columnOrder:view.columns,columnOverrides:old?.columnOverrides??{},hiddenFilters:old?.hiddenFilters??[]};
            if(!binding.dataSourceId)throw Error('live_datasource_missing');
            return {...current,type:'Repeater',binding:undefined,props:{...props,binding,controls:props.controls??{search:teaser?false:controls.search??false,searchColumn:'title',count:controls.recordCount??false,ordering:controls.sorting??false,paginationPosition:controls.paginationPosition??'bottom'}},children:mapItem(current.children??[])};
        };
        const converted=convert({...node,versions:undefined});
        return {...converted,...(node.versions?{versions:node.versions.map(version=>{
            const effective=convert(applyBlockVersion(node,version.id));
            // Preserve existing sparse overrides, adding only fields altered by conversion.
            const props={...version.overrides.props};
            for(const [key,value] of Object.entries(effective.props??{}))if(JSON.stringify(value)!==JSON.stringify(converted.props?.[key]))props[key]=value;
            if(props.binding&&(props.binding as any).source)props.binding=effective.props!.binding;
            return {...version,overrides:{...version.overrides,props,...(version.overrides.children?{children:effective.children}:{} )}};
        })}:{})};
    });
    return {...layout,root:{...layout.root,standardListComponents:{version:1}},content:walk(layout.content)};
}
