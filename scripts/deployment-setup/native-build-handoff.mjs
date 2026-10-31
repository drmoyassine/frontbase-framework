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

/** Upgrade only a recognized earlier build-token installation. Existing relay
 * configuration is never replaced. Only the new receiver verifier is secret;
 * inherited provider credentials and the session key remain untouched. */
export function nativeBuildReceiverSecrets(plan,settings,relay){
  const bindings=settings?.bindings??[],names=new Set(bindings.map(b=>b.name));
  if(plan.vars?.FRONTBASE_BOOTSTRAP!=='0'||names.has('FRONTBASE_OAUTH_RELAY_URL')||names.has('FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY')||!names.has('FRONTBASE_OAUTH_CONNECTIONS')||!names.has('FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN'))return;
  const origin=`https://${plan.name}.${new URL(plan.vars.FRONTBASE_PUBLIC_ORIGIN).hostname.split('.').slice(1,-2).join('.')}.workers.dev`;
  if(origin!==plan.vars.FRONTBASE_PUBLIC_ORIGIN||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(plan.vars.FRONTBASE_INSTALLATION_ID??'')||typeof relay!=='string'||new URL(relay).origin!==relay||!relay.startsWith('https://'))throw Error('native_receiver_upgrade_refused');
  return {FRONTBASE_OAUTH_RELAY_URL:relay,FRONTBASE_OAUTH_RELAY_TARGET:JSON.stringify({origin,host:'cloudflare',purpose:'connect'}),FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY:randomBytes(32).toString('base64url'),FRONTBASE_OAUTH_RELAY_ENROLL:'1'};
}

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
