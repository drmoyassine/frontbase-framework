import {client} from '@/lib/api-client';
import {isCloud} from '@/lib/edition';
import {useActiveProject} from '@/stores/useActiveProject';
/** Reuse console cookie/cloud Bearer/project routing; no parallel authentication client. */
export async function menuPublicationRequest(url:string,init:RequestInit={}):Promise<Response>{
    if(!url.startsWith('/api/project/menus/')&&!url.startsWith('/api/project/site-configuration/publication/'))throw Error('Invalid menus endpoint');
    const cloud=isCloud(),projectId=useActiveProject.getState().activeProjectId;
    const defaults=client.instance.defaults.transformRequest;
    const transforms=Array.isArray(defaults)?defaults:defaults?[defaults]:[];
    // Run after the existing async auth interceptor: a project switch while it
    // awaits a token must not redirect an already-started draft save elsewhere.
    const response=await client.instance.request<string>({url,method:init.method??'GET',data:init.body,signal:init.signal??undefined,headers:Object.fromEntries(new Headers(init.headers).entries()),responseType:'text',validateStatus:()=>true,transformRequest:[...transforms,function(data,headers){if(cloud){if(projectId)headers.set('X-Project-Id',projectId);else headers.delete('X-Project-Id');}return data;}]});
    return new Response(response.data,{status:response.status});
}
export function menuRequest(url:string,init:RequestInit={}):Promise<Response>{if(!url.startsWith('/api/project/menus/'))return Promise.reject(Error('Invalid menus endpoint'));return menuPublicationRequest(url,init);}
