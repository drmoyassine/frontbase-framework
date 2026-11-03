import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

// The browser uses the real host handler, cookie middleware and bundled assets.
// Only the upstream provider APIs in the parent fixture are simulated.
export async function verifyInlineWizard(host,origin,env,target){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:550,height:400}});
  const seen=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let release;
  const hold=new Promise(resolve=>{release=resolve;});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin)return route.abort();
   seen.push([request.resourceType(),url.pathname]);
   if(url.pathname.endsWith('/api/claim'))await hold;
   const response=await host.fetch(new Request(url,{method:request.method(),headers:await request.allHeaders(),body:request.postDataBuffer()??undefined}));
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto(origin+'/frontbase-bootstrap/activation#claim='+env.FRONTBASE_BOOTSTRAP_TOKEN);
  const select=page.locator('select[data-role="state-db"]');
  await select.selectOption('libsql-http');
  await select.focus();
  const position=await page.evaluate(()=>window.scrollY);
  assert.equal(seen.some(([,path])=>path.endsWith('/api/form')),false);
  release();
  await page.waitForFunction(()=>!document.querySelector('#review').disabled,null,{timeout:15000});
  assert.equal(await select.inputValue(),'libsql-http');
  assert.ok(await select.evaluate(node=>document.activeElement===node));
  assert.equal(await page.evaluate(()=>window.scrollY),position);
  assert.equal(seen.filter(([type])=>type==='document').length,1);
  await page.getByRole('button',{name:'Review configuration'}).click();
  await page.getByRole('list',{name:'Bindings to fix'}).waitFor();
  assert.equal(await page.locator('#apply').isDisabled(),true);
  await page.getByLabel('Service URL').fill('https://fixture.example');
  await page.getByLabel('Access token').fill('fixture-only');
  await page.getByRole('button',{name:'Review configuration'}).click();
  await page.waitForFunction(()=>!document.querySelector('#apply').disabled,null,{timeout:10000});
  assert.equal(seen.filter(([,path])=>path.endsWith('/api/review')).length,1);
  assert.deepEqual(errors,[]);
  console.log('PASS '+target+' browser: verified session unlocked in place, focus/scroll/selection retained, invalid review refused, corrected review accepted.');
 }finally{await browser.close();}
}
