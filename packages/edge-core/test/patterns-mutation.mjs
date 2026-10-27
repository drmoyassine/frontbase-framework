import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/edge-core/',pkg='@frontbase/edge-core',gate='test/patterns.mjs';
if(!buildPackage(pkg)||runGate(dir,gate)!==0)process.exit(2);
for(const [name,file,find,replacement,canary='test/patterns.mjs'] of [
    ['unknown token stays literal','localization/patterns.ts','Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token','Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : \'\''],
    ['plural variant selection','localization/patterns.ts','return (category && labels[`${base}.${category}`]) ?? labels[base] ?? \'\';','return labels[base] ?? \'\';'],
    ['composed count line follows the serve locale','ssr/components/directoryBrowsing.ts',"pluralPatternLabel(labels, 'recordsRange', state.locale, state.total)","pluralPatternLabel(labels, 'recordsRange', undefined, state.total)"],
    ['empty hint composition','ssr/components/directoryBrowsing.ts','const empty = state.total === 0 ?','const empty = state.total === -1 ?'],
    ['hero client pattern agreement','ssr/components/templateLanding.ts','data-hero-status-pattern="${escapeHtml(labels.slideStatus)}"',''],
]){
    await withSourceMutation(name,'packages/edge-core/src/'+file,find,replacement,async()=>{if(!buildPackage(pkg))throw Error('Mutation must compile');expectRed(name,runGate(dir,canary));});
    if(!buildPackage(pkg)||runGate(dir,canary)!==0)throw Error('Restored baseline failed');
}
summarize('localization patterns');
