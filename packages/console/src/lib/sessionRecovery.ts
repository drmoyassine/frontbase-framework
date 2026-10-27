export type RecoveryIdentity={id:string;tenant:string;role:string};
export type SessionProbe={status:'authenticated';identity:RecoveryIdentity;user:unknown;tenant:unknown;token?:string|null}|{status:'unauthenticated'}|{status:'unknown'};
export type RecoveryState={status:'idle'|'checking'|'expired'|'account-changed';message:string};
export function safeAdminReturn(value:unknown):string {
    if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/.test(value))return '/dashboard';
    const path=value.split(/[?#]/,1)[0]!;
    if(/^\/(?:login|signup|forgot-password|reset-password|embed)(?:\/|$)/.test(path))return '/dashboard';
    return value;
}
export function recoveryIdentity(user:any,tenant:any):RecoveryIdentity|null {
    if(!user||typeof user.id!=='string'||!user.id)return null;
    return {id:user.id,tenant:String(tenant?.id??user.tenant_slug??user.tenant_id??''),role:String(user.role??'')};
}
/** App initialization must neither clear drafts on expiry nor reload over them after recovery. */
export class SessionDataGate {
    private retaining=false;
    decide(authenticated:boolean,status:RecoveryState['status']):'hold'|'load'|'clear'{
        if(status!=='idle'){this.retaining=true;return 'hold';}
        if(this.retaining){if(authenticated)this.retaining=false;return 'hold';}
        return authenticated?'load':'clear';
    }
}
export class SessionRecoveryController {
    private state:RecoveryState={status:'idle',message:''};private listeners=new Set<()=>void>();private pending:Promise<boolean>|null=null;private expected:RecoveryIdentity|null=null;
    constructor(private deps:{identity:()=>RecoveryIdentity|null;probe:()=>Promise<SessionProbe>;invalid:()=>void;recovered:(probe:Extract<SessionProbe,{status:'authenticated'}>)=>void}){}
    snapshot=()=>this.state;
    subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
    private publish(status:RecoveryState['status'],message=''){this.state={status,message};this.listeners.forEach(listener=>listener());}
    report=():Promise<boolean>=>{
        if(this.pending)return this.pending;
        if(this.state.status!=='idle')return Promise.resolve(true);
        this.expected=this.deps.identity();if(!this.expected)return Promise.resolve(false);
        this.pending=this.check(false).finally(()=>{this.pending=null;});return this.pending;
    };
    retry=():Promise<boolean>=>{
        if(this.pending)return this.pending;
        if(this.state.status==='idle')return Promise.resolve(false);
        this.pending=this.check(true).finally(()=>{this.pending=null;});return this.pending;
    };
    private async check(resuming:boolean):Promise<boolean>{
        this.publish('checking');let result:SessionProbe;
        try{result=await this.deps.probe();}catch{result={status:'unknown'};}
        if(result.status==='unknown'){this.publish(resuming?'expired':'idle','Could not check your session. Check your connection and try again.');return resuming;}
        if(result.status==='unauthenticated'){this.publish('expired','Your session has ended. Sign in again to continue.');this.deps.invalid();return true;}
        if(!this.expected||JSON.stringify(result.identity)!==JSON.stringify(this.expected)){
            this.publish('account-changed','This tab belongs to a different account, workspace or permission level. Sign in with the original account to recover this work.');this.deps.invalid();return true;
        }
        if(resuming)this.deps.recovered(result);
        this.publish('idle');return false;
    }
}
let controller:SessionRecoveryController|null=null;
const empty:RecoveryState={status:'idle',message:''};
export const recoverySnapshot=()=>controller?.snapshot()??empty;
export const subscribeRecovery=(listener:()=>void)=>controller?.subscribe(listener)??(()=>{});
export function configureSessionRecovery(value:SessionRecoveryController){controller=value;}
export const retrySession=()=>controller?.retry();
export function isProtectedAdminRequest(url:unknown):boolean {
    if(typeof window==='undefined'||!/^\/(?:frontbase-admin|admin)(?:\/|$)/.test(window.location.pathname)||/\/(?:login|signup|forgot-password|reset-password)(?:\/|$)/.test(window.location.pathname))return false;
    let target:URL;try{target=new URL(String(url),window.location.origin);}catch{return false;}
    return target.origin===window.location.origin&&target.pathname.startsWith('/api/')&&(!target.pathname.startsWith('/api/auth/')||target.pathname==='/api/auth/me');
}
export function assertAdminSessionRequest(url:unknown):void {
    // Keep auth/me available for explicit revalidation, but stop background reads/writes under a new identity.
    let path='';try{path=new URL(String(url),window.location.origin).pathname;}catch{return;}
    if(path==='/api/auth/me')return;
    if(recoverySnapshot().status!=='idle'&&isProtectedAdminRequest(url)){const error=Object.assign(new Error('Sign in again to continue. Your unsaved work is retained.'),{sessionRecoveryHandled:true});throw error;}
}
export async function handleAdminUnauthorized(url:unknown,status:unknown):Promise<boolean>{
    if(status!==401||!controller||!isProtectedAdminRequest(url))return false;
    return controller.report();
}
export function isSessionRecoveryFailure(error:any):boolean{return error?.sessionRecoveryHandled===true;}
