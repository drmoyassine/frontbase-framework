import { withSourceMutation, buildPackage, runGate, expectRed, repoRoot } from '../../../scripts/mutation-lib.mjs';
const pkg='@frontbase/edge-core',dir=repoRoot+'packages/edge-core/';
if (!buildPackage(pkg) || runGate(dir,'test/direction.mjs') !== 0 || runGate(dir,'test/localization-surfaces.mjs') !== 0) process.exit(2);
for (const [label,file,find,replacement,suite] of [
    // Every direction stamp resolves through one helper: emptying the RTL list must turn the
    // helper suite red, not just one call site.
    ['rtl script list','src/localization/direction.ts',"return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';","return false ? 'rtl' : 'ltr';",'test/direction.mjs'],
    // Date output is locale-derived: both the projection marker and the extraction skip are
    // load-bearing — dropping either re-admits formatted dates as translatable text units.
    ['date literal extraction skip','src/localization/surfaces.ts','&&p.translationLiteral===undefined','','test/localization-surfaces.mjs'],
    ['date literal projection stamp','src/directory/bindings.ts',"if (b.format === 'date') rest.translationLiteral = b.text;",'','test/localization-surfaces.mjs'],
]) await withSourceMutation(label,'packages/edge-core/'+file,find,replacement,async()=>{
    if (!buildPackage(pkg)) throw new Error(label+' mutation must compile');
    expectRed(label,runGate(dir,suite));
});
console.log('direction: three in-source faults caught');
