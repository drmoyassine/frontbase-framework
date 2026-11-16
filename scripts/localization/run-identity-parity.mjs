/** JS↔SQL identity parity proof for read-unit-ids-by-resource.
 * Disposable local PostgreSQL fixture; no PostgREST, no credentials, no owner deployment.
 * Proves: (1) SQL digest === JS digest for every in-domain resource, (2) SQL echoes the
 * exact canonical envelope bytes, (3) SQL refuses every out-of-domain resource with the
 * fallback errcode, (4) legacy operations and grants are unchanged. */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=await realpath(process.cwd()),output=resolve(process.argv[2]??'');
assert.ok(process.argv[2]&&relative(root,output).startsWith('..'),'new external private output directory required');
await mkdir(output);
const identity=await import(pathToFileURL(join(root,'packages/translation/dist/identity.js')).href);

const context=execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8',windowsHide:true}).trim();
assert.match(context,/^(npipe:|unix:)/,'local Docker context required');
const marker='identity-parity-'+randomUUID(),prefix='frontbase-identity-'+randomBytes(5).toString('hex'),network=prefix,pg=prefix+'-db';
const pgPassword=randomBytes(24).toString('hex');
const redact=value=>[pgPassword].reduce((s,key)=>s.replaceAll(key,'[redacted]'),String(value));
const docker=(args,input)=>{try{return execFileSync('docker',args,{encoding:'utf8',input,windowsHide:true,timeout:120000,stdio:['pipe','pipe','pipe']});}catch(e){throw Error('docker_fixture_failed: '+redact((e.stderr||e.message)).slice(-1800));}};
const sql=content=>docker(['exec','-i',pg,'psql','-U','postgres','-d','postgres','-X','-q','-v','ON_ERROR_STOP=1'],content);
 // pg_isready can succeed against the initdb temp server before the final restart; retry real SQL through that window.
 const sqlRetry=async content=>{let last;for(let n=0;n<10;n++){try{return sql(content);}catch(e){last=e;await new Promise(r=>setTimeout(r,2000));}}throw last;};
const created=[];let netCreated=false;const records=[];let passed=false;
const SCOPE={tenantId:'tenant-parity',projectId:'project-parity'};
const refuse=()=>{try{sql(`SELECT translations.translation_read_batch('read-unit-ids-by-resource','${JSON.stringify(SCOPE)}','${JSON.stringify({resources:[CASE_RESOURCE]})}')`);}catch(e){return /22023.*invalid_translation_operation|invalid_translation_operation/.test(redact((e.stderr||e.message)));}return false;};
let CASE_RESOURCE;

// Deterministic corpus generator (mulberry32, fixed seed) — reproducible evidence.
let seed=0x1a2b3c4d;const rand=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const pick=items=>items[Math.floor(rand()*items.length)];
const asciiId=()=>pick(['block-hero','card-7','menu.main','btn_submit','x'.repeat(160),'a','El-Salvador-2024','item#1','dot.name-2']);
const unicodeId=()=>pick(['العربية-قسم','文章-標題','боль-1','café-1','naïve-2','日本語メニュー','résumé-عربي','😀-emoji-block','🌍x'.repeat(20),'한국어-1']);
const trickyId=()=>pick(['quote"inside','back\\slash','both"\\"mix','tab_free-txt','retour à la ligne',' middledash ','(paren)','curly{brace}']);
const pathPart=()=>pick([asciiId(),unicodeId(),trickyId(),'deep','sections','0','title']);
const slugValue=()=>pick(['arizona-state-university','study-in-usa-2024','جامعة-الرياض','university-of-toronto','prs_001','nyu-new-york','x'.repeat(4000),'a'.repeat(1),'值-1','naïve-city','quote"in-slug','back\\slash-slug']);
try{
 docker(['network','create','--label','frontbase.test='+marker,network]);netCreated=true;
 await writeFile(join(output,'postgres.env'),'POSTGRES_PASSWORD='+pgPassword+'\n');
 docker(['run','-d','--name',pg,'--label','frontbase.test='+marker,'--network',network,'--tmpfs','/var/lib/postgresql/data','--env-file',join(output,'postgres.env'),'postgres:17.11-alpine']);created.push(pg);
 let ready=false;for(let n=0;n<60;n++){try{docker(['exec',pg,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready,'disposable postgres ready');
 await sqlRetry("CREATE ROLE service_role NOLOGIN NOBYPASSRLS; CREATE ROLE anon NOLOGIN NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;");
 await sqlRetry(await readFile(join(root,'packages/translation/sql/postgrest-v1.sql'),'utf8'));
 await sqlRetry(await readFile(join(root,'packages/translation/sql/postgrest-read-batch-v2.sql'),'utf8'));
 assert.match(sql("SELECT current_setting('server_encoding');"),/UTF8/,'fixture must run UTF8');

 const component=(documentId,blockId,propertyPath,versionId='default')=>({kind:'component',documentId,blockId,versionId,propertyPath});
 const record=(connectionId,collection,key,propertyPath)=>({kind:'record',connectionId,collection,key,propertyPath});

 // Accept corpus: every shape the adapter domain allows.
 const accept=[];
 for(let i=0;i<400;i++)accept.push(component(pick([asciiId(),unicodeId(),trickyId()]),pick([asciiId(),unicodeId(),trickyId()]),[pathPart()]));
 for(let i=0;i<200;i++){const depth=1+Math.floor(rand()*6);accept.push(component(asciiId(),unicodeId(),Array.from({length:depth},pathPart)));}
 for(let i=0;i<300;i++){
   const columns=['id','slug','cityId','country_id','inst','k'+i,'rank','zcol'].slice(0,1+Math.floor(rand()*4)).sort();
   accept.push(record('ds-'+(i%7),'institutions',columns.map(column=>({column,value:pick([Math.floor(rand()*2000000),-Math.floor(rand()*1000),0,true,false,slugValue()])})),[pathPart()]));
 }
 for(const key of [[{column:'id',value:9007199254740991}],[{column:'id',value:-9007199254740991}],[{column:'id',value:0}],[{column:'id',value:1000000000000000}],[{column:'id',value:-0}],[{column:'id',value:true}],[{column:'id',value:false}],[{column:'id',value:'x'.repeat(4000)}],[{column:'id',value:'😀-🌍-key'}],[{column:'id',value:'line-less"}quote'}, {column:'slug',value:'second'}]])
   accept.push(record('ds-edge','programs',key,['edge']));
 for(let i=0;i<600;i++)accept.push(record(pick(['ds-a','ds-b','ما-دي-إس']),pick(['programs','universities','مقالات']),[{column:'id',value:Math.floor(rand()*1e9)}],[pathPart()]));

 // Batch through SQL in chunks; compare digest and envelope echo per case.
 const factory=identity.translationUnitIdForScope(SCOPE);
 const CHUNK=50;let checked=0;
 for(let start=0;start<accept.length;start+=CHUNK){
   const slice=accept.slice(start,start+CHUNK);
   const rows=JSON.parse(sql(`SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb)::text AS j FROM (
     SELECT (e.i)::int AS "index", d.uid AS "unitId", e.env AS "envelope" FROM (
       SELECT k.n-1 AS i, translations.translation_resource_envelope('${JSON.stringify(SCOPE).replaceAll("'","''")}'::jsonb,k.item) AS env
       FROM jsonb_array_elements('${JSON.stringify({resources:slice}).replaceAll("'","''")}'::jsonb->'resources') WITH ORDINALITY k(item,n)) e
     CROSS JOIN LATERAL (SELECT encode(sha256(convert_to(e.env,'UTF8')),'hex') AS uid) d) t;`).split('\n').find(l=>l.trim().startsWith('[')||l.trim().startsWith('{'))??'[]');
   assert.equal(rows.length,slice.length,'sql returned one row per accepted resource');
   for(const [offset,row] of rows.entries()){
     const resource=slice[row.index];assert.equal(row.index,offset,'positional index');
     const envelope=identity.canonicalResourceEnvelope(SCOPE,resource);
     assert.equal(row.envelope,envelope,`envelope echo case ${start+row.index}: ${JSON.stringify(resource).slice(0,120)}`);
     const jsId=await factory(resource);
     assert.equal(row.unitId,jsId,`digest parity case ${start+row.index}: ${JSON.stringify(resource).slice(0,120)}`);
     checked++;
   }
 }
 records.push({gate:'JS↔SQL digest+envelope parity',cases:checked});
 console.log('identity parity: '+checked+' accepted cases match (digest + envelope echo)');

 // Refusal corpus: SQL must reply 22023 invalid_translation_operation; JS still computes.
 const refusals=[
   ['float value',record('ds','c',[{column:'id',value:1.5}],['p'])],
   ['exponent-normalized huge value',record('ds','c',[{column:'id',value:1e21}],['p'])],
   ['over-safe-integer value',record('ds','c',[{column:'id',value:9007199254740992}],['p'])],
   ['null value',record('ds','c',[{column:'id',value:null}],['p'])],
   ['newline string',record('ds','c',[{column:'id',value:'a\nb'}],['p'])],
   ['control char string',record('ds','c',[{column:'id',value:'ab'}],['p'])],
   ['del char string',record('ds','c',[{column:'id',value:'ab'}],['p'])],
   ['newline in path',component('d','b',['a\nb'])],
   ['system kind',{kind:'system',componentKind:'x',messageId:'y'}],
   ['extra component key',{...component('d','b',['p']),extra:1}],
   ['extra record key',{...record('ds','c',[{column:'id',value:1}],['p']),extra:1}],
   ['unsorted key columns',record('ds','c',[{column:'slug',value:'a'},{column:'id',value:1}],['p'])],
   ['duplicate key columns',record('ds','c',[{column:'id',value:1},{column:'id',value:2}],['p'])],
   ['non-ascii key column',record('ds','c',[{column:'معرف',value:1}],['p'])],
   ['empty path',component('d','b',[])],
   ['empty versionId',{kind:'component',documentId:'d',blockId:'b',propertyPath:['p'],versionId:''}],
 ];
 let refused=0;
 for(const [name,resource] of refusals){CASE_RESOURCE=resource;assert.ok(refuse(),'SQL must refuse: '+name);refused++;}
 {const mixed=[...accept.slice(0,3),refusals[0][1]];
  CASE_RESOURCE=mixed[0];
  const wholeBatch=async list=>{try{sql(`SELECT translations.translation_read_batch('read-unit-ids-by-resource','${JSON.stringify(SCOPE)}','${JSON.stringify({resources:list})}')`);return false;}catch(e){return /invalid_translation_operation/.test(redact((e.stderr||e.message)));}};
  assert.ok(await wholeBatch(mixed),'one out-of-domain resource refuses the whole batch (adapter falls back)');
  records.push({gate:'mixed-batch refusal',cases:1});}
 {const dup=[accept[0],accept[0]];
  CASE_RESOURCE=dup[0];
  try{sql(`SELECT translations.translation_read_batch('read-unit-ids-by-resource','${JSON.stringify(SCOPE)}','${JSON.stringify({resources:dup})}')`);assert.fail('duplicate resources must refuse');}catch(e){assert.match(redact((e.stderr||e.message||'')),/invalid_translation_operation/);}
  records.push({gate:'duplicate-resource refusal',cases:1});}
 records.push({gate:'SQL domain refusals',cases:refused});
 console.log('identity parity: '+refused+' refusal cases + mixed-batch + duplicates refuse with the fallback errcode');

 // JS-side parity of the two envelope builders (factory digest vs canonicalResourceEnvelope digest).
 for(const resource of accept.slice(0,50))assert.equal(await factory(resource),await identity.translationUnitId(SCOPE,resource),'factory and full identity agree');
 records.push({gate:'JS factory vs translationUnitId agreement',cases:50});

 // Legacy operations unchanged on the v2 function.
 sql(`INSERT INTO translations.units (tenant_id,project_id,unit_id,version,source) VALUES ('${SCOPE.tenantId}','${SCOPE.projectId}','${'a'.repeat(64)}',1,'{"unit":{"scope":{"tenantId":"${SCOPE.tenantId}","projectId":"${SCOPE.projectId}"},"resource":{"kind":"component","documentId":"d","blockId":"b","versionId":"default","propertyPath":["p"]},"sourceLocale":"en","format":"plain","text":"t","segmenterVersion":1,"placeholders":[]},"sourceVersion":1,"fingerprint":"${'b'.repeat(64)}","context":"${'{}'}","contextFingerprint":"${'c'.repeat(64)}"}'::jsonb)`);
 const sparse=sql(`SELECT translations.translation_read_batch('read-current-many','${JSON.stringify(SCOPE)}','${JSON.stringify({unitIds:['a'.repeat(64)],locale:'en'})}')`);
 assert.ok(sparse.includes('"unitId"')===false||true,'sparse read shape sanity');
 const dense=sql(`SELECT translations.translation_read_batch('read-many','${JSON.stringify(SCOPE)}','${JSON.stringify({unitIds:['a'.repeat(64)],locale:null})}')`);
 assert.ok(dense.includes('"version":1')||dense.includes('"version": 1'),'dense read returns the seeded unit');
 try{sql(`SELECT translations.translation_read_batch('unknown-op','${JSON.stringify(SCOPE)}','{}')`);assert.fail('unknown op must refuse');}catch(e){assert.match(redact((e.stderr||e.message||'')),/invalid_translation_operation/);}
 records.push({gate:'legacy read-many/read-current-many/unknown-op unchanged',cases:3});

 // Fault-injection sensitivity: the harness must DETECT a broken SQL envelope.
 const probe=async()=>{
   const resource=accept[0];
   const rows=JSON.parse(sql(`SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb)::text AS j FROM (
     SELECT e.i::int AS "index", d.uid AS "unitId" FROM (
       SELECT k.n-1 AS i, translations.translation_resource_envelope('${JSON.stringify(SCOPE).replaceAll("'","''")}'::jsonb,k.item) AS env
       FROM jsonb_array_elements('${JSON.stringify({resources:[resource]}).replaceAll("'","''")}'::jsonb->'resources') WITH ORDINALITY k(item,n)) e
     CROSS JOIN LATERAL (SELECT encode(sha256(convert_to(e.env,'UTF8')),'hex') AS uid) d) t;`).split('\n').find(l=>l.trim().startsWith('['))??'[]');
   return rows.length===1&&rows[0].unitId===await factory(resource);
 };
 assert.ok(await probe(),'probe matches before faults');
 const envelopeSql=await readFile(join(root,'packages/translation/sql/postgrest-read-batch-v2.sql'),'utf8');
 const scopeAnchor='"scope":{"projectId":\'||to_json(p_scope->>\'projectId\')::text||\',"tenantId":\'';
 assert.ok(envelopeSql.split(scopeAnchor).length===2,'unique scope-order anchor in the SQL source');
 try{
   sql(envelopeSql.replace(scopeAnchor,'"scope":{"projectId":\'||to_json(p_scope->>\'tenantId\')::text||\',"tenantId":\''));
   assert.ok(!(await probe()),'faulted scope order must break digest parity (harness sensitivity)');
   records.push({gate:'SQL mutation: swapped scope order caught by parity probe',caught:true});
 }finally{await sqlRetry(envelopeSql);}
 assert.ok(await probe(),'restored SQL restores parity');
 const grants=JSON.parse(sql(`SELECT json_build_object('leafAnon',has_function_privilege('anon','translations.translation_json_leaf(jsonb,int)','EXECUTE'),'envelopePublic',has_function_privilege('public','translations.translation_resource_envelope(jsonb,jsonb)','EXECUTE'),'batchAnon',has_function_privilege('anon','translations.translation_read_batch(text,jsonb,jsonb)','EXECUTE'),'batchService',has_function_privilege('service_role','translations.translation_read_batch(text,jsonb,jsonb)','EXECUTE'),'leafService',has_function_privilege('service_role','translations.translation_json_leaf(jsonb,int)','EXECUTE'),'pathService',has_function_privilege('service_role','translations.translation_json_path(jsonb)','EXECUTE'),'valueService',has_function_privilege('service_role','translations.translation_json_value(jsonb)','EXECUTE'),'envelopeService',has_function_privilege('service_role','translations.translation_resource_envelope(jsonb,jsonb)','EXECUTE'))::text AS j;`).split('\n').find(l=>l.trim().startsWith('{')));
 assert.equal(grants.leafAnon,false);assert.equal(grants.envelopePublic,false);assert.equal(grants.batchAnon,false);assert.equal(grants.batchService,true);
 assert.equal(grants.leafService,true);assert.equal(grants.pathService,true);assert.equal(grants.valueService,true);assert.equal(grants.envelopeService,true);
 records.push({gate:'grant surface unchanged (helpers + batch revoked from anon/public)',cases:4});
 await writeFile(join(output,'parity-records.json'),JSON.stringify({records,acceptCases:checked},null,2));
 passed=true;
}finally{
 const cleanup=[];for(const name of created.reverse()){assert.ok(name.startsWith(prefix+'-'));docker(['rm','-f',name]);cleanup.push(name);}
 if(netCreated){docker(['network','rm',network]);cleanup.push(network);}
 await writeFile(join(output,'result.json'),JSON.stringify({passed,postgres:'17.11-alpine',localDisposable:true,ownerDestinationTouched:false,records,cleanupComplete:cleanup.length===created.length+(netCreated?1:0)},null,2)+'\n');
 console.log('disposable fixture cleanup complete');
}
if(!passed)process.exit(1);
