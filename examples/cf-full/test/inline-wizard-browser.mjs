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
   if(url.pathname.endsWith('/api/apply'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({phase:'active'})});
   const response=await host.fetch(new Request(url,{method:request.method(),headers:await request.allHeaders(),body:request.postDataBuffer()??undefined}));
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto(origin+'/frontbase-bootstrap/activation#claim='+env.FRONTBASE_BOOTSTRAP_TOKEN);
  assert.equal(seen.some(([,path])=>path.endsWith('/api/form')),false);
  release();
  await page.getByRole('heading',{name:'Create your administrator account'}).waitFor();
  assert.equal(await page.locator('#providers').isVisible(),false);
  assert.equal(seen.some(([,path])=>path.includes('provider-resources')),false);
  await page.locator('#administrator-email').fill('browser@example.test');
  await page.locator('#administrator-password').fill('Browser-fixture-password-123');
  await page.getByLabel('Confirm password',{exact:true}).fill('Browser-fixture-password-123');
  await page.getByRole('button',{name:'Continue to services'}).click();
  await page.waitForFunction(()=>!document.querySelector('#apply').disabled,null,{timeout:15000});
  assert.equal(await page.locator('#administrator-password').inputValue(),'');
  const select=page.locator('select[data-role="state-db"]');
  await select.selectOption('libsql-http');
  assert.equal(seen.filter(([type])=>type==='document').length,1);
  await page.getByRole('button',{name:'Finish setup'}).click();
  await page.getByRole('list',{name:'Bindings to fix'}).waitFor();
  assert.equal(seen.filter(([,path])=>path.endsWith('/api/apply')).length,0,'invalid bindings never activate');
  await page.getByLabel('Service URL').fill('https://fixture.example');
  await page.getByLabel('Access token').fill('fixture-only');
  await page.getByRole('status').filter({hasText:'Progress saved.'}).waitFor();
  await page.context().clearCookies();
  await page.goto(origin+'/frontbase-bootstrap/');
  await page.getByRole('heading',{name:'Sign in to continue setup'}).waitFor();
  await page.locator('#resume-email').fill('browser@example.test');
  await page.locator('#resume-password').fill('Browser-fixture-password-123');
  await page.getByRole('button',{name:'Continue setup',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Your saved progress has been restored.'}).waitFor();
  assert.equal(await page.getByLabel('Service URL').inputValue(),'https://fixture.example');
  assert.equal(await page.getByLabel('Access token').inputValue(),'fixture-only');
  assert.equal(seen.filter(([,path])=>path.endsWith('/api/apply')).length,0,'leaving and returning cannot provision');
  await page.getByRole('button',{name:'Finish setup'}).click();
  await page.getByRole('status').filter({hasText:'Services are ready.'}).waitFor();
  assert.equal(seen.filter(([,path])=>path.endsWith('/api/review')).length,1);
  assert.equal(seen.filter(([,path])=>path.endsWith('/api/apply')).length,1,'one click reviews then submits once');
  assert.equal(await page.getByRole('button',{name:'Review configuration'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Deploy now'}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS '+target+' browser: administrator enrollment precedes services, credentials cleared, one document, invalid activation refused, one primary action reviews then submits corrected bindings.');
 }finally{await browser.close();}
}
