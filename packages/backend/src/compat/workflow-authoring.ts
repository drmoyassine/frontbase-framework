/** Visual authoring is an adapter to the existing graph executor and tenant stores.
 * This preview admits deterministic transforms and guarded HTTP/agent turns.
 * Other provider nodes and cancellation need an explicit capability contract. */
import {defaultExecutorRegistry,inMemoryWorkflowProvider,type WorkflowNode,type WorkflowEdge} from '@frontbase/edge-core/workflow';
import type {Phase2Store} from '../db/phase2-store.js';
import {runAndRecordAt} from '../routes/phase2.js';
import {guardedExternalFetch,type CompatFetch} from './external-http.js';

const supported=new Set(['trigger','manual_trigger','transform','json_transform','http_request','agent','http_response']);
const transformations=new Set(['setFields','extractField','renameFields','keepFields','removeFields']);
export class WorkflowCapabilityError extends Error{}
export function authoringGraph(row:Record<string,unknown>,nodeId?:string){
    const nodes=JSON.parse(String(row.nodes??'[]')) as WorkflowNode[],edges=JSON.parse(String(row.edges??'[]')) as WorkflowEdge[];
    if(!Array.isArray(nodes)||!nodes.length||nodes.length>64||!Array.isArray(edges)||edges.length>128)throw Error('workflow_graph_invalid');
    const ids=new Set<string>();for(const node of nodes){if(!node||typeof node.id!=='string'||!node.id||ids.has(node.id)||!supported.has(node.type))throw new WorkflowCapabilityError('workflow_node_unsupported');ids.add(node.id);
        const inputs=node.inputs??node.data?.inputs??[];if(!Array.isArray(inputs))throw Error('workflow_graph_invalid');
        if(node.type==='transform'||node.type==='json_transform'){const operation=inputs.find(input=>input.name==='operation')?.value;if(operation&&!transformations.has(String(operation)))throw new WorkflowCapabilityError('transform_operation_unsupported');}
    }
    if(edges.some(edge=>!ids.has(edge.source)||!ids.has(edge.target)||edge.source===edge.target))throw Error('workflow_graph_invalid');
    const seen=new Set<string>(),visiting=new Set<string>();const visit=(id:string)=>{if(visiting.has(id))throw Error('workflow_cycle');if(seen.has(id))return;visiting.add(id);for(const edge of edges.filter(edge=>edge.source===id))visit(edge.target);visiting.delete(id);seen.add(id);};for(const id of ids)visit(id);
    if(nodeId&&!ids.has(nodeId))throw Error('workflow_node_not_found');
    // A node test executes that node only with explicitly supplied inputs; it never replays ancestors.
    return {nodes:nodeId?nodes.filter(node=>node.id===nodeId):nodes,edges:nodeId?[]:edges};
}
const versionPrefix=(id:string)=>'workflow_authoring:version:'+encodeURIComponent(id)+':';
const detailKey=(id:string)=>'workflow_authoring:execution:'+id;
export async function snapshotWorkflow(store:Phase2Store,row:Record<string,unknown>,at:string,label:string|null,actor:string){
    const graph=authoringGraph(row),id=crypto.randomUUID();
    const version={id,automationId:String(row.id),versionNumber:Number(row.version??1),name:String(row.name),triggerType:'manual',nodes:graph.nodes,edges:graph.edges,settings:{},label,createdAt:at,createdBy:actor};
    await store.upsertSetting(versionPrefix(String(row.id))+id,JSON.stringify(version),at);return version;
}
export async function workflowVersions(store:Phase2Store,id:string){
    return (await store.listSettings()).filter(row=>String(row.key).startsWith(versionPrefix(id))).map(row=>JSON.parse(String(row.value))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
}
export async function workflowVersion(store:Phase2Store,id:string,versionId:string){
    if(!/^[a-f0-9-]{36}$/i.test(versionId))return null;const raw=await store.getSetting(versionPrefix(id)+versionId);if(!raw)return null;
    const version=JSON.parse(raw);return version.automationId===id&&version.id===versionId?version:null;
}
export async function runAuthoringWorkflow(store:Phase2Store,tenant:string,row:Record<string,unknown>,parameters:Record<string,unknown>,now:()=>string,nodeId:string|undefined,externalFetch:CompatFetch){
    const graph=authoringGraph(row,nodeId),id=crypto.randomUUID(),provider=inMemoryWorkflowProvider(),controller=new AbortController();
    const executors=defaultExecutorRegistry({fetchImpl:async(input,init)=>{try{return await guardedExternalFetch(externalFetch,input,{...init,signal:init?.signal?AbortSignal.any([init.signal,controller.signal]):controller.signal});}catch{throw Error('workflow_http_failed');}}});
    const trigger=executors.resolve('trigger')!;executors.register({types:['trigger','manual_trigger'],async execute(node,inputs,context){const result=await trigger.execute(node,inputs,context);return {...result,payload:result};}});
    await store.createExecution(id,String(row.id),nodeId?'authoring_node':'authoring_test',now(),parameters);
    const wf={name:String(row.name),nodes:JSON.stringify(graph.nodes),edges:JSON.stringify(graph.edges)};
    const timer=setTimeout(()=>controller.abort(),20000);
    try{await runAndRecordAt(store,id,String(row.id),tenant,wf,parameters,now,{executors,settings:{log_level:'none',execution_timeout_ms:21000},provider:{...provider,async updateExecution(executionId,patch){await provider.updateExecution(executionId,patch);await store.upsertSetting(detailKey(id),JSON.stringify({nodeExecutions:JSON.parse(patch.nodeExecutions)}),now());}}});}
    finally{clearTimeout(timer);controller.abort();}
    return {execution_id:id,status:String((await store.getExecution(id))?.status??'error'),message:'Execution recorded'};
}
export async function authoringExecution(store:Phase2Store,row:Record<string,unknown>){
    const parse=(value:unknown,fallback:unknown)=>{try{return JSON.parse(String(value));}catch{return fallback;}};
    const detail=parse(await store.getSetting(detailKey(String(row.id))),{}) as {nodeExecutions?:unknown[]};
    return {id:String(row.id),workflowId:String(row.workflow_id),workflowName:String((await store.getWorkflow(String(row.workflow_id)))?.name??''),status:row.status==='running'?'executing':row.status,triggerType:String(row.trigger),triggerPayload:parse(row.input,{}),result:parse(row.result,{}),error:row.error??undefined,nodeExecutions:detail.nodeExecutions??[],engineId:'system',engineName:'Local Edge',startedAt:row.started_at,endedAt:row.ended_at};
}
