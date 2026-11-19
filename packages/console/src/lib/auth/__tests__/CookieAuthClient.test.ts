import {it,expect,vi,afterEach} from 'vitest';
vi.mock('@/stores/auth',()=>({useAuthStore:{subscribe:vi.fn(),getState:()=>({user:{id:'stale'},isAuthenticated:true}),setState:vi.fn()}}));
import {CookieAuthClient} from '../CookieAuthClient';
afterEach(()=>vi.unstubAllGlobals());
it('validates the HttpOnly cookie with the backend instead of trusting persisted state',async()=>{const fetcher=vi.fn(async()=>Response.json({detail:'Not authenticated'},{status:401}));vi.stubGlobal('fetch',fetcher);const client=new CookieAuthClient({apiBaseUrl:'',mode:'cookie'});await expect(client.getSession()).resolves.toMatchObject({isAuthenticated:false});expect(fetcher).toHaveBeenCalledWith('/api/auth/me',expect.objectContaining({credentials:'include'}));});
it('uses the verified identity, not the saved browser identity',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({user:{id:'verified',role:'owner'},tenant:null})));expect(await new CookieAuthClient({apiBaseUrl:'',mode:'cookie'}).getSession()).toMatchObject({user:{id:'verified'},isAuthenticated:true,token:null});});
it('does not interpret a network/server error or malformed response as definitive logout',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));await expect(new CookieAuthClient({apiBaseUrl:'',mode:'cookie'}).getSession()).rejects.toThrow('Could not verify');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({})));await expect(new CookieAuthClient({apiBaseUrl:'',mode:'cookie'}).getSession()).rejects.toThrow('Invalid session');});

it('surfaces the authenticator challenge and forwards the code on retry', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
        error: 'authenticator_required',
        detail: 'Enter the code from your authenticator app.',
    }, {status:403}));
    vi.stubGlobal('fetch',fetcher);
    const client = new CookieAuthClient({apiBaseUrl:'',mode:'cookie'});
    const credentials = {email:'owner@example.com',password:'fixture-password'};
    await expect(client.login(credentials)).resolves.toMatchObject({success:false,requiresAuthenticator:true});
    await client.login({...credentials,authenticatorCode:'123456'});
    expect(JSON.parse(String(fetcher.mock.lastCall?.[1]?.body ?? '{}'))).toMatchObject({authenticator_code:'123456'});
});
