import {z} from 'zod';
import {walkBlockTree,applyBlockVersion} from '../block-versions.js';
import type {PageLayoutData} from '../ssr/types.js';

// Authored binding only. Credentials, SQL and server seed rows never belong in a publication.
export const liveViewBindingSchema=z.object({
    componentId:z.string().min(1).max(200),dataSourceId:z.string().min(1).max(128),
    tableName:z.string().min(1).max(128),viewId:z.string().min(1).max(128),viewName:z.string().max(200).optional(),
    pagination:z.object({enabled:z.boolean(),pageSize:z.number().int().min(1).max(100),page:z.number().int().min(0).max(20000)}).strict(),
    sorting:z.object({enabled:z.boolean(),column:z.string().max(128).optional(),direction:z.enum(['asc','desc']).optional()}).strict(),
    filtering:z.object({searchEnabled:z.boolean(),filters:z.record(z.unknown())}).strict(),
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
                if(!['Repeater','DataTable','Grid'].includes(node.type))throw Error('invalid_live_list_element');
                found.push(liveViewBindingSchema.parse(binding));
            }
        }
    });
    return found;
}
