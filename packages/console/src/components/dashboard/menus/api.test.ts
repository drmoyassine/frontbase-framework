import {describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({projectId:'project-a' as string|null,cloud:true,requests:[] as any[]}));
vi.mock('@/lib/edition',()=>({isCloud:()=>state.cloud}));
vi.mock('@/stores/useActiveProject',()=>({useActiveProject:{getState:()=>({activeProjectId:state.projectId})}}));
vi.mock('@/lib/api-client',()=>({client:{instance:{defaults:{transformRequest:[(data:any)=>data]},request:async(config:any)=>{state.requests.push(config);await Promise.resolve();const headers=new Map([['Authorization','Bearer EXISTING_AUTH'],['X-Project-Id',state.projectId]]);for(const transform of config.transformRequest)transform(config.data,headers);return{data:JSON.stringify({project:headers.get('X-Project-Id'),authorization:headers.get('Authorization')}),status:409};}}}}));
import {menuRequest} from './api';
describe('Menus console transport',()=>{
 it('locks a draft save to its original project across an async auth/project switch',async()=>{
  state.cloud=true;state.projectId='project-a';const pending=menuRequest('/api/project/menus/',{method:'PUT',body:'{"menus":[]}'});state.projectId='project-b';const response=await pending;
  expect(response.status).toBe(409);expect(await response.json()).toEqual({project:'project-a',authorization:'Bearer EXISTING_AUTH'});expect(state.requests.at(-1).data).toBe('{"menus":[]}');
 });
 it('removes a later project header when the original request had no project',async()=>{
  state.cloud=true;state.projectId=null;const pending=menuRequest('/api/project/menus/');state.projectId='project-b';expect(await(await pending).json()).toEqual({authorization:'Bearer EXISTING_AUTH'});
 });
 it('refuses endpoints outside the menus API',async()=>{await expect(menuRequest('https://other.test/')).rejects.toThrow('Invalid menus endpoint');});
});
