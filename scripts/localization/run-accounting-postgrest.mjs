/** Reproducible disposable local PostgreSQL/PostgREST proof. No owner deployment/credential. */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
const root=await realpath(process.cwd()),output=resolve(process.argv[2]??'');assert.ok(process.argv[2]&&relative(root,output).startsWith('..'),'new external private output directory required');await mkdir(output);
const context=execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8',windowsHide:true}).trim();assert.match(context,/^(npipe:|unix:)/,'local Docker context required; never provision on a remote host');
const marker='accounting-'+randomUUID(),prefix='frontbase-accounting-'+randomBytes(5).toString('hex'),network=prefix,pg=prefix+'-db',rest=prefix+'-api';
const pgPassword=randomBytes(24).toString('hex'),apiPassword=randomBytes(24).toString('hex'),jwtSecret=randomBytes(32).toString('hex');
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const data=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',exp:Math.floor(Date.now()/1000)+3600});const jwt=data+'.'+createHmac('sha256',jwtSecret).update(data).digest('base64url');
const redact=value=>[pgPassword,apiPassword,jwtSecret,jwt].reduce((s,key)=>s.replaceAll(key,'[redacted]'),String(value));
const docker=(args,input)=>{try{return execFileSync('docker',args,{encoding:'utf8',input,windowsHide:true,timeout:120000,stdio:['pipe','pipe','pipe']});}catch(e){throw Error('docker_fixture_failed: '+redact(e.stderr??e.message).slice(-1800));}};
const sql=content=>docker(['exec','-i',pg,'psql','-U','postgres','-d','postgres','-X','-q','-v','ON_ERROR_STOP=1'],content);
const created=[];let netCreated=false,passed=false;const records=[];
async function run(mode){const receipt=join(output,mode+'-receipt.json');const r=spawnSync(process.execPath,[join(root,'packages/edge-infra/test/accounting-postgrest-live.mjs'),join(output,'fixture.json'),mode,receipt],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});await writeFile(join(output,mode+'.log'),redact((r.stdout??'')+(r.stderr??'')));assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;}
try{
 docker(['network','create','--label','frontbase.test='+marker,network]);netCreated=true;
 await writeFile(join(output,'postgres.env'),'POSTGRES_PASSWORD='+pgPassword+'\n');
 docker(['run','-d','--name',pg,'--label','frontbase.test='+marker,'--network',network,'--network-alias','db','--tmpfs','/var/lib/postgresql/data','--env-file',join(output,'postgres.env'),'postgres:17.11-alpine']);created.push(pg);
 let ready=false;for(let n=0;n<60;n++){try{docker(['exec',pg,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready,'disposable postgres ready');
 sql("CREATE ROLE service_role NOLOGIN NOBYPASSRLS; CREATE ROLE anon NOLOGIN NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS; CREATE ROLE pgrst LOGIN NOINHERIT PASSWORD '"+apiPassword+"'; GRANT service_role,anon TO pgrst;");
 const base=await readFile(join(root,'packages/translation/sql/postgrest-v1.sql'),'utf8'),addon=await readFile(join(root,'packages/translation/sql/postgrest-accounting-v1.sql'),'utf8');sql(base);
 await writeFile(join(output,'api.env'),['PGRST_DB_URI=postgres://pgrst:'+apiPassword+'@db:5432/postgres','PGRST_DB_SCHEMAS=translations','PGRST_DB_ANON_ROLE=anon','PGRST_JWT_SECRET='+jwtSecret,'PGRST_DB_POOL=12'].join('\n')+'\n');
 docker(['run','-d','--name',rest,'--label','frontbase.test='+marker,'--network',network,'--env-file',join(output,'api.env'),'-p','127.0.0.1::3000','postgrest/postgrest:v14.18']);created.push(rest);
 const port=docker(['port',rest,'3000/tcp']).trim();assert.match(port,/^127\.0\.0\.1:[0-9]+$/);await writeFile(join(output,'fixture.json'),JSON.stringify({disposable:true,endpoint:'http://'+port,jwt}));
 let r=await run('legacy');assert.equal(r.status,0,redact(r.stderr));records.push({gate:'legacy accounting absent/v1 remains usable',exitCode:r.status});console.log('local PostgREST legacy capability gate PASS');
 sql(addon);
 sql("CREATE FUNCTION translations.fixture_abort_dispatch() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN IF NEW.job_id='rollback' AND NEW.body->>'state'='dispatched' THEN RAISE EXCEPTION 'fixture_abort_dispatch'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_abort_dispatch BEFORE UPDATE ON translations.attempts FOR EACH ROW EXECUTE FUNCTION translations.fixture_abort_dispatch();");
 r=await run('full');assert.equal(r.status,0,redact(r.stderr));records.push({gate:'shared actual HTTP accounting/rollback conformance',exitCode:r.status});console.log('local PostgreSQL/PostgREST shared conformance and rollback PASS');
 const faults=[['allowance upper bound',"v_used+(p_input->>'reservedUnits')::numeric>(v_budget->>'limitUnits')::numeric",'false'],['post-dispatch refund',"v_prior->>'state' NOT IN ('reserved','released')",'false'],['project transaction lock',"PERFORM pg_advisory_xact_lock(hashtextextended('fb-i18n-http-v1:'||p_scope::text,0));",'PERFORM pg_sleep(0);']];
 for(const [name,before,after] of faults){assert.equal(addon.split(before).length,2,'unique SQL fault anchor');let changed=addon.replace(before,after);if(name==='project transaction lock')changed=changed.replace("IF v_used+(p_input->>'reservedUnits')", "PERFORM pg_sleep(0.15); IF v_used+(p_input->>'reservedUnits')");
  try{sql(changed);const result=await run('race');assert.equal(result.status,1,name+' must fail');assert.match(result.stderr,/AssertionError/,name+' behavioral failure');records.push({gate:'SQL mutation: '+name,caught:true});console.log('SQL fault caught: '+name);}finally{sql(addon);}
 }
 r=await run('race');assert.equal(r.status,0,redact(r.stderr));records.push({gate:'restored SQL race gate',exitCode:0});
 sql('ALTER TABLE translations.accounting_protocol DROP CONSTRAINT accounting_protocol_version_check; UPDATE translations.accounting_protocol SET version=2;');
 try{assert.throws(()=>sql(addon),/unsupported_accounting_protocol/);records.push({gate:'unknown accounting installation refused',exitCode:0});}finally{sql('UPDATE translations.accounting_protocol SET version=1; ALTER TABLE translations.accounting_protocol ADD CONSTRAINT accounting_protocol_version_check CHECK(version=1);');}
 const security=JSON.parse(sql("SELECT json_build_object('publicObjects',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public'),'translationRls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='translations' AND c.relkind='r' AND c.relrowsecurity),'serviceBypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'),'anonExecute',has_function_privilege('anon','translations.translation_accounting_request(text,jsonb,jsonb)','EXECUTE'),'allowanceUpdate',has_table_privilege('service_role','translations.allowances','UPDATE'),'attemptDelete',has_table_privilege('service_role','translations.attempts','DELETE'));").split('\n').find(line=>line.trim().startsWith('{')));assert.equal(security.publicObjects,0);assert.equal(security.translationRls,9);assert.equal(security.serviceBypass,false);assert.equal(security.anonExecute,false);assert.equal(security.allowanceUpdate,false);assert.equal(security.attemptDelete,false);
 await writeFile(join(output,'security.json'),JSON.stringify(security,null,2));passed=true;
}finally{
 const cleanup=[];for(const name of created.reverse()){assert.ok(name.startsWith(prefix+'-'));const label=docker(['inspect','--format','{{index .Config.Labels "frontbase.test"}}',name]).trim();assert.equal(label,marker);docker(['rm','-f',name]);cleanup.push(name);}
 if(netCreated){const label=docker(['network','inspect','--format','{{index .Labels "frontbase.test"}}',network]).trim();assert.equal(label,marker);docker(['network','rm',network]);cleanup.push(network);}
 await writeFile(join(output,'result.json'),JSON.stringify({passed,postgres:'17.11-alpine',postgrest:'14.18',realPostgres:true,realPostgrest:true,localDisposable:true,ownerDestinationTouched:false,paidCalls:0,records,cleanupComplete:cleanup.length===3},null,2)+'\n');console.log('disposable fixture cleanup complete: '+cleanup.length+' owned resources');
}
