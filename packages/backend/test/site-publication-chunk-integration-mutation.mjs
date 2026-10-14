import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/backend/',gate='test/site-publication-chunk-integration.mjs',args=['--without-capacity'];
if(!buildPackage('@frontbase/backend')||runGate(dir,gate,args)!==0)process.exit(2);
for(const [label,file,find,replacement] of [
 ['chunk host-portable navigation','site-publication-chunk-runtime.ts','projected=projectRelativeSiteLinks(projected,artifact.configuration.site.origin);',''],
 ['preview external origin admission','routes/site-publication.ts',"(target.origin==='https://publication-preview.invalid' || target.origin===new URL(artifact.configuration.site.origin).origin)",'true'],
 ['redirect complete chunk integrity','site-publication-serving.ts','await new SitePublicationManifestStore(db,owner).verify(active.artifact);\n                await verifyManifestEditorial(db,owner,active.artifact);','await verifyManifestEditorial(db,owner,active.artifact);'],
 ['redirect approved content','site-publication-serving.ts','await verifyManifestEditorial(db,owner,active.artifact);\n                return {status:\'redirect\'','return {status:\'redirect\''],
 ['chunk query owner','site-publication-chunk-queries.ts',"if(ctx.tenant!==owner)throw new Error('principal_context_required');","if(false)throw new Error('principal_context_required');"],
 ['chunk program parent binding','site-publication-chunk-runtime.ts','parentPath??path','path'],
 ['chunk public query admission','site-publication-chunk-runtime.ts',"if(!allowed.includes(key)||url.searchParams.getAll(key).length!==1)",'if(false)'],
 ['chunk exact approved payload','site-publication-approval-check.ts','stableStringify(record)!==stableStringify(expected)','false'],
 ['chunk runtime editorial approval','site-publication-chunk-queries.ts',"if(role==='article' || role==='page')await verifyManifestEditorial(db,owner,manifest,rows);",''],
 ['chunk review validation','site-publication-review-store.ts',"if(version.schemaVersion===2){await new SitePublicationManifestStore(this.db,this.tenant).verify(version);await verifyManifestEditorial(this.db,this.tenant,version);}",''],
 ['chunk activation verification','site-publication-review-store.ts',"if(version?.schemaVersion===2){await new SitePublicationManifestStore(this.db,this.tenant).verify(version);await verifyManifestEditorial(this.db,this.tenant,version);}",''],
 ['chunk sitemap integrity','site-publication-serving.ts',"if(active.artifact.schemaVersion===2){await new SitePublicationManifestStore(db,owner).verify(active.artifact);await verifyManifestEditorial(db,owner,active.artifact);}",''],
]){
 await withSourceMutation(label,'packages/backend/src/compat/'+file,find,replacement,async()=>{
  if(!buildPackage('@frontbase/backend'))throw new Error('Mutation must compile');
  expectRed(label,runGate(dir,gate,args));
 });
 if(!buildPackage('@frontbase/backend')||runGate(dir,gate,args)!==0)throw new Error('Restored integration baseline failed: '+label);
 console.log('Restored integration baseline GREEN: '+label);
}
summarize('chunk publication integration');
