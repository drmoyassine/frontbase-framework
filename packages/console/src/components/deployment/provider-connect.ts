/** Shared browser protocol: only authorization URLs and public status cross this boundary. */
export interface ProviderConnectionStatus {
    providers:Array<{provider:'cloudflare'|'vercel';available:boolean}>;
    connections:Array<{id:string;provider:'cloudflare'|'vercel';label:string;accountId:string;reconnectRequired:boolean}>;
}
export async function readProviderConnections():Promise<ProviderConnectionStatus>{
    const response=await fetch('/api/provider-oauth/status',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw Error('provider_connection_unavailable');return response.json();
}
export async function connectProvider(provider:'cloudflare'|'vercel',returnPath:string,accountId?:string){
    const response=await fetch('/api/provider-oauth/'+provider+'/start',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({returnPath,...(accountId?{accountId}:{})})});
    if(!response.ok)throw Error('provider_connection_unavailable');
    const result=await response.json(),url=new URL(result.url);
    if(url.protocol!=='https:'||url.origin!==(provider==='cloudflare'?'https://dash.cloudflare.com':'https://vercel.com'))throw Error('provider_connection_unavailable');
    location.assign(url.href);
}
export function connectionOptions(status:ProviderConnectionStatus){
    return Object.fromEntries(status.providers.map(p=>{const connection=status.connections.find(c=>c.provider===p.provider&&!c.reconnectRequired);return [p.provider,{available:p.available,connected:!!connection,label:connection?.label,accountId:connection?.accountId}];}));
}
