import type {DbRunner} from '@frontbase/edge-infra';
import {directoryConfigurationSchema,directoryConfigurationReadiness,encodeSourceConfiguration} from '@frontbase/edge-core/directory/configuration';
import {bookingPages,bookingMenus,bookingTemplate,digest} from './booking-template.js';
import {z} from 'zod';
import {publicationHash} from './publication-hash.js';
import {stableStringify} from '@frontbase/compiler/manifest';
const SLOT='template_install:booking-for-x:v1',CONFIG='site_configuration:v1';
export const templateInstallInput=z.object({templateId:z.literal('booking-for-x'),configuration:directoryConfigurationSchema}).strict();
export class TemplateInstallConflict extends Error{}
const canonical=(value:unknown)=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);

/** Tenant-owned operation receipt, atomic state writes and explicit status after uncertain transport.
 * No data-source DDL, record imports, publication, remote requests or uploaded executable artifact. */
export class TemplateInstallStore{
 constructor(private db:DbRunner,private owner:string){if(!owner)throw Error('template_owner_required');}
 async status(){const rows=await this.db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[this.owner,SLOT]);if(!rows.length)return null;const value=JSON.parse(String(rows[0]!.value));return {operationId:value.operationId,templateId:bookingTemplate.id,version:1,status:value.phase==='installed'?'installed':'uncertain',reviewHash:value.reviewHash,requestHash:value.requestHash,pages:value.pages.map((p:any)=>({id:p.id,name:p.name,role:p.role})),published:false};}
 private async snapshot(){
  const pages=await this.db.query('SELECT * FROM compat_pages WHERE tenant_slug=? ORDER BY id LIMIT 1001',[this.owner]);
  const config=await this.db.query('SELECT value FROM settings WHERE tenant_slug=? AND (key=? OR key=?)',[this.owner,CONFIG,'app_menus:v1']);
  const versions=await this.db.query('SELECT id FROM compat_page_versions WHERE tenant_slug=? LIMIT 1',[this.owner]);
  if(config.length||pages.length>1||versions.length)throw new TemplateInstallConflict('This site already has content or shared configuration. Installation will not overwrite it.');
  const seed=pages[0];
  if(seed){const {PagesStore}=await import('./pages-store.js');const probeLayout=PagesStore.welcomeLayout();
   if(seed.name!=='Home'||seed.slug!=='home'||seed.title!=='Home'||seed.is_homepage!==1||seed.is_public!==1||seed.is_published!==1||seed.deleted_at!==null||seed.description!==null||seed.keywords!==null||seed.seo_data!==null||seed.last_write_operation!==null||seed.primary_auth_form!==null||seed.layout_data!==JSON.stringify(probeLayout)||seed.content_hash!==await digest(JSON.stringify(probeLayout)))throw new TemplateInstallConflict('The welcome page has been edited. Keep it and configure your site manually; installation will not replace it.');
   if(seed.id!==await PagesStore.welcomeId(this.owner))throw new TemplateInstallConflict('The homepage is not the generated welcome page.');
  }
  return {seed:seed??null};
 }
 async review(raw:unknown){
  const input=templateInstallInput.parse(raw);if(!this.db.atomicWrite)throw new TemplateInstallConflict('This state adapter does not support atomic template installation.');
  if(await this.status())throw new TemplateInstallConflict('Booking for X already has an installation operation. Check its status; do not install again.');
  // Index routes belong to these two installed documents. Other routes stay record-driven.
  if(input.configuration.routes.directory!=='/explore/'||input.configuration.routes.blog!=='/blog/')throw new TemplateInstallConflict('Use /explore/ and /blog/ for installation; customize routes afterward in the builder.');
  if(input.configuration.datasourceId&&!(await this.db.query('SELECT id FROM datasources WHERE tenant_slug=? AND id=?',[this.owner,input.configuration.datasourceId])).length)throw new TemplateInstallConflict('Select a data connection owned by this site.');
  const snapshot=await this.snapshot(),pages=await bookingPages(this.owner);
  const reviewHash=await digest(canonical({owner:this.owner,version:1,input,snapshot,pages}));
  return {templateId:bookingTemplate.id,version:1,reviewHash,pages:pages.map(({id,name,role})=>({id,name,role})),replacesWelcome:!!snapshot.seed,missing:directoryConfigurationReadiness(input.configuration),published:false as const};
 }
 async install(raw:unknown,reviewHash:string,operationId:string,now:string){
  const requestHash=await digest(canonical(templateInstallInput.parse(raw)));
  const prior=await this.status();if(prior){if(prior.operationId!==operationId||prior.reviewHash!==reviewHash||prior.requestHash!==requestHash)throw new TemplateInstallConflict('Another installation already owns this site.');return prior;}
  const input=templateInstallInput.parse(raw),review=await this.review(input);
  if(review.reviewHash!==reviewHash)throw new TemplateInstallConflict('The site or template configuration changed. Review again before installing.');
  const snapshot=await this.snapshot(),pages=await bookingPages(this.owner);
  // Recheck the exact snapshot used by Review, not just an earlier absent read.
  if(await digest(canonical({owner:this.owner,version:1,input,snapshot,pages}))!==reviewHash)throw new TemplateInstallConflict('The site changed. Review again.');
  const receipt={operationId,reviewHash,requestHash,phase:'applying',pages:pages.map(({id,name,role})=>({id,name,role})),welcomeBefore:snapshot.seed,createdAt:now};
  const pending=JSON.stringify(receipt);
  const claimed=await this.db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[this.owner,SLOT,pending,now]);
  if(claimed!==1)return await this.status(); // A competing writer never runs another batch.
  const statements:Array<{sql:string;params:unknown[]}>=[];
  const seed=snapshot.seed,fields=seed?Object.keys(seed):[];
  const expected=seed?fields.map(k=>`(${k}=? OR (${k} IS NULL AND ?=1))`).join(' AND '):'';
  const seedValues=seed?fields.flatMap(k=>[seed[k],seed[k]===null?1:0]):[];
  // A failed guard violates the already-existing owner slot's PK, rolling back the WHOLE atomic batch.
  const guard=`EXISTS(SELECT 1 FROM settings WHERE tenant_slug=? AND key=? AND value=?) AND (SELECT COUNT(*) FROM compat_pages WHERE tenant_slug=?)=${seed?1:0} AND NOT EXISTS(SELECT 1 FROM settings WHERE tenant_slug=? AND (key=? OR key=?)) AND NOT EXISTS(SELECT 1 FROM compat_page_versions WHERE tenant_slug=?)${seed?' AND EXISTS(SELECT 1 FROM compat_pages WHERE tenant_slug=? AND '+expected+')':''}`;
  statements.push({sql:`INSERT INTO settings(tenant_slug,key,value,updated_at) SELECT ?,?,?,? WHERE NOT (${guard})`,params:[this.owner,SLOT,'guard',now,this.owner,SLOT,pending,this.owner,this.owner,CONFIG,'app_menus:v1',this.owner,...(seed?[this.owner,...seedValues]:[])]});
  if(seed)statements.push({sql:'DELETE FROM compat_pages WHERE tenant_slug=? AND id=?',params:[this.owner,seed.id]});
  statements.push({sql:'INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?)',params:[this.owner,CONFIG,JSON.stringify(encodeSourceConfiguration(input.configuration,1)),now]});
  const menus=bookingMenus(),menuHash=await publicationHash(menus);
  statements.push({sql:'INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?)',params:[this.owner,'app_menus:v1',JSON.stringify(menus),now]});
  statements.push({sql:'INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?)',params:[this.owner,'app_menus:publication:v1:'+menuHash,stableStringify(menus),now]});
  for(const page of pages){const layout=JSON.stringify(page.layout);statements.push({sql:'INSERT INTO compat_pages(id,tenant_slug,name,slug,title,is_public,is_homepage,is_published,layout_data,content_hash,created_at,updated_at,last_write_operation,namespace_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',params:[page.id,this.owner,page.name,page.slug,page.name,1,page.role==='home'?1:0,0,layout,await digest(layout),now,now,operationId,page.slug]});}
  statements.push({sql:'UPDATE settings SET value=?,updated_at=? WHERE tenant_slug=? AND key=? AND value=?',params:[JSON.stringify({...receipt,phase:'installed'}),now,this.owner,SLOT,pending]});
  // No retry after a thrown/lost batch response. The durable applying receipt fences new installs.
  await this.db.atomicWrite!(statements);
  return await this.status();
 }
}
