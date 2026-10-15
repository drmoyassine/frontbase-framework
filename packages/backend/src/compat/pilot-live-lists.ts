import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData,PageComponent} from '@frontbase/edge-core';
import {applyBlockVersion} from '@frontbase/edge-core/block-versions';
import type {SitePublicationManifest} from './site-publication-manifest.js';
import {publicationHash} from './publication-hash.js';

const roles={institutions:'institution',programs:'program',articles:'article'} as const;
const literal=(value:unknown)=>`'${String(value).replaceAll("'","''")}'`;
const quote=(name:string)=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error('invalid_live_view_identifier');return `"${name}"`;};

/** Live SELECTs, with the existing approved route membership as an admission guard.
 * No record values are copied into a new table. Article revisions remain approval-bound. */
export async function pilotLiveViewPlan(base:SitePublicationManifest,owner:string,baseHash:string){
    const namespace=(await publicationHash({owner})).slice(0,8),origin=base.configuration.site.origin;
    return (Object.keys(roles) as (keyof typeof roles)[]).map(collection=>{
        const mapping=base.configuration.collections[roles[collection]],entries=base.index.filter(row=>row.collection===collection);
        if(!entries.length)throw Error('live_view_population_missing');
        const table=`fb_live_${namespace}_${baseHash.slice(0,8)}_${collection}`;
        const fields=['id','title','summary','cover','coverAlt','logo',...(collection==='programs'?['institutionId']:collection==='institutions'?['cityId']:['byline','publishedAt'])];
        const projection=fields.map(key=>{
            const field=mapping.fields[key as keyof typeof mapping.fields];
            return `${field?['cover','logo'].includes(key)?`NULLIF(BTRIM(d.${quote(field)}::text),'')`:key==='summary'?`LEFT(d.${quote(field)}::text,${collection==='articles'?10000:1000})`:`d.${quote(field)}`:key==='summary'||key==='coverAlt'?"''":'NULL'} AS ${quote(key)}`;
        });
        projection.push('admitted.path AS "originalPath"',`d.${quote(mapping.scope.field)} AS "country_id"`);
        if(collection==='articles')projection.push('d."revision" AS "revision"');
        const values=entries.map(row=>`(${literal(row.id)},${literal(row.originalPath)},${collection==='articles'?String(row.revision):'NULL::integer'},${row.parentId===undefined?'NULL::text':literal(row.parentId)})`).join(',');
        const predicate=[`d.${quote(mapping.fields.id)}::text=admitted.id`,`d.${quote(mapping.scope.field)}::text=${literal(mapping.scope.value)}`,
            `(d.${quote(mapping.fields.originalPath)}=admitted.path OR d.${quote(mapping.fields.originalPath)}=${literal(origin)}||admitted.path)`];
        if(collection==='articles')predicate.push('d."revision"=admitted.revision',`d.${quote(mapping.fields.contentRole)}='article'`,`d.${quote(mapping.fields.sourceOrigin)}=${literal(origin)}`);
        else{
            const parent=base.configuration.collections[collection==='institutions'?'city':'institution'];
            const parentTable=collection==='programs'?`fb_live_${namespace}_${baseHash.slice(0,8)}_institutions`:parent.table;
            predicate.push(`d.${quote(collection==='institutions'?mapping.fields.cityId:mapping.fields.institutionId)}::text=admitted.parent_id`,
                `EXISTS(SELECT 1 FROM public.${quote(parentTable)} parent WHERE parent.${quote(collection==='programs'?'id':parent.fields.id)}::text=admitted.parent_id AND parent.${quote(collection==='programs'?'country_id':parent.scope.field)}::text=${literal(parent.scope.value)})`);
        }
        const select=`SELECT ${projection.join(',')} FROM public.${quote(mapping.table)} d JOIN (VALUES ${values}) AS admitted(id,path,revision,parent_id) ON ${predicate.join(' AND ')}`;
        // One execute_sql RPC transaction; nested BEGIN/COMMIT is illegal in a Postgres function.
        const sql=`CREATE OR REPLACE VIEW public.${quote(table)} WITH (security_invoker=true) AS ${select}; REVOKE ALL ON public.${quote(table)} FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.${quote(table)} TO service_role;`;
        return {collection,table,sql,expected:entries.length,columns:[...fields,'originalPath','country_id',...(collection==='articles'?['revision']:[])]};
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
            const binding={componentId:node.id,dataSourceId:views.datasourceId,tableName:view.target_table,viewId:view.id,viewName:view.name,
                pagination:old?.pagination??{enabled:controls.pagination??false,page:0,pageSize:legacy.params?.limit??12},
                sorting:old?.sorting??{enabled:true,column:'title',direction:'asc'},filtering:old?.filtering??{searchEnabled:false,filters:{}},
                columnOrder:view.columns,columnOverrides:old?.columnOverrides??{},hiddenFilters:old?.hiddenFilters??[]};
            if(!binding.dataSourceId)throw Error('live_datasource_missing');
            return {...current,type:'Repeater',binding:undefined,props:{...props,binding,controls:props.controls??{search:controls.search??false,searchColumn:'title',count:controls.recordCount??false,ordering:controls.sorting??false,paginationPosition:controls.paginationPosition??'bottom'}},children:mapItem(current.children??[])};
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
