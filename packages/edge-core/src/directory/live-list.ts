import {z} from 'zod';
import {walkBlockTree,applyBlockVersion} from '../block-versions.js';
import type {PageLayoutData} from '../ssr/types.js';

// Authored binding only. Credentials, SQL and server seed rows never belong in a publication.
export const liveViewBindingSchema=z.object({
    componentId:z.string().min(1).max(200),dataSourceId:z.string().min(1).max(128),
    sourceSchema:z.string().min(1).max(63).refine(value=>!/[\r\n\0,]/.test(value)).optional(),
    tableName:z.string().min(1).max(128),viewId:z.string().min(1).max(128),viewName:z.string().max(200).optional(),
    pagination:z.object({enabled:z.boolean(),pageSize:z.number().int().min(1).max(100),page:z.number().int().min(0).max(20000)}).strict(),
    sorting:z.object({enabled:z.boolean(),column:z.string().max(128).optional(),direction:z.enum(['asc','desc']).optional()}).strict(),
    filtering:z.object({searchEnabled:z.boolean(),filters:z.record(z.unknown())}).strict(),
    chartConfig:z.object({category:z.string().max(128).optional(),aggregation:z.enum(['count','sum','average','min','max']).optional(),value:z.string().max(128).optional(),sort:z.enum(['none','asc','desc']).optional(),variant:z.enum(['vertical','horizontal']).optional(),maxRows:z.number().int().min(1).max(1000).optional()}).strict().optional(),
    columnOrder:z.array(z.string().max(128)).max(100).optional(),columnOverrides:z.record(z.unknown()),
    searchColumns:z.array(z.string().max(128)).max(100).optional(),hiddenFilters:z.array(z.unknown()).max(50).optional(),
    frontendFilters:z.array(z.unknown()).max(50).optional(),refreshInterval:z.number().optional(),fieldMapping:z.record(z.string()).optional(),
}).strict().refine(binding=>binding.dataSourceId!=='frontbase:publication');

export function liveViewBindings(layout:PageLayoutData){
    const found:z.infer<typeof liveViewBindingSchema>[]=[];
    walkBlockTree(layout.content,node=>{
        for(const id of ['default',...(node.versions??[]).map(version=>version.id)]){
            const effective=applyBlockVersion(node,id),binding=effective.props?.binding??effective.binding;
            if(binding&&!(binding as any).source){
                if(!['Repeater','DataTable','Grid','Card','KPICard','Chart','InfoList'].includes(node.type))throw Error('invalid_live_list_element');
                const policyNodes=effective.type==='Card'&&layout.root?.templatePolicy?[{id:'$template-policy-fields',type:'Text',props:{templatePolicy:layout.root.templatePolicy}}]:[];
                found.push(liveViewBindingSchema.parse(bindingWithTemplateFields(binding as any,[...effective.children??[],...policyNodes])));
            }
        }
    });
    return found;
}

/** Record references are derived from authored elements, not a fixed Card schema. Nested
 * data-bound components own their own record scope and do not broaden their parent. */
export function templateRecordFields(children:PageLayoutData['content']):string[]{
    const fields=new Set<string>();
    const value=(input:unknown):void=>{if(typeof input==='string'){
        for(const match of input.matchAll(/\brecord\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/g))fields.add(match[1]!);
        for(const match of input.matchAll(/\brecord\[("(?:[^"\\]|\\.)*")\]/g))try{fields.add(JSON.parse(match[1]!));}catch{/* Invalid Liquid is reported by the renderer. */}
    }else if(Array.isArray(input))input.forEach(value);else if(input&&typeof input==='object')Object.values(input).forEach(value);};
    const walk=(nodes:PageLayoutData['content'])=>{for(const node of nodes){if((node.props?.binding??node.binding)&&['Repeater','Card','Grid','DataTable'].includes(node.type))continue;value(node.props);value(node.visibilityCondition);if(node.children)walk(node.children);for(const version of node.versions??[]){value(version.overrides.props);if(version.overrides.children)walk(version.overrides.children as PageLayoutData['content']);}}};
    walk(children);return [...fields];
}
export function bindingWithTemplateFields<T extends {columnOrder?:string[]}>(binding:T,children:PageLayoutData['content']):T{
    const fields=templateRecordFields(children).filter(field=>field.includes('.'));
    return fields.length?{...binding,columnOrder:[...new Set([...binding.columnOrder??[],...fields])]}:binding;
}
