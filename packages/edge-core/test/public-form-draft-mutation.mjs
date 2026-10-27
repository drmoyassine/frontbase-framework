import { withSourceMutation, buildPackage, runGate, expectRed, repoRoot } from '../../../scripts/mutation-lib.mjs';
const pkg='@frontbase/edge-core', dir=repoRoot+'packages/edge-core/';
const green=()=>{if(!buildPackage(pkg)||runGate(dir,'test/public-form-draft.mjs')!==0)throw new Error('Public form baseline must be GREEN');};
green();
for(const [name,from,to] of [
    ['label escaping','const label = escapeHtml(field.label)', 'const label = field.label'],
    ['inert fieldset','<fieldset disabled ', '<fieldset '],
    ['no submit action','<button type="button" disabled', '<button type="submit" disabled'],
]) {
    await withSourceMutation(name,'packages/edge-core/src/ssr/components/publicForm.ts',from,to,async()=>{
        if(!buildPackage(pkg))throw new Error('Mutation must compile');
        expectRed(name,runGate(dir,'test/public-form-draft.mjs'));
    });
    green();
}
console.log('Public form draft mutations: 3 RED / restored GREEN');
