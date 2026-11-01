import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {d1RunnerFromBinding} from '../packages/edge-infra/dist/index.js';
import {migrateUp} from '../packages/backend/dist/db/migrations.js';
import {PagesStore} from '../packages/backend/dist/compat/pages-store.js';
import {TemplateInstallStore} from '../packages/backend/dist/compat/template-install-store.js';
import {emptyDirectoryConfiguration} from '../packages/edge-core/dist/directory/configuration.js';
const require=createRequire(realpathSync(fileURLToPath(new URL('../node_modules/wrangler/package.json',import.meta.url))));const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'booking-fixture',modules:true,script:'export default {fetch(){return new Response("isolated D1 installer fixture")}}',compatibilityDate:'2026-09-07',d1Databases:{DB:'booking-for-x-isolated'}}]}));
try{const db=d1RunnerFromBinding(await mf.getD1Database('DB'));await migrateUp(db);const pages=new PagesStore(db,'d1-fixture');await pages.ensureHomepage('2026-11-01T00:00:00Z');const store=new TemplateInstallStore(db,'d1-fixture'),input={templateId:'booking-for-x',configuration:emptyDirectoryConfiguration()},review=await store.review(input);const result=await store.install(input,review.reviewHash,crypto.randomUUID(),'2026-11-01T00:00:00Z');assert.equal(result.status,'installed');assert.equal((await pages.list()).length,6);assert((await pages.list()).every(p=>p.is_published===0));await pages.ensureHomepage('2026-11-01T00:00:01Z');assert.equal((await pages.list()).length,6);await assert.rejects(()=>db.atomicWrite([{sql:'UPDATE compat_pages SET name=? WHERE tenant_slug=?',params:['must roll back','d1-fixture']},{sql:'INSERT INTO missing_atomic_guard VALUES(1)'}]));assert(!(await pages.list()).some(p=>p.name==='must roll back'),'real D1 batch rolls back all earlier writes');assert.equal(await new TemplateInstallStore(db,'another-tenant').status(),null);console.log('PASS actual local Workers D1: full migrations, pristine-home replacement, exactly six editable drafts, boot preservation, native atomic rollback and tenant isolation');}finally{await mf.dispose();}
