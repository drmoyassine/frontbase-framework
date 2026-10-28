import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/edge-core/',pkg='@frontbase/edge-core',gate='test/template-landing.mjs';
if(!buildPackage(pkg)||runGate(dir,gate)!==0)process.exit(2);
for(const [name,file,find,replacement,canary='test/template-landing.mjs'] of [
    ['hero state remains opaque public data','directory/template-settings.ts','props.templateHeroState=[{settings:templateSettingsSchema.shape.hero.parse((props.templateHero as any)?.settings??s.hero),palette:p,destination:configuration.site.destination??\'\'}]','props.templateHeroState={settings:templateSettingsSchema.shape.hero.parse((props.templateHero as any)?.settings??s.hero),palette:p,destination:configuration.site.destination??\'\'}'],
    ['transient search admission','directory/bindings.ts',"if(props.templateHeroState!==undefined || props.templateSearchState!==undefined || props.templateMenuLabels!==undefined)",'if(false)'],
    ['slider respects reduced motion','hero-behavior.ts','&&!reduced?.matches',''],
    ['legacy navbar switcher placement','ssr/components/landing/Navbar.ts',"// layout renders it beside the CTA (same picker component as the new format).\n    const languageSwitcherHtml = props.showLanguageSwitcher===false?'':renderLanguageSwitcher(props.languageSwitcher,props.localeLabels?.language??'Language');","// layout renders it beside the CTA (same picker component as the new format).\n    const languageSwitcherHtml = '';",'test/menus-native.mjs'],
    ['menu switcher toggle persistence','menus.ts','showLanguageSwitcher:z.boolean().optional(),','','test/menus-native.mjs'],
]){
    await withSourceMutation(name,'packages/edge-core/src/'+file,find,replacement,async()=>{if(!buildPackage(pkg))throw Error('Mutation must compile');expectRed(name,runGate(dir,canary));});
    if(!buildPackage(pkg)||runGate(dir,canary)!==0)throw Error('Restored baseline failed');
}
summarize('template landing');
