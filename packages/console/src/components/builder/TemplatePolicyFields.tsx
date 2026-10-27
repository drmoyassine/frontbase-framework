import React from 'react';
import {VariableInput} from './VariableInput';
import type {TemplatePatch} from '@frontbase/edge-core/template-policy';
import {Button} from '@/components/ui/button';

export function TemplatePolicyFields({value,onChange,section,columns=[]}:{value:TemplatePatch;onChange:(value:TemplatePatch)=>void;section:'seo'|'exceptions';columns?:string[]}){
    const set=(key:keyof TemplatePatch,next:unknown)=>{const patch={...value,[key]:next};if(next===undefined)delete patch[key];onChange(patch);};
    const field=(key:keyof TemplatePatch,label:string)=><div className="space-y-1" key={key}><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{label}</span>{value[key]!==undefined&&<Button size="sm" variant="ghost" onClick={()=>set(key,undefined)}>Reset</Button>}</div><VariableInput ariaLabel={label} value={String(value[key]??'')} onChange={next=>set(key,next)} showFiltersOnPipe={false} allowedGroups={['record','page']} recordColumns={columns} placeholder="Inherited · type @ to bind a field" multiline={key==='description'||key==='notice'}/></div>;
    return <div className="space-y-4">{section==='seo'?<>
        {field('title','SEO title')}{field('description','Meta description')}
        <details><summary className="cursor-pointer text-sm font-medium">Social sharing & indexing</summary><div className="mt-3 space-y-4">{field('socialTitle','Social title')}{field('socialDescription','Social description')}{field('image','Social image')}<label className="block text-sm">Search indexing<select aria-label="Search indexing" className="mt-1 w-full rounded border bg-background p-2" value={value.indexing??''} onChange={e=>set('indexing',e.target.value||undefined)}><option value="">Inherited</option><option value="index">Allow indexing</option><option value="noindex">No index</option></select></label></div></details>
    </>:<>
        {field('notice','Notice text')}<p className="text-xs text-muted-foreground">Design the notice with ordinary builder elements bound to page.settings.notice. Use Conditions or Block Versions for visibility.</p>
        <label className="block text-sm">Notice style<select aria-label="Notice style" className="mt-1 w-full rounded border bg-background p-2" value={value.noticeTone??''} onChange={e=>set('noticeTone',e.target.value||undefined)}><option value="">Inherited</option><option value="info">Information</option><option value="warning">Warning</option></select></label>
        {field('ctaLabel','Action label')}{field('ctaHref','Action destination')}<p className="text-xs text-muted-foreground">Bind a button label to page.settings.ctaLabel and its existing Open Page action to page.settings.ctaHref.</p>
        <label className="block text-sm">Directory visibility<select aria-label="Directory visibility" className="mt-1 w-full rounded border bg-background p-2" value={value.listed===undefined?'':String(value.listed)} onChange={e=>set('listed',e.target.value===''?undefined:e.target.value==='true')}><option value="">Inherited</option><option value="true">Allow in directory results</option><option value="false">Hide from directory results</option></select></label><p className="text-xs text-muted-foreground">The directory’s selected view and filters still apply.</p>
    </>}</div>;
}
