import {it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({create:vi.fn(()=>({auth:{}}))}));
vi.mock('@supabase/supabase-js',()=>({createClient:mock.create}));
import {createAppUserClient,syncAppUserSession,safeAppRedirect} from './app-user-session';
it('uses the configured visitor provider and an isolated SDK storage namespace',()=>{
 const provider={type:'supabase',url:'https://auth.example.com',publicKey:'sb_publishable_PUBLIC',binding:'a'.repeat(64)};
 createAppUserClient(provider);expect(mock.create).toHaveBeenLastCalledWith(provider.url,provider.publicKey,{auth:{storageKey:'frontbase-app-user:'+provider.binding,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 expect(()=>createAppUserClient({...provider,publicKey:'sb_secret_PRIVATE'})).toThrow();expect(()=>createAppUserClient({...provider,url:'https://user:password@auth.example.com'})).toThrow();expect(()=>createAppUserClient({...provider,type:'unsupported'})).toThrow();
});
it('serializes verified-token bridge calls and clears only the separate visitor session',async()=>{
 const calls:any[]=[];let release!:()=>void;const first=new Promise<void>(resolve=>{release=resolve;});
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>{calls.push({url,init});if(calls.length===1)await first;return new Response('{}',{status:200});}));
 const login=syncAppUserSession('VISITOR_TOKEN'),logout=syncAppUserSession(null);await Promise.resolve();await Promise.resolve();expect(calls.length).toBe(1);release();await Promise.all([login,logout]);
 expect(calls[0]).toEqual({url:'/api/app-users/session/',init:{method:'POST',credentials:'same-origin',headers:{Authorization:'Bearer VISITOR_TOKEN'}}});expect(calls[1]).toEqual({url:'/api/app-users/session/',init:{method:'DELETE',credentials:'same-origin'}});vi.unstubAllGlobals();
});
it('recovers after a failed bridge and refuses external/admin redirect targets',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('{}',{status:401})).mockResolvedValueOnce(new Response('{}',{status:200})));
 await expect(syncAppUserSession('invalid')).rejects.toThrow('could not be confirmed');await expect(syncAppUserSession('valid')).resolves.toBeUndefined();vi.unstubAllGlobals();
 for(const path of ['https://other.test','//other.test/','/%2fother.test/','/frontbase-admin/pages','/api/project/','/\\other.test/'])expect(safeAppRedirect(path)).toBe('/');expect(safeAppRedirect('/portal/?tab=profile')).toBe('/portal/?tab=profile');
});
