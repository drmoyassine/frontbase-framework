import React,{useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {translationGenerationOptionsSchema,translationStorageOptionsSchema} from '@frontbase/edge-core/localization';
import {TranslationGenerationForm} from './TranslationGenerationForm';
import {TranslationStorageForm} from './TranslationStorageForm';
import {TranslationBatchForm} from './TranslationBatchForm';

/** Mount each operational panel on demand, retain it when collapsed so drafts survive navigation. */
function SettingsDisclosure({title,description,children}:{title:string;description:string;children:React.ReactNode}){
 const [visited,setVisited]=useState(false);
 return <details className="rounded-lg border p-4" onToggle={e=>{if(e.currentTarget.open)setVisited(true);}}><summary className="cursor-pointer font-medium">{title}<span className="mt-1 block text-sm font-normal text-muted-foreground">{description}</span></summary>{visited&&<div className="mt-4">{children}</div>}</details>;
}
export function LanguagesSettings(){
 const [params,setParams]=useSearchParams();const expanded=params.get('section')==='translations';
 const [refresh,setRefresh]=useState(0);
 const [visited,setVisited]=useState(expanded),[summary,setSummary]=useState('Open to review language and service configuration.');
 useEffect(()=>{if(expanded)setVisited(true);},[expanded]);
 useEffect(()=>{if(!visited)return;let active=true;
  Promise.all([fetch('/api/project/translation-generation/',{credentials:'include'}).then(async r=>{if(!r.ok)throw Error();return translationGenerationOptionsSchema.parse(await r.json());}),fetch('/api/project/translation-storage/',{credentials:'include'}).then(async r=>{if(!r.ok)throw Error();return translationStorageOptionsSchema.parse(await r.json());})]).then(([ai,storage])=>{if(!active)return;const c=ai.configuration;setSummary(`${c?`Source: ${c.sourceLocale} · Translation targets: ${c.targetLocales.join(', ')||'none'}`:'Translation languages and AI are not configured.'} · Storage: ${storage.configuration?'configured':'not configured'}. Published languages are managed in each page’s translation workspace.`);}).catch(()=>{if(active)setSummary('Summary unavailable. Open the settings below to reload configuration; saved values are preserved.');});return()=>{active=false;};
 },[visited,refresh]);
 return <section id="languages-translations" className="max-w-4xl rounded-lg border bg-card p-6 space-y-4"><button type="button" className="w-full text-start" aria-expanded={expanded} aria-controls="language-settings-panels" onClick={()=>{const next=new URLSearchParams(params);next.set('tab','general');if(expanded)next.delete('section');else next.set('section','translations');setParams(next,{replace:true});}}><span className="block text-xl font-semibold">Languages & translations <span aria-hidden="true">{expanded?'−':'+'}</span></span><span className="mt-2 block text-sm text-muted-foreground">{summary}</span></button>
 {visited&&<div id="language-settings-panels" hidden={!expanded} className="space-y-3">
  <button type="button" className="text-sm underline" onClick={()=>setRefresh(n=>n+1)}>Refresh overview</button>
  <p className="text-sm text-muted-foreground">Site name, branding and default language save separately above. Opening these panels never starts translation or publishes content.</p>
  <SettingsDisclosure title="Languages & AI" description="Translation targets, connected account and model. Save language and model choices together."><TranslationGenerationForm/></SettingsDisclosure>
  <SettingsDisclosure title="Translation storage" description="Choose or check an existing connected datasource. Existing translations stay in place."><TranslationStorageForm/></SettingsDisclosure>
  <SettingsDisclosure title="Review & publish" description="Review page coverage and drafts, then prepare and publish the selected language."><p className="text-sm">Open a page’s translation workspace to review coverage and saved revisions. Publishing remains an explicit page/language action.</p><Link className="inline-block mt-3 underline" to="/pages">Open Pages</Link></SettingsDisclosure>
  <SettingsDisclosure title="Jobs & advanced" description="Select content, review a batch, inspect progress, failures and accounting."><TranslationBatchForm/></SettingsDisclosure>
 </div>}
 </section>;
}
