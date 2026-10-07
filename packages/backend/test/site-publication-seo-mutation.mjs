import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/backend/';
if(!buildPackage('@frontbase/backend')||runGate(dir,'test/site-publication-seo.mjs')!==0)process.exit(2);
for(const [label,path,find,replacement,pkg] of [
 ['SEO request origin leak','packages/backend/src/compat/site-publication-runtime.ts','new URL(path, artifact.configuration.site.origin).href','new URL(path, request.url).href','@frontbase/backend'],
 ['SEO query index leak','packages/backend/src/compat/site-publication-runtime.ts',"url.searchParams.size ? 'noindex, follow' : 'index, follow'","'index, follow'",'@frontbase/backend'],
 ['SEO sitemap review bypass','packages/backend/src/compat/site-publication-serving.ts','if(!await new SitePublicationReviewStore(db,owner).get(active.pointer.hash))','if(false)','@frontbase/backend'],
 ['SEO sitemap owner leak','packages/backend/src/compat/site-publication-serving.ts','new SitePublicationStore(db,owner)',"new SitePublicationStore(db,'seo')",'@frontbase/backend'],
 ['SEO sitemap escaping','packages/backend/src/compat/site-publication-sitemap.ts','xml(new URL(path, artifact.configuration.site.origin).href)','new URL(path, artifact.configuration.site.origin).href','@frontbase/backend'],
 ['SEO sitemap version identity','packages/backend/src/compat/site-publication-serving.ts',"headers.set('X-Site-Version',resolution.hash);","headers.set('X-Site-Version','baked');",'@frontbase/backend'],
 ['SEO sitemap HEAD body','packages/backend/src/compat/site-publication-serving.ts',"request.method==='HEAD'?null:resolution.xml","resolution.xml",'@frontbase/backend'],
 ['SEO metadata escaping','packages/edge-core/src/shell.ts','escapeHtml(String(value))','String(value)','@frontbase/edge-core'],
])await withSourceMutation(label,path,find,replacement,async()=>{if(!buildPackage(pkg))throw new Error('Mutation did not compile');expectRed(label,runGate(dir,'test/site-publication-seo.mjs'));});
if(!buildPackage('@frontbase/edge-core')||!buildPackage('@frontbase/backend')||runGate(dir,'test/site-publication-seo.mjs')!==0)process.exit(2);
summarize('captured publication SEO mutation');
