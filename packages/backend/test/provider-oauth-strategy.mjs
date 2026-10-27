import assert from 'node:assert/strict';const {BearerTokenStrategy}=await import(process.env.FRONTBASE_OAUTH_STRATEGY_TEST_MODULE??'../dist/compat/routes/edge-providers/strategies/bearer.js');
for(const provider of ['cloudflare','vercel']){
 const account=provider==='cloudflare'?'a'.repeat(32):'team_fixture';let calls=0,response;
 const strategy=new BearerTokenStrategy(provider,{endpoint:'https://api.example/legacy-token-check',tokenKeys:['api_token']},async(url,init)=>{calls++;assert.equal(String(url),provider==='cloudflare'?'https://api.cloudflare.com/client/v4/accounts/'+account:'https://api.vercel.com/v2/teams/'+account);assert.equal(init.headers.Authorization,'Bearer fixture-sensitive');assert.equal(init.redirect,'manual');return response;});
 const config={api_token:'fixture-sensitive',access_token:'fixture-sensitive',account_id:account,oauth:{provider,expires_at:Date.now()+3600000}};
 response=Response.json(provider==='cloudflare'?{success:true,result:{id:account}}:{id:account});assert.equal((await strategy.test(config)).success,true);
 response=Response.json(provider==='cloudflare'?{success:true,result:{id:'other'}}:{id:'other'});assert.equal((await strategy.test(config)).success,false);
 response=Response.json({error:'fixture-sensitive'}, {status:403});const refused=await strategy.test(config);assert.equal(refused.success,false);assert.ok(!JSON.stringify(refused).includes('fixture-sensitive'));
 const before=calls;assert.equal((await strategy.test({...config,oauth:{...config.oauth,expires_at:Date.now()-1}})).success,false);assert.equal((await strategy.test({...config,account_id:'../attacker'})).success,false);assert.equal((await strategy.test({...config,oauth:{...config.oauth,provider:'other'}})).success,false);assert.equal(calls,before);
 response=Response.json({success:true,result:{id:account},id:account,padding:'x'.repeat(1048577)});assert.equal((await strategy.test(config)).success,false);
}
let manual=0;const strategy=new BearerTokenStrategy('cloudflare',{endpoint:'https://api.example/manual',tokenKeys:['api_token']},async(url)=>{assert.equal(String(url),'https://api.example/manual');manual++;return Response.json({success:true});});assert.equal((await strategy.test({api_token:'manual-fixture'})).success,true);assert.equal(manual,1);
console.log('PASS retained CF/Vercel OAuth management verification, account/expiry/input/size fences, opaque refusal and unchanged manual-token path');
