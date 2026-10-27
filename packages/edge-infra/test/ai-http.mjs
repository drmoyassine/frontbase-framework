import assert from 'node:assert/strict';
import { httpTextInvoker, AIInvocationError } from '../dist/ai-http.js';
import { configuredAIChatExecutor, fullExecutorRegistry, aiChatExecutor } from '../dist/executors/ai.js';
globalThis.fetch=()=>{throw Error('RAW_FETCH_FORBIDDEN')};
let calls=[], reply, throwSecret=false;
const success=(extra={})=>({choices:[{finish_reason:'stop',message:{content:'مرحبا'}}],usage:{prompt_tokens:20,completion_tokens:5},...extra});
const transport=async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});if(throwSecret)throw Error('PRIVATE_PROVIDER_KEY');return reply??Response.json(success());};
const invoke=httpTextInvoker({baseUrl:'https://api.example.test/v1',apiKey:'PRIVATE_KEY'},transport);
const input={model:'chosen-model',messages:[{role:'user',content:'Hello'}],maxOutputTokens:100};
assert.deepEqual(await invoke(input),{text:'مرحبا',usage:{inputTokens:20,outputTokens:5}});
assert.equal(calls[0].url,'https://api.example.test/v1/chat/completions');assert.equal(calls[0].init.redirect,'manual');assert.equal(calls[0].init.headers.authorization,'Bearer PRIVATE_KEY');
assert.equal(calls[0].body.max_completion_tokens,100);assert.equal(calls[0].body.store,false);assert.equal(calls[0].body.stream,false);
for(const baseUrl of ['http://x.test','https://user:password@x.test','https://x.test?key=x','https://x.test#frag'])assert.throws(()=>httpTextInvoker({baseUrl,apiKey:'key'},transport),AIInvocationError);
let before=calls.length;for(const patch of [{model:''},{model:'evil\nmodel'},{maxOutputTokens:0},{maxOutputTokens:20000},{messages:[]},{messages:[{role:'tool',content:'x'}]},{messages:[{role:'user',content:'x'.repeat(140000)}]}])await assert.rejects(invoke({...input,...patch}),/ai_input/);assert.equal(calls.length,before);
for(const reason of ['length','tool_calls','content_filter',null]){reply=Response.json(success({choices:[{finish_reason:reason,message:{content:'partial'}}]}));await assert.rejects(invoke(input),/ai_incomplete/);}
for(const patch of [{choices:[]},{choices:[{finish_reason:'stop',message:{content:null}}]},{choices:[{finish_reason:'stop',message:{content:'x',refusal:'refused'}}]},{choices:[{finish_reason:'stop',message:{content:'x',tool_calls:[]}}]},{usage:{prompt_tokens:-1,completion_tokens:1}},{usage:{prompt_tokens:1,completion_tokens:101}}]){reply=Response.json(success(patch));await assert.rejects(invoke(input),AIInvocationError);}
reply=Response.json(success({usage:null}));assert.equal((await invoke(input)).usage,undefined);
reply=new Response('PRIVATE_PROVIDER_BODY',{status:429});before=calls.length;await assert.rejects(invoke(input),/ai_response/);assert.equal(calls.length,before+1,'no hidden retries');
reply=new Response('x'.repeat(524289));await assert.rejects(invoke(input),/ai_response/);
reply=new Response('bad json');await assert.rejects(invoke(input),/ai_transport/);
throwSecret=true;await assert.rejects(invoke(input),error=>error.message==='ai_transport'&&!error.message.includes('PRIVATE'));throwSecret=false;
const controller=new AbortController();controller.abort();before=calls.length;await assert.rejects(invoke({...input,signal:controller.signal}),/ai_timeout/);assert.equal(calls.length,before);
const aborting=httpTextInvoker({baseUrl:'https://api.example.test',apiKey:'key'},async(_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Error('private_abort')),{once:true})));
const abort=new AbortController();const pending=aborting({...input,signal:abort.signal});abort.abort();await assert.rejects(pending,/ai_timeout/);
reply=undefined;let ctxSeen;const resolve=async ctx=>{ctxSeen=ctx;return invoke;};
const node={id:'n',type:'ai.chat',inputs:[{name:'model',value:'chosen-model'},{name:'prompt',value:'Hello'},{name:'maxOutputTokens',value:100}]},ctx={tenantSlug:'alpha'};
assert.equal((await configuredAIChatExecutor(resolve).execute(node,{},ctx)).text,'مرحبا');assert.equal(ctxSeen,ctx);
assert.equal(fullExecutorRegistry().resolve('ai.chat'),aiChatExecutor);assert.equal((await fullExecutorRegistry(resolve).resolve('ai.chat').execute(node,{},ctx)).text,'مرحبا');
const router=httpTextInvoker({baseUrl:'https://openrouter.ai/api/v1',apiKey:'PRIVATE_ROUTER',protocol:'openrouter'},transport);
for(const model of ['vendor/text:free','openrouter/free','vendor/paid']){
 assert.equal((await router({...input,model})).text,'مرحبا');const body=calls.at(-1).body;
 assert.equal(body.max_tokens,100);assert.ok(!('max_completion_tokens' in body));assert.ok(!('store' in body));assert.equal(body.stream,false);
 assert.equal(body.provider.allow_fallbacks,false);assert.equal(body.provider.require_parameters,true);assert.equal(body.provider.data_collection,'deny');
 assert.deepEqual(body.provider.max_price,model==='vendor/paid'?undefined:{prompt:0,completion:0,request:0});
}
reply=new Response('PRIVATE_ROUTER_ERROR',{status:429});before=calls.length;await assert.rejects(router(input),/ai_response/);assert.equal(calls.length,before+1);
reply=Response.json(success({error:{message:'PRIVATE_ROUTER_ERROR'},choices:[]}));await assert.rejects(router(input),/ai_incomplete/);
console.log('ai-http PASS: bounded OpenAI/OpenRouter wire protocols, free pricing, routing policies, single-call cancellation/failure/usage gates and shared workflow invocation');
