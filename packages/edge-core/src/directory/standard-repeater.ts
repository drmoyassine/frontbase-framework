import { z } from 'zod';
import type { PageComponent, PageLayoutData } from '../ssr/types.js';
import type { DirectoryConfiguration } from './configuration.js';
import { walkBlockTree, validateBlockVersions } from '../block-versions.js';

export const publicationListSourceSchema=z.object({kind:z.literal('publication'),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function standardPublicationQueries(layout:PageLayoutData):string[]{
    const result=new Set<string>();
    const inspect=(node:PageComponent,props=node.props??{})=>{
        const binding=(props.binding??node.binding) as Record<string,any>|undefined;
        if(binding?.source?.kind!=='publication')return;
        publicationListSourceSchema.parse(binding.source);
        if(node.type!=='Repeater'||binding.dataSourceId!=='frontbase:publication'||!['institutions','programs','articles'].includes(binding.tableName))throw Error('invalid_snapshot_binding');
        result.add(`directory.${({institutions:'institution',programs:'program',articles:'article'} as Record<string,string>)[binding.tableName]}.list`);
    };
    walkBlockTree(layout.content,node=>{inspect(node);for(const version of node.versions??[])if(version.overrides.props?.binding)inspect(node,{...node.props,...version.overrides.props});});
    return [...result];
}

/** Inspectable, pure conversion. No row fetch, save or publication side effects. */
export function migrateExploreRepeater(layout:PageLayoutData,hash:string,configuration:DirectoryConfiguration):PageLayoutData{
    const source=publicationListSourceSchema.parse({kind:'publication',hash});
    return versionExploreRepeater(layout,configuration.browsing,(table)=>({
        dataSourceId:'frontbase:publication',tableName:table,source,
        columnOrder:['title','id','parentId','summary','cover','logo','originalPath'],
    }));
}

/** Fresh templates have no datasource yet. The normal Builder Bind picker
 * completes each version independently before publication. */
export function createVersionedExploreDraft(layout:PageLayoutData,browsing:DirectoryConfiguration['browsing']):PageLayoutData{
    return versionExploreRepeater(layout,browsing,()=>({dataSourceId:'',tableName:'',columnOrder:[]}));
}

function versionExploreRepeater(layout:PageLayoutData,browsing:DirectoryConfiguration['browsing'],
    sourceFor:(table:'institutions'|'programs')=>Record<string,unknown>):PageLayoutData{
    const matches:PageComponent[]=[];walkBlockTree(layout.content,node=>{if(['directory.institution.list','directory.program.list'].includes(String((node.props?.directoryQuery as any)?.queryId)))matches.push(node);});
    if(matches.length!==2)throw Error('Explore conversion requires exactly two legacy listing elements');
    const institutions=matches.find(node=>(node.props?.directoryQuery as any)?.queryId==='directory.institution.list')!,programs=matches.find(node=>(node.props?.directoryQuery as any)?.queryId==='directory.program.list')!;
    if(!institutions||!programs||institutions.versions?.length||programs.versions?.length)throw Error('Explore conversion needs review');
    const fieldTree=(nodes:PageComponent[]):PageComponent[]=>nodes.map(node=>{
        const {recordBindings,...props}=node.props??{},mapping=recordBindings as Record<string,any>|undefined;
        if(mapping){
            if(mapping.blocks||mapping.format)throw Error('Unsupported record mapping requires manual conversion');
            for(const key of ['text','src','href','alt'] as const)if(mapping[key])props[key]=`{{ record.${mapping[key]} }}`;
            if(mapping.altFallback)props.alt=`{{ record.${mapping.alt} | default: record.${mapping.altFallback} }}`;
            if(mapping.ariaLabel)props.ariaLabel='{{ record.title }}';
        }
        return {...node,props,...(mapping?.hideWhenEmpty?{visibilityCondition:`record.${mapping.src} != null and record.${mapping.src} != ""`}:{}),...(node.children?{children:fieldTree(node.children)}:{})};
    });
    const propsFor=(node:PageComponent,table:'institutions'|'programs')=>{
        const {directoryQuery,directoryControls,...props}=node.props??{};
        const params=(directoryQuery as any).params??{},legacy=(directoryControls??{}) as Record<string,any>;
        return {...props,binding:{componentId:institutions.id,...sourceFor(table),pagination:{enabled:legacy.pagination??true,page:0,pageSize:params.limit??browsing.pageSize},sorting:{enabled:true,column:'title',direction:params.sort==='title-desc'?'desc':'asc'},filtering:{searchEnabled:false,filters:{}},columnOverrides:{},hiddenFilters:[]},
            controls:{search:legacy.search??browsing.search,searchColumn:'title',searchLabel:'Search by title',searchPlaceholder:table==='programs'?'Find a program':'Find an institution',count:legacy.recordCount??false,ordering:legacy.sorting??false,paginationStyle:legacy.paginationStyle==='numbered'?'numbered':'previous-next',paginationPosition:legacy.paginationPosition==='top'?'top':legacy.paginationPosition==='both'?'both':'bottom',filters:legacy.filters?[{id:`${institutions.id}-title-filter`,column:'title',label:'Title contains',operator:'contains',type:'text'}]:[]}};
    };
    const defaultProps=propsFor(institutions,'institutions'),alternativeProps=propsFor(programs,'programs');
    const overrides=Object.fromEntries(Object.entries(alternativeProps).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify((defaultProps as Record<string,unknown>)[key])));
    // Keep a Programs binding override even if both sources are still blank.
    overrides.binding=alternativeProps.binding;
    const replacement:PageComponent={...institutions,props:defaultProps,children:fieldTree(institutions.children??[]),versions:[{id:'programs',name:'Programs',when:'url.type == "program"',overrides:{props:overrides,children:fieldTree(programs.children??[]),...(programs.styles?{styles:programs.styles}:{})}}]};
    const buttons:PageComponent[]=['institution','program'].map(value=>({id:`${institutions.id}-switch-${value}`,type:'Button',props:{text:value==='program'?'Programs':'Institutions',variant:'outline',actionBindings:[{trigger:'onClick',actionType:'setVariable',config:{variableScope:'url',variableName:'type',variableValue:value}}]}}));
    let hasButtons=false;
    const convert=(nodes:PageComponent[]):PageComponent[]=>nodes.filter(node=>node.id!==programs.id).map(node=>{
        if(node.id===institutions.id)return replacement;
        if(node.props?.directoryBrowsing){if(node.children?.length)throw Error('Custom browsing content requires review');hasButtons=true;return {...node,props:{className:'flex flex-wrap gap-2'},children:buttons};}
        return {...node,...(node.children?{children:convert(node.children)}:{})};
    });
    const content=convert(layout.content);if(!hasButtons)content.unshift({id:`${institutions.id}-switches`,type:'Container',props:{className:'flex flex-wrap gap-2'},children:buttons});
    validateBlockVersions(content);
    return {...layout,root:{...layout.root,standardListComponents:{version:1}},content};
}
