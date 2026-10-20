import assert from 'node:assert/strict';
const { prepareVercelEnvironment, assertVercelTarget, updateVercelEnvironment, vercelDeploymentUrl, assertVercelIntegration, assertVercelPreviewHistory, assertVercelDeployment } = await import(process.env.FRONTBASE_VERCEL_POLICY_TEST_MODULE ?? new URL('./vercel-deployment-policy.mjs', import.meta.url).href);
const options = { firstInstall:true, now:0, random:()=>'generated-test-only' };
const fresh=prepareVercelEnvironment({},options);
assert.equal(fresh.SESSION_SECRET,'generated-test-only');
assert.equal(fresh.SETUP_EXPIRES_AT,'1970-01-01T00:30:00.000Z');
assert.equal(fresh.SETUP_TOKEN,'generated-test-only');
assert.deepEqual(prepareVercelEnvironment({APP_DB_URL:'https://state.example'},{redeploy:true}),{APP_DB_URL:'https://state.example'});
assert.throws(()=>prepareVercelEnvironment({}),/choose_first_install/);
assert.throws(()=>prepareVercelEnvironment({}, {firstInstall:true,redeploy:true}),/choose_first_install/);
assert.throws(()=>prepareVercelEnvironment({SESSION_SECRET:'fixture'},{redeploy:true}),/session_rotation/);
assert.equal(prepareVercelEnvironment({SESSION_SECRET:'fixture'},{redeploy:true,rotateSession:true}).SESSION_SECRET,'fixture');
for(const name of ['ADMIN_ROLE','ADMIN_EMAIL','SETUP_TOKEN','SETUP_EXPIRES_AT'])assert.throws(()=>prepareVercelEnvironment({[name]:'fixture'},{redeploy:true}));
assert.throws(()=>prepareVercelEnvironment({ADMIN_EMAIL:'test@example.invalid'},options),/admin_pair/);
assert.throws(()=>prepareVercelEnvironment({ADMIN_EMAIL:'test@example.invalid',ADMIN_PASSWORD:'fixture',SETUP_TOKEN:'fixture'},options),/exclusive/);
const seeded=prepareVercelEnvironment({ADMIN_EMAIL:'test@example.invalid',ADMIN_PASSWORD:'fixture'},options);
assert.ok(!('SETUP_TOKEN' in seeded));
const target={scope:'team_test',project:'test-project',link:{orgId:'team_test',projectId:'prj_test'},remote:{id:'prj_test',name:'test-project',accountId:'team_test'}};
assert.deepEqual(assertVercelTarget(target),{orgId:'team_test',projectId:'prj_test'});
for(const delta of [{scope:'other-slug'},{project:'bad name'},{link:{orgId:'team_other',projectId:'prj_test'}},{remote:{...target.remote,id:'prj_other'}},{remote:{...target.remote,name:'other-project'}},{remote:{...target.remote,accountId:'team_other'}}])assert.throws(()=>assertVercelTarget({...target,...delta}));
console.log('PASS deployment intent, session preservation/explicit rotation, setup XOR and exact target refusal');

const calls=[];
const run=(args,opts)=>{calls.push({args,opts});return {code:0};};
assert.throws(()=>updateVercelEnvironment(run,{...target,scope:'team_other'},{SESSION_SECRET:'fixture-secret'}));
assert.equal(calls.length,0,'mismatched target cannot write');
assert.deepEqual(updateVercelEnvironment(run,target,{APP_DB_URL:'https://state.example',APP_DB_AUTH_TOKEN:'fixture-secret',UNRELATED:'omit'}),['APP_DB_URL','APP_DB_AUTH_TOKEN']);
assert.equal(calls.length,2);
for(const call of calls){assert.ok(!call.args.includes('rm'));assert.ok(call.args.includes('--force'));assert.ok(call.args.includes('--sensitive'));assert.ok(!JSON.stringify(call.args).includes('fixture-secret'));assert.ok(call.args.includes(target.project));}
assert.equal(calls[1].opts.stdin,'fixture-secret');
let attempted=0;
assert.throws(()=>updateVercelEnvironment(()=>{attempted++;return {code:1,stderr:'must-not-echo-fixture-secret'};},target,{APP_DB_URL:'https://state.example',APP_DB_AUTH_TOKEN:'fixture-secret'}),/vercel_environment_update_failed/);
assert.equal(attempted,1,'no later writes after failure');
console.log('PASS fake CLI: target verification before writes, values only on stdin, no delete and stop on failure');

const preview=[];updateVercelEnvironment((args,opts)=>{preview.push({args,opts});return {code:0};},target,{SESSION_SECRET:'synthetic-private'},'preview');assert.ok(preview[0].args.includes('preview'));assert.ok(!preview[0].args.includes('production'));assert.throws(()=>updateVercelEnvironment(run,target,{},'wrong'));console.log('PASS explicit preview environment does not write production');

assert.equal(vercelDeploymentUrl('{"url":"https://profile-test.vercel.app", "state":"READY"}'),'https://profile-test.vercel.app');assert.equal(vercelDeploymentUrl('https://profile-test.vercel.app\n'),'https://profile-test.vercel.app');assert.throws(()=>vercelDeploymentUrl('https://profile-test.vercel.app.attacker.example'));console.log('PASS agent-mode JSON deployment URL punctuation regression');

const renewed=prepareVercelEnvironment({},{redeploy:true,setupLink:true,now:0,random:()=>'test-renewed'});assert.equal(renewed.SETUP_TOKEN,'test-renewed');assert.ok(!renewed.SESSION_SECRET);assert.equal(renewed.SETUP_EXPIRES_AT,'1970-01-01T00:30:00.000Z');console.log('PASS explicit setup-link renewal does not rotate the session secret');

const membership={id:'store_test',product:'Turso',projects:[{id:'prj_test',environments:['preview']}]},selection={resourceRef:'store_test',projectId:'prj_test',environment:'preview'};assertVercelIntegration(membership,selection);for(const change of [{resourceRef:'store_other'},{projectId:'prj_other'},{environment:'production'}])assert.throws(()=>assertVercelIntegration(membership,{...selection,...change}));assert.throws(()=>assertVercelIntegration({...membership,product:'Other'},selection));console.log('PASS selected integration identity, provider, project and environment refusal');

assert.throws(()=>assertVercelPreviewHistory({deployments:[]}),/first_preview/);assert.throws(()=>assertVercelPreviewHistory({}));assertVercelPreviewHistory({deployments:[{id:'dpl_existing'}]});
const actual={id:'dpl_test',name:'test-project',target:'preview',readyState:'READY',contextName:'test-team',url:'test-project-unique.vercel.app'},expected={project:'test-project',environment:'preview',teamSlug:'test-team'};assert.equal(assertVercelDeployment(actual,expected),'https://test-project-unique.vercel.app');for(const delta of [{target:'production'},{readyState:'BUILDING'},{name:'other-project'},{contextName:'other-team'},{id:'bad'},{url:'attacker.example'}])assert.throws(()=>assertVercelDeployment({...actual,...delta},expected));assert.equal(vercelDeploymentUrl(JSON.stringify({deployment:{url:'https://test-project-unique.vercel.app',productionUrl:'https://test-project.vercel.app'},next:[{command:'curl https://test-project.vercel.app'}]})),'https://test-project-unique.vercel.app');console.log('PASS first-project preview refusal and actual host target/readiness/project/team verification; canonical URL wins over aliases');
