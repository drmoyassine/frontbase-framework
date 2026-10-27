import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'examples/cf-full/';
const build=()=>buildPackage('@frontbase/example-cf-full');
if(!build()||runGate(dir,'dist/smoke-publication.mjs')!==0)process.exit(2);
for(const [label,find,replacement] of [
 ['host terminal reviewed response','if (reviewed) return reviewed;','if (false) return reviewed;'],
 ['host publication owner',"tenant ?? '_root', c.req.raw, { swBundle: SW_BUNDLE }","'_root', c.req.raw, { swBundle: SW_BUNDLE }"],
 ['host SW infrastructure bypass',"|| path === '/sw.js'","|| false"],
])await withSourceMutation(label,'examples/cf-full/src/worker.ts',find,replacement,async()=>{
 if(!build())throw new Error('Host mutation did not build');
 expectRed(label,runGate(dir,'dist/smoke-publication.mjs'));
});
if(!build()||runGate(dir,'dist/smoke-publication.mjs')!==0)process.exit(2);
summarize('publication host mutation');
