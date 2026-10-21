import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const module=new URL('../dist/compat/translation-homepage.js',import.meta.url),serving=new URL('../dist/compat/translation-homepage-serving.js',import.meta.url),route=new URL('../dist/compat/routes/translation-homepage.js',import.meta.url),manifest=new URL('../dist/compat/site-publication-manifest.js',import.meta.url);
// The last tuple element picks the behavioral canary suite; page-level faults are pinned by the
// generalized publication suite (rollback/deactivate/per-unit drift are not exercised by the homepage one).
const faults=[
 ['configured target locale',module,'!config.targetLocales.includes(target)','false'],
 ['field revision fence',module,'prior.value.token !== e.token','false'],
 ['activation CAS',module,'JSON.stringify(current) !== JSON.stringify(pointerSchema.nullable().parse(expected))','false'],
 ['outdated locale refusal',serving,'if (selected && !available.includes(selected))','if (false)'],
 ['explicit review consent',route,'approveTranslations: z.literal(true)','approveTranslations: z.boolean()'],
 ['deactivation CAS',module,'JSON.stringify(pointerSchema.parse(JSON.parse(prior))) !== JSON.stringify(pointerSchema.nullable().parse(expected))','false','translation-page-publication.mjs'],
 ['per-unit freshness join',module,'field.sourceText === undefined || sourceNow.get(JSON.stringify(stableIdentity(field))) === field.sourceText','true','translation-page-publication.mjs'],
 ['missing-unit coverage policy',module,"item.value.state === 'missing' && policy.missing === 'source-fallback'",'false','translation-page-publication.mjs'],
 ['outdated-unit coverage policy',module,"item.value.state === 'outdated' && policy.outdated === 'source-fallback'",'false','translation-page-publication.mjs'],
 ['locale route reservation',module,'return route === `/${target}` || route.startsWith(`/${target}/`); }))','return false; }))'],
 ['site admission locale fence',manifest,'await assertOutsidePublishedLocaleRoutes(this.db, this.tenant, manifestLocaleRouteExposures(manifest));',''],
 ['switcher label precedence',serving,"language: typeof labels?.language === 'string' ? labels.language : current === 'ar' ? 'اللغة' : 'Language'","language: current === 'ar' ? 'اللغة' : 'Language'",'translation-navigation.mjs'],
];
for(const[name,url,from,to,suite='translation-homepage.mjs']of faults){const original=readFileSync(url,'utf8');assert.ok(original.includes(from),'fault anchor '+name);
 const hook=`import {registerHooks} from 'node:module';registerHooks({load(url,context,next){const result=next(url,context);return url===${JSON.stringify(url.href)}?{...result,source:String(result.source).replaceAll(${JSON.stringify(from)},${JSON.stringify(to)})}:result;}});`;
 const r=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(hook),fileURLToPath(new URL('./'+suite,import.meta.url))],{encoding:'utf8',timeout:120000});assert.ok(r.status!==0&&/AssertionError/.test(r.stderr),'behavioral fault '+name+'\n'+r.stderr);assert.equal(readFileSync(url,'utf8'),original);console.log('caught:',name);
}
console.log('translation-homepage: twelve in-memory faults caught; source/artifacts unchanged');
