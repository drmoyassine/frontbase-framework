import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/backend/',path='packages/backend/src/compat/routes/site-publication-controls.ts';
if(!buildPackage('@frontbase/backend')||runGate(dir,'test/site-publication-controls.mjs')!==0)process.exit(2);
for(const [label,find,replacement] of [
 ['control reader role',"!roles.includes(user.role)","false"],
 ['activation role',"if(!user?.role || !roles.includes(user.role))return c.json({detail:'Publication is unavailable'},403);\n        if(new URL(c.req.url).search)return c.json({detail:'Invalid publication request'},422);\n        if(c.req.header", "if(false)return c.json({detail:'Publication is unavailable'},403);\n        if(new URL(c.req.url).search)return c.json({detail:'Invalid publication request'},422);\n        if(c.req.header"],
 ['control owner',"owner=c.get('tenant')","owner='alpha'"],
 ['activation owner',"const owner=c.get('tenant'),store=","const owner='alpha',store="],
 ['activation allowlist',"expected:sitePublicationPointerSchema.nullable()}).strict()","expected:sitePublicationPointerSchema.nullable()}).passthrough()"],
 ['activation request bound','if(size>4096)','if(size>99999)'],
 ['activation JSON boundary',"if(c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')",'if(false)'],
 ['activation expectation','if(JSON.stringify(current)!==JSON.stringify(request.data.expected))','if(false)'],
 ['current review integrity',"if(active && !await reviews.get(active.pointer.hash))","if(false)"],
 ['target review and guarded activation',"if(!await reviews.get(request.data.hash))throw new Error('publication_review_required');\n            // Deliberate same-target submission is a no-op; stale retries are refused above.\n            if(current?.hash===request.data.hash)return c.json({pointer:current,changed:false});\n            const pointer=await reviews.activate(request.data.hash,request.data.expected,now());", "if(current?.hash===request.data.hash)return c.json({pointer:current,changed:false});\n            const pointer=await store.activate(request.data.hash,request.data.expected,now());"],
 ['same-target generation stability','if(current?.hash===request.data.hash)','if(false)'],
 ['state failure never inactive',"catch{return c.json({detail:'Publication is unavailable'},503);}","catch{return c.json({pointer:null,capture:null});}"],
]) {
 await withSourceMutation(label,path,find,replacement,async()=>{if(!buildPackage('@frontbase/backend'))throw new Error('Mutation did not compile');expectRed(label,runGate(dir,'test/site-publication-controls.mjs'));});
 if(!buildPackage('@frontbase/backend')||runGate(dir,'test/site-publication-controls.mjs')!==0)throw new Error('Restored control baseline failed: '+label);
 console.log('  restored baseline GREEN: '+label);
}
summarize('publication controls');
