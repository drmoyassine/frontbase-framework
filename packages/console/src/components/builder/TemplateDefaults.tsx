import {RecordFieldPicker} from './data-binding/RecordFieldPicker';
import {Button} from '@/components/ui/button';
import React,{useEffect,useState} from 'react';
import {readTemplatePolicy,withTemplateNotice,type TemplatePolicy} from '@frontbase/edge-core/template-policy';
import {TemplatePolicyFields} from './TemplatePolicyFields';
import {useRecordFields} from '@/hooks/data/useRecordFields';
import type {Page} from '@/types/builder';

export function TemplateDefaults({page,onChange}:{page:Page;onChange:(layout:NonNullable<Page['layoutData']>)=>void}){
    const [locale,setLocale]=useState(''),[locales,setLocales]=useState<string[]>([]);
    let binding:any;const scan=(nodes:any[])=>{for(const node of nodes??[]){if(!binding&&node.type==='Card'&&node.props?.binding)binding=node.props.binding;if(node.children)scan(node.children);}};scan(page.layoutData?.content??[]);
    const {fields}=useRecordFields(binding?.tableName,binding?.dataSourceId,binding?.sourceSchema);
    useEffect(()=>{let active=true;fetch('/api/project/translation-generation/',{credentials:'include'}).then(async response=>response.ok?response.json():null).then(value=>{if(active)setLocales([value?.configuration?.sourceLocale,...value?.configuration?.targetLocales??[]].filter(Boolean));}).catch(()=>{});return()=>{active=false;};},[]);
    let policy:TemplatePolicy;try{policy=readTemplatePolicy(page.layoutData?.root);}catch{return <p role="alert">Template settings could not be read. Existing settings are preserved; reload before editing.</p>;}
    const defaults=policy.defaults,patch=locale?defaults.locales?.[locale]??{}:defaults.values;
    const change=(value:typeof patch)=>onChange({content:page.layoutData?.content??[],root:{...page.layoutData?.root,templatePolicy:{...policy,defaults:locale?{...defaults,locales:{...defaults.locales,[locale]:value}}:{...defaults,values:value}}}});
    return <div className="space-y-4 rounded border p-3"><h3 className="font-medium">Template SEO & exceptions</h3><p className="text-xs text-muted-foreground">Shared defaults for every record. Individual overrides and rules are available from Pages → URLs.</p><label className="block text-sm">Language<select aria-label="Template settings language" className="mt-1 w-full rounded border bg-background p-2" value={locale} onChange={e=>setLocale(e.target.value)}><option value="">All languages</option>{[...new Set([...locales,...Object.keys(defaults.locales??{})])].map(code=><option key={code} value={code}>{code}</option>)}</select></label>
        <details><summary className="cursor-pointer text-sm font-medium">SEO defaults</summary><div className="space-y-3 pt-3">{binding&&<RecordFieldPicker browseOnly binding={binding} onChange={()=>{}}/>}<TemplatePolicyFields value={patch} onChange={change} section="seo" columns={[...new Set(['id','title','summary','cover','coverAlt','originalPath','language','byline','publishedAt',...fields.map(field=>field.name)])]}/></div></details>
        <details><summary className="cursor-pointer text-sm font-medium">Notices & actions</summary><div className="pt-3"><TemplatePolicyFields value={patch} onChange={change} section="exceptions" columns={[...new Set(['id','title','summary','cover','coverAlt','originalPath','language','byline','publishedAt',...fields.map(field=>field.name)])]}/><Button className="mt-3" variant="outline" onClick={()=>onChange(withTemplateNotice(page.layoutData??{content:[],root:{}}) as NonNullable<Page['layoutData']>)}>Add editable notice block</Button></div></details>
    </div>;
}
