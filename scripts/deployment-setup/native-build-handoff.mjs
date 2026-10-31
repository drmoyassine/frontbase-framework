import {randomBytes} from 'node:crypto';

/** The build token must be persistent: copying a Wrangler login access token
 * without its refresh protocol would leave the installed account expiring. */
export function nativeBuildCredential(auth) {
  if(auth?.type!=='api_token'||typeof auth.token!=='string'||!auth.token||auth.token.length>4096)throw Error('native_build_api_token_required');
  return auth.token;
}

export const cloudflareBuildPermissions=Object.freeze([
  {path:'',permission:'Account Settings: Read'},
  {path:'/workers/scripts?per_page=1',permission:'Workers Scripts: Edit and Read'},
  {path:'/d1/database?per_page=1',permission:'D1: Edit and Read'},
  {path:'/storage/kv/namespaces?per_page=1',permission:'Workers KV Storage: Edit and Read'},
]);

/** Read probes do not prove write privileges. The existing claim/provisioning
 * path checks those operations and refuses without replay on an uncertain result. */
export async function verifyNativeBuildPermissions(account,read) {
  if(!/^[a-f0-9]{32}$/.test(account??''))throw Error('native_build_account_invalid');
  for(const probe of cloudflareBuildPermissions){
    let result;try{result=await read(probe.path);}catch{throw Error('native_build_permission_required: '+probe.permission);}
    if(probe.path===''&&result?.id!==account)throw Error('native_build_account_mismatch');
  }
}

/** No provider token enters metadata, stdout, a URL, or a generated source file.
 * `establish` is the existing server-only native claim hook. */
export async function handoffNativeBuildCredential(plan,auth,{read,establish,owner=randomBytes(32).toString('hex')}={}) {
  const token=nativeBuildCredential(auth),v=plan.vars;
  if(v?.FRONTBASE_BOOTSTRAP!=='native'||!/^[a-f0-9]{64}$/.test(owner))throw Error('native_build_handoff_refused');
  const account=v.FRONTBASE_NATIVE_ACCOUNT;
  await verifyNativeBuildPermissions(account,read);
  // Optional read capability is inspected server-side; no fake OAuth scopes and
  // no provider mutation. Normal API enforcement still checks operation-specific rights.
  const capabilities=[];try{await read('/vectorize/v2/indexes?per_page=1');capabilities.push('vectorize');}catch{/* no optional Vectorize access */}
  const result=await establish({target:{origin:v.FRONTBASE_NATIVE_PUBLIC_ORIGIN,host:'cloudflare',purpose:'install',account,project:v.FRONTBASE_NATIVE_PROJECT,installationId:v.FRONTBASE_INSTALLATION_ID},relayOrigin:v.FRONTBASE_NATIVE_RELAY_URL,buildOwner:owner},{provider:'cloudflare',accessToken:token,scopes:[],capabilities,accounts:[{id:account,name:'Cloudflare deployment account'}]});
  if(result?.returnPath!=='/frontbase-bootstrap/activation#claim='+owner)throw Error('native_build_handoff_unconfirmed');
  return new URL(result.returnPath,v.FRONTBASE_NATIVE_PUBLIC_ORIGIN).href;
}
