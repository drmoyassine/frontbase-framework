import {it,expect,vi,afterEach} from 'vitest';
const fixtures=vi.hoisted(()=>({state:{user:{id:'owner',tenant_slug:'project',role:'owner'},tenant:null,isAuthenticated:true},invalid:vi.fn(),setState:vi.fn()}));
vi.mock('./auth/AuthClientFactory',()=>({getAuthClient:()=>({getToken:async()=>null})}));
vi.mock('@/stores/auth',()=>({useAuthStore:{getState:()=>({...fixtures.state,forceReauth:fixtures.invalid}),setState:fixtures.setState}}));
import {initializeSessionRecovery} from './sessionRecoveryFetch';
import {recoverySnapshot,retrySession} from './sessionRecovery';
afterEach(()=>vi.unstubAllGlobals());
it('covers native fetch, preserves the original denial body, blocks pending writes and resumes only on explicit revalidation',async()=>{
 Object.assign(window.location,{pathname:'/frontbase-admin/dashboard',search:'',hash:''});let signedIn=false;
 const fetcher=vi.fn(async(input:any)=>{const url=String(input);if(url==='/api/auth/me')return signedIn?Response.json({user:fixtures.state.user,tenant:null}):Response.json({detail:'Not authenticated'},{status:401});return Response.json({detail:'Authentication required'},{status:401});});
 vi.stubGlobal('fetch',fetcher);initializeSessionRecovery();const denied=await window.fetch('/api/pages/');expect(denied.status).toBe(401);expect(await denied.json()).toEqual({detail:'Authentication required'});expect(recoverySnapshot().status).toBe('expired');expect(fixtures.invalid).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(2);
 await expect(window.fetch('/api/pages/',{method:'POST',body:'draft'})).rejects.toMatchObject({sessionRecoveryHandled:true});expect(fetcher).toHaveBeenCalledTimes(2);
 signedIn=true;await retrySession();expect(recoverySnapshot().status).toBe('idle');expect(fixtures.setState).toHaveBeenCalledWith(expect.objectContaining({user:fixtures.state.user,isAuthenticated:true}));expect(fetcher).toHaveBeenCalledTimes(3);
});
