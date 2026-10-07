import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/backend/';
if(!buildPackage('@frontbase/backend')||runGate(dir,'test/site-publication.mjs')!==0)process.exit(2);
for(const [label,path,find,replacement,pkg] of [
 ['publication integrity','packages/backend/src/compat/site-publication-store.ts','await publicationHash(artifact) !== hash','false','@frontbase/backend'],
 ['publication owner read','packages/backend/src/compat/site-publication-store.ts',"WHERE tenant_slug = ? AND key = ?', [this.tenant, keyName]","WHERE ? IS NOT NULL AND key = ?', [this.tenant, keyName]",'@frontbase/backend'],
 ['publication stale activation','packages/backend/src/compat/site-publication-store.ts','stableStringify(current) !== stableStringify(expected)','false','@frontbase/backend'],
 ['publication first activation race','packages/backend/src/compat/site-publication-store.ts','ON CONFLICT(tenant_slug, key) DO NOTHING\', [this.tenant, ACTIVE','ON CONFLICT(tenant_slug, key) DO UPDATE SET value = excluded.value\', [this.tenant, ACTIVE','@frontbase/backend'],
 ['publication update activation race','packages/backend/src/compat/site-publication-store.ts','AND value = ?\', [JSON.stringify(next)','AND ? IS NOT NULL\', [JSON.stringify(next)','@frontbase/backend'],
 ['publication preparation settings','packages/backend/src/compat/site-publication-prepare.ts',"(await new SiteConfigurationStore(control,tenant).get())?.revision!==draft.revision","false",'@frontbase/backend'],
 ['publication approval fingerprint','packages/backend/src/compat/editorial-approval-store.ts','record.fingerprint !== expectedFingerprint','false','@frontbase/backend'],
 ['snapshot query owner','packages/compiler/src/queries/directory.ts',"if (ctx.tenant !== owner) throw new Error('principal_context_required');","if (false) throw new Error('principal_context_required');",'@frontbase/compiler'],
 ['public parent query binding','packages/backend/src/compat/site-publication-runtime.ts',"{ institutionId: row.id }","{ institutionId: 999 }",'@frontbase/backend'],
 ['program parent detail binding','packages/backend/src/compat/site-publication-runtime.ts','parentPath ?? path','path','@frontbase/backend'],
 ['prepared HTML reviewer role','packages/backend/src/compat/routes/site-publication.ts',"if(!user?.role || !['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(user.role))return c.json({detail:'Prepared preview is unavailable'},403);","if(false)return c.json({detail:'Prepared preview is unavailable'},403);",'@frontbase/backend'],
 ['prepared JSON reviewer role','packages/backend/src/compat/routes/site-publication.ts',"if(!user?.role || !['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(user.role))return c.json({detail:'Site preparation is unavailable'},403);","if(false)return c.json({detail:'Site preparation is unavailable'},403);",'@frontbase/backend'],
 ['site review owner read','packages/backend/src/compat/site-publication-review-store.ts',"WHERE tenant_slug = ? AND key = ?',[this.tenant,this.key(hash)]","WHERE ? IS NOT NULL AND key = ?',[this.tenant,this.key(hash)]",'@frontbase/backend'],
 ['site review immutable insert','packages/backend/src/compat/site-publication-review-store.ts','ON CONFLICT(tenant_slug, key) DO NOTHING','ON CONFLICT(tenant_slug, key) DO UPDATE SET value = excluded.value','@frontbase/backend'],
 ['site review actor','packages/backend/src/compat/routes/site-publication.ts',"(c.get('principal').user as {id?:string}).id","'forged-reviewer'",'@frontbase/backend'],
 ['review required for activation','packages/backend/src/compat/site-publication-review-store.ts',"if(!await this.get(hash))throw new Error('publication_review_required');","if(false)throw new Error('publication_review_required');",'@frontbase/backend'],
 ['public reader review guard','packages/backend/src/compat/site-publication-serving.ts',"if(!await new SitePublicationReviewStore(db,owner).get(active.pointer.hash))","if(false)",'@frontbase/backend'],
 ['public reader owner','packages/backend/src/compat/site-publication-serving.ts',"new SitePublicationStore(db,owner)","new SitePublicationStore(db,'guarded')",'@frontbase/backend'],
 ['missing active page never falls back','packages/backend/src/compat/site-publication-serving.ts',"if(!result)return {status:'missing'};","if(!result)return {status:'inactive'};",'@frontbase/backend'],
 ['corrupt active site never falls back','packages/backend/src/compat/site-publication-serving.ts',"catch{return {status:'unavailable'};}","catch{return {status:'inactive'};}",'@frontbase/backend'],
 ['terminal response never falls back','packages/backend/src/compat/site-publication-serving.ts',"if(resolution.status!=='resolved') {","if(resolution.status!=='resolved') { return null;",'@frontbase/backend'],
 ['response capture identity','packages/backend/src/compat/site-publication-serving.ts',"responseHeaders.set('X-Site-Version',resolution.hash);","responseHeaders.set('X-Site-Version','baked');",'@frontbase/backend'],
 ['HEAD response body','packages/backend/src/compat/site-publication-serving.ts',"request.method==='HEAD'?null:rendered.body","rendered.body",'@frontbase/backend'],
 ['captured document metadata','packages/backend/src/compat/site-publication-serving.ts',"environment:'edge',document,swBundle:options.swBundle","environment:'edge',swBundle:options.swBundle",'@frontbase/backend'],
])await withSourceMutation(label,path,find,replacement,async()=>{if(!buildPackage(pkg))throw new Error('Mutation did not compile');expectRed(label,runGate(dir,'test/site-publication.mjs'));});
if(!buildPackage('@frontbase/compiler')||!buildPackage('@frontbase/backend')||runGate(dir,'test/site-publication.mjs')!==0)process.exit(2);
summarize('site publication mutation');
