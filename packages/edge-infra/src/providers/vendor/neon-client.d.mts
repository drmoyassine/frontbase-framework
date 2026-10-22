/** Internal surface staged by stage-neon-client.mjs, not an upstream/public SDK API. */
export interface NeonFullResult {rows:Record<string,unknown>[];rowCount:number|null;command:string}
export interface NeonClient {query(sql:string,params?:unknown[]):Promise<NeonFullResult>}
export function neon(connectionString:string,options:{fullResults:true;arrayMode:false;fetchImpl?:(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;fetchOptions?:RequestInit}):NeonClient;
