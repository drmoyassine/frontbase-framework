/** Node-only HTTPS egress. Import this subpath only from Node hosts, never an edge/client entry.
 * Undici retains HTTP/TLS/streaming semantics; its connection lookup pins only public addresses.
 * Injection is trusted host/test configuration, never a datasource/browser option. */
import {lookup as systemLookup} from 'node:dns/promises';
import {isIP,type LookupFunction} from 'node:net';
import {Agent,fetch as httpFetch,type Dispatcher,type RequestInit as HttpRequestInit} from 'undici';

export interface ResolvedAddress{address:string;family:number}
export type AddressResolver=(hostname:string)=>Promise<readonly ResolvedAddress[]>;
export function isPublicAddress(address:string):boolean{
    const family=isIP(address);
    if(family===4){const [a,b,c]=address.split('.').map(Number) as [number,number,number,number];
        return !(a===0||a===10||a===127||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===0&&(c===0||c===2)||b===168||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113||a>=224);
    }
    if(family===6){const [first,second]=address.toLowerCase().split(':').map(part=>parseInt(part||'0',16));
        // Global unicast only; exclude protocol/tunneling and documentation ranges.
        return first!==undefined&&first>=0x2000&&first<=0x3fff&&first!==0x2002&&!(first===0x2001&&(second===undefined||second<=0x1ff||second===0xdb8));
    }
    return false;
}
export function publicAddressLookup(resolve:AddressResolver=hostname=>systemLookup(hostname,{all:true,verbatim:true})):LookupFunction{
    return (hostname,options,callback)=>{
        void Promise.resolve().then(()=>resolve(hostname)).then(addresses=>{
            if(!Array.isArray(addresses)||!addresses.length||addresses.length>64||addresses.some(entry=>!entry||typeof entry.address!=='string'||![4,6].includes(entry.family)||isIP(entry.address)!==entry.family||!isPublicAddress(entry.address))){callback(Error('provider_dns_rejected'),'');return;}
            const pinned=[...addresses].sort((a,b)=>a.family-b.family);
            if(options.all)callback(null,pinned);else callback(null,pinned[0]!.address,pinned[0]!.family);
        },()=>callback(Error('provider_dns_rejected'),''));
    };
}
function destination(raw:string):URL{
    let url:URL;try{url=new URL(raw);}catch{throw Error('provider_url_rejected');}
    const host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
    if(url.protocol!=='https:'||url.username||url.password||!host||host==='localhost'||/\.(?:localhost|local|internal)$/.test(host)||isIP(host)&&!isPublicAddress(host))throw Error('provider_url_rejected');
    return url;
}
export interface NodeHttpOptions{
    resolve?:AddressResolver;
    /** Trusted deterministic test/platform seam. A real dispatcher must retain this lookup. */
    createDispatcher?:(lookup:LookupFunction)=>Dispatcher;
}
export type NodeHttpTransport=((input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>)&{close():Promise<void>};
export function createNodeHttpTransport(options:NodeHttpOptions={}):NodeHttpTransport{
    const lookup=publicAddressLookup(options.resolve),dispatcher=options.createDispatcher?.(lookup)??new Agent({connect:{lookup,autoSelectFamily:true},maxOrigins:128});
    const doFetch=async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
        try{
            destination(input instanceof Request?input.url:String(input));
            const request=new Request(input,init);destination(request.url);request.signal.throwIfAborted();
            const signal=AbortSignal.any([request.signal,AbortSignal.timeout(10000)]);
            const response=await httpFetch(request.url,{method:request.method,headers:[...request.headers],body:request.body as unknown as HttpRequestInit['body'],duplex:'half',redirect:'manual',signal,dispatcher});
            const headers=new Headers();for(const[key,value]of response.headers)headers.append(key,value);
            return new Response(response.body as unknown as BodyInit|null,{status:response.status,statusText:response.statusText,headers});
        }catch(error){
            let value:unknown=error;for(let depth=0;value instanceof Error&&depth<8;depth++,value=value.cause){if(value.message==='provider_dns_rejected'||value.message==='provider_url_rejected')throw Error(value.message);}
            throw Error('provider_node_http_failed');
        }
    };
    return Object.assign(doFetch,{close:()=>dispatcher.close()});
}
