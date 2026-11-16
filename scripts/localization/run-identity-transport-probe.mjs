/** Integration probe: by-resource identity resolution through the REAL PostgrestClient,
 * REAL adapter and REAL SQL against a disposable local fixture. Isolates the serving
 * Worker entirely. No credentials, no owner destination. */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {supabasePostgrestClient} from '../../packages/edge-infra/dist/providers/supabase-http.js';
import {PostgrestTranslationJobPersistence} from '../../packages/translation/dist/adapters/postgrest.js';
import {translationUnitIdForScope} from '../../packages/translation/dist/identity.js';

const root=await realpath(process.cwd()),output=resolve(process.argv[2]??'');
assert.ok(process.argv[2]&&relative(root,output).startsWith('..'),'new external private output directory required');
await mkdir(output);
const context=execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8',windowsHide:true}).trim();
assert.match(context,/^(npipe:|unix:)/,'local Docker context required');
const marker='identity-transport-'+randomUUID(),prefix='frontbase-transport-'+randomBytes(5).toString('hex'),network=prefix,pg=prefix+'-db',rest=prefix+'-api';
const pgPassword=randomBytes(24).toString('hex'),apiPassword=randomBytes(24).toString('hex'),jwtSecret=randomBytes(24).toString('hex');
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const data=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',exp:Math.floor(Date.now()/1000)+3600});const jwt=data+'.'+createHmac('sha256',jwtSecret).update(data).digest('base64url');
const redact=value=>[pgPassword,apiPassword,jwtSecret,jwt].reduce((s,key)=>s.replaceAll(key,'[redacted]'),String(value));
const docker=(args,input)=>{try{return execFileSync('docker',args,{encoding:'utf8',input,windowsHide:true,timeout:120000,stdio:['pipe','pipe','pipe']});}catch(e){throw Error('docker_fixture_failed: '+redact(e.stderr||e.message).slice(-1500));}};
const sql=content=>docker(['exec','-i',pg,'psql','-U','postgres','-d','postgres','-X','-q','-t','-v','ON_ERROR_STOP=1'],content);
const sqlRetry=async content=>{let last;for(let n=0;n<10;n++){try{return sql(content);}catch(e){last=e;await new Promise(r=>setTimeout(r,2000));}}throw last;};
const created=[];let netCreated=false;let passed=false;
const SCOPE={tenantId:'tenant-probe',projectId:'project-probe'};
try{
 docker(['network','create','--label','frontbase.test='+marker,network]);netCreated=true;
 await writeFile(join(output,'postgres.env'),'POSTGRES_PASSWORD='+pgPassword+'\n');
 docker(['run','-d','--name',pg,'--label','frontbase.test='+marker,'--network',network,'--network-alias','db','--tmpfs','/var/lib/postgresql/data','--env-file',join(output,'postgres.env'),'postgres:17.11-alpine']);created.push(pg);
 let ready=false;for(let n=0;n<60;n++){try{docker(['exec',pg,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready,'disposable postgres ready');
 await sqlRetry("CREATE ROLE service_role NOLOGIN NOBYPASSRLS; CREATE ROLE anon NOLOGIN NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS; CREATE ROLE pgrst LOGIN NOINHERIT PASSWORD '"+apiPassword+"'; GRANT service_role,anon TO pgrst; GRANT service_role,anon TO pgrst;");
 await sqlRetry(await readFile(join(root,'packages/translation/sql/postgrest-v1.sql'),'utf8'));
 await sqlRetry(await readFile(join(root,'packages/translation/sql/postgrest-read-batch-v2.sql'),'utf8'));
 await writeFile(join(output,'api.env'),['PGRST_DB_URI=postgres://pgrst:'+apiPassword+'@db:5432/postgres','PGRST_DB_SCHEMAS=translations','PGRST_DB_ANON_ROLE=anon','PGRST_JWT_SECRET='+jwtSecret].join('\n')+'\n');
 docker(['run','-d','--name',rest,'--label','frontbase.test='+marker,'--network',network,'--env-file',join(output,'api.env'),'-p','127.0.0.1::3000','postgrest/postgrest:v14.18']);created.push(rest);
 const port=docker(['port',rest,'3000/tcp']).trim().split(':').at(-1);
 const endpoint='http://127.0.0.1:'+port;
 let rpcOk=false;for(let n=0;n<40&&!rpcOk;n++){try{const probe=await fetch(endpoint+'/rpc/translation_read_batch',{method:'POST',headers:{authorization:'Bearer '+jwt,'content-type':'application/json','content-profile':'translations'},body:JSON.stringify({p_operation:'read-many',p_scope:SCOPE,p_input:{unitIds:['a'.repeat(64)],locale:null}})});if(probe.ok)rpcOk=true;else if(n>=39)console.log('probe status',probe.status,redact(await probe.text()));}catch{}if(!rpcOk)await new Promise(r=>setTimeout(r,1500));}
 assert.ok(rpcOk,'PostgREST reachable with the seeded RPC');

 // Seed one unit with a record-resource source plus an approved Arabic head.
 const recordResource={kind:'record',connectionId:'ds-fixture',collection:'programs',key:[{column:'id',value:42}],propertyPath:['title']};
 const unitId=await translationUnitIdForScope(SCOPE)(recordResource),fingerprint='c'.repeat(64);
 sql(`BEGIN;
 INSERT INTO translations.units (tenant_id,project_id,unit_id,version,source) VALUES ('${SCOPE.tenantId}','${SCOPE.projectId}','${unitId}',1,
   '{"unit":{"scope":{"tenantId":"${SCOPE.tenantId}","projectId":"${SCOPE.projectId}"},"resource":{"kind":"record","connectionId":"ds-fixture","collection":"programs","key":[{"column":"id","value":42}],"propertyPath":["title"]},"sourceLocale":"en","format":"plain","text":"Original title","segmenterVersion":1,"placeholders":[]},"sourceVersion":1,"fingerprint":"${fingerprint}","context":{},"contextFingerprint":"${'d'.repeat(64)}"}'::jsonb);
 INSERT INTO translations.revisions (tenant_id,project_id,unit_id,locale,revision_id,revision) VALUES ('${SCOPE.tenantId}','${SCOPE.projectId}','${unitId}','ar','rev-1',
   '{"version":1,"scope":{"tenantId":"${SCOPE.tenantId}","projectId":"${SCOPE.projectId}"},"unitId":"${unitId}","revisionId":"rev-1","locale":"ar","sourceFingerprint":"${fingerprint}","text":"العنوان المترجم","provenance":"manual","expectedHead":null,"sourceVersion":1,"contextFingerprint":"${'d'.repeat(64)}"}'::jsonb);
 INSERT INTO translations.heads (tenant_id,project_id,unit_id,locale,revision_id) VALUES ('${SCOPE.tenantId}','${SCOPE.projectId}','${unitId}','ar','rev-1');
 COMMIT;`);

 const client=supabasePostgrestClient({url:endpoint,restUrl:endpoint,serviceKey:jwt,schema:'translations'});
 // Mirror of the edge-infra transport hooks (edge-infra/src/translation.ts) against the local HTTP endpoint.
 const errors=[];
 const transport={
  async resolveByResources(scope,input){
   const {data,error}=await client.rpc('translation_read_batch',{p_operation:'read-unit-ids-by-resource',p_scope:scope,p_input:input});
   if(error){errors.push({code:error.code,message:error.message,details:error.details,hint:error.hint});console.log('RPC ERROR:',JSON.stringify({code:error.code,message:error.message,details:error.details,hint:error.hint}));}
   if(error?.code==='22023'&&error.message==='invalid_translation_operation')return undefined;
   if(error)throw Error('translation_rpc_failed');
   return data;
  },
  async readCurrent(scope,input){
   const {data,error}=await client.rpc('translation_read_batch',{p_operation:'read-current-many',p_scope:scope,p_input:input});
   if(error?.code==='22023'&&error.message==='invalid_translation_operation')return undefined;
   if(error)throw Error('translation_rpc_failed');
   return data;
  },
  call:async()=>{throw Error('not used by these paths');},
 };
 const store=new PostgrestTranslationJobPersistence(transport);
 const resources=[recordResource,
  {kind:'component',documentId:'app-menus',blockId:'menu-uuid',versionId:'default',propertyPath:['header','items','0','label']},
 ];
 const ids=await store.resolveUnitIdsByResources(SCOPE,resources);
 console.log('resolved ids',JSON.stringify(ids));
 assert.equal(ids[0],unitId,'record resource resolves to the seeded unit id');
 assert.match(ids[1],/^[a-f0-9]{64}$/,'component resource resolves to a digest');
 const heads=await store.readCurrentHeads(SCOPE,ids,'ar');
 assert.equal(heads.get(unitId)?.head?.text,'العنوان المترجم','seeded Arabic head returned through the full adapter path');
 console.log('heads read OK; transport errors observed:',JSON.stringify(errors));
 passed=true;
}catch(e){
 console.error('PROBE FAILED:',redact(String(e?.stack??e)));
}finally{
 const cleanup=[];for(const name of created.reverse()){docker(['rm','-f',name]);cleanup.push(name);}
 if(netCreated)docker(['network','rm',network]);
 await writeFile(join(output,'result.json'),JSON.stringify({passed,records:[],cleanupComplete:cleanup.length===2},null,2)+'\n');
 console.log('cleanup complete',cleanup.length);
}
if(!passed)process.exit(1);
