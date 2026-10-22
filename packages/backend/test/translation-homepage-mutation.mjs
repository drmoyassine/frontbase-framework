import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const module=new URL('../dist/compat/translation-homepage.js',import.meta.url),serving=new URL('../dist/compat/translation-homepage-serving.js',import.meta.url),route=new URL('../dist/compat/routes/translation-homepage.js',import.meta.url),manifest=new URL('../dist/compat/site-publication-manifest.js',import.meta.url),chunkRuntime=new URL('../dist/compat/site-publication-chunk-runtime.js',import.meta.url),listSource=new URL('../dist/compat/publication-list-source.js',import.meta.url),bindings=new URL('../../edge-core/dist/directory/bindings.js',import.meta.url);
// The last tuple element picks the behavioral canary suite; page-level faults are pinned by the
// generalized publication suite (rollback/deactivate/per-unit drift are not exercised by the homepage one).
// Slice C adds the release guards: display-text save fence, identity-collision fence, composed-label
// stamp and the record supplement plain-text guard.
// A stale strict release is refused TWICE by design (serve guard + projection re-check): a fault
// that disables one layer must also disable the other, or the redundancy masks it and the gate
// proves nothing. The optional 6th tuple element is a second [url,from,to] patch applied together.
const faults=[
 ['configured target locale',module,'!config.targetLocales.includes(target)','false'],
 ['field revision fence',module,'prior.value.token !== e.token','false'],
 ['activation CAS',module,'JSON.stringify(current) !== JSON.stringify(pointerSchema.nullable().parse(expected))','false'],
 ['outdated locale refusal',serving,'if (selected && !await isFresh(selected))','if (false)','translation-homepage.mjs',[module,'if (!perUnit && (capture.active.pointer.hash !== release.siteHash || capture.sourceHash !== release.sourceHash))','if (false && (capture.active.pointer.hash !== release.siteHash || capture.sourceHash !== release.sourceHash))']],
 ['explicit review consent',route,'approveTranslations: z.literal(true)','approveTranslations: z.boolean()'],
 ['deactivation CAS',module,'JSON.stringify(pointerSchema.parse(JSON.parse(prior))) !== JSON.stringify(pointerSchema.nullable().parse(expected))','false','translation-page-publication.mjs'],
 ['per-unit freshness join',module,'field.sourceText === undefined || sourceNow.get(JSON.stringify(stableIdentity(field))) === field.sourceText','true','translation-page-publication.mjs'],
 ['missing-unit coverage policy',module,"item.value.state === 'missing' && policy.missing === 'source-fallback'",'false','translation-page-publication.mjs'],
 ['outdated-unit coverage policy',module,"item.value.state === 'outdated' && policy.outdated === 'source-fallback'",'false','translation-page-publication.mjs'],
 ['locale route reservation',module,'return route === `/${target}` || route.startsWith(`/${target}/`); }))','return false; }))'],
 ['site admission locale fence',manifest,'await assertOutsidePublishedLocaleRoutes(this.db, this.tenant, manifestLocaleRouteExposures(manifest));',''],
 ['switcher label precedence',serving,"language: typeof labels?.language === 'string' ? labels.language : current === 'ar' ? 'اللغة' : 'Language'","language: current === 'ar' ? 'اللغة' : 'Language'",'translation-navigation.mjs'],
 ['serve locale date projection',chunkRuntime,'{ locale: recordsLocale ?? artifact.configuration.site.locale }','{ locale: artifact.configuration.site.locale }','translation-homepage-explore.mjs'],
 ['localized fetch language declaration',listSource,"localized?.catalog ? { 'Content-Language': localized.locale } : undefined",'undefined','translation-homepage-explore.mjs'],
 ['content language direction stamp',serving,'direction: localeDirection(contentLocale)',"direction: 'ltr'",'translation-page-publication.mjs'],
 ['display-text save guard',module,'display: translationDisplayText(field.text, e.text)','display: e.text','translation-homepage-explore.mjs'],
 ['identity-collision fence',module,'const seen = new Map();','return;','translation-homepage-directory.mjs'],
 ['composed ariaLabel stamp',bindings,'recordColumns.ariaLabel = `ariaLabel:${b.text}`;',';','translation-homepage-directory.mjs'],
 ['supplement plain-text guard',module,' && !/[{}<>]|@\\{/.test(text)','','translation-homepage-explore.mjs'],
];
const run=(suite,hook)=>spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(hook??''),fileURLToPath(new URL('./'+suite,import.meta.url))],{encoding:'utf8',timeout:300000});
for(const suite of ['translation-homepage.mjs','translation-page-publication.mjs','translation-navigation.mjs','translation-homepage-explore.mjs','translation-homepage-directory.mjs']){
    const clean=run(suite);
    assert.equal(clean.status,0,suite+' clean baseline: '+clean.stdout.slice(-2000)+clean.stderr.slice(-2000));
}
for(const[name,url,from,to,suite='translation-homepage.mjs',extra]of faults){
 const patches=extra?[[url,from,to],extra]:[[url,from,to]];
 const originals=new Map(patches.map(([u])=>[u.href,readFileSync(u,'utf8')]));
 for(const[u,f]of patches)assert.ok(originals.get(u.href).includes(f),'fault anchor '+name);
 const rules=patches.map(([u,f,t])=>`if(url===${JSON.stringify(u.href)}){result={...result,source:String(result.source).replaceAll(${JSON.stringify(f)},${JSON.stringify(t)})};}`).join('');
 const hook=`import {registerHooks} from 'node:module';registerHooks({load(url,context,next){let result=next(url,context);${rules}return result;}});`;
 const r=run(suite,hook);assert.ok(r.status!==0&&/AssertionError/.test(r.stderr),'behavioral fault '+name+'\n'+r.stderr);
 for(const[u]of patches)assert.equal(readFileSync(u,'utf8'),originals.get(u.href));
 console.log('caught:',name);
}
console.log('translation-homepage: nineteen in-memory faults caught; source unchanged');
