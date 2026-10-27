import {SessionRecoveryController,configureSessionRecovery,handleAdminUnauthorized,recoveryIdentity,assertAdminSessionRequest} from './sessionRecovery';
import {getAuthClient} from './auth/AuthClientFactory';
import {useAuthStore} from '@/stores/auth';
/** Observe same-origin admin failures only; never replay a request or consume its response body. */
export function initializeSessionRecovery(){
    const rawFetch=window.fetch.bind(window);
    configureSessionRecovery(new SessionRecoveryController({
        identity:()=>{const state=useAuthStore.getState();return recoveryIdentity(state.user,state.tenant);},
        probe:async()=>{
            const token=await getAuthClient().getToken();
            const response=await rawFetch('/api/auth/me',{credentials:'include',headers:token?{Authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(10000)});
            if(response.status===401)return {status:'unauthenticated'};
            if(!response.ok)return {status:'unknown'};
            const data=await response.json(),identity=recoveryIdentity(data.user,data.tenant);
            return identity?{status:'authenticated',identity,user:data.user,tenant:data.tenant??null,token}:{status:'unknown'};
        },
        invalid:()=>useAuthStore.getState().forceReauth(),
        recovered:probe=>{useAuthStore.setState({user:probe.user as any,tenant:probe.tenant as any,token:probe.token??null,isAuthenticated:true,isLoading:false,error:null});window.dispatchEvent(new Event('frontbase:session-recovered'));},
    }));
    window.fetch=async(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;assertAdminSessionRequest(url);const response=await rawFetch(input,init);await handleAdminUnauthorized(url,response.status);return response;};
}
