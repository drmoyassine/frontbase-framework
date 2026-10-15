import React, { useState } from 'react';
import { templateSettingsSchema, templateContrastIssues, type TemplateSettings } from '@frontbase/edge-core/directory/configuration';
import { FilePickerDialog } from '@/components/dashboard/FileBrowser/FilePickerDialog';
import { Button } from '@/components/ui/button';

export function TemplateSettingsEditor({value,onChange,scope='all'}:{value:TemplateSettings;onChange:(next:TemplateSettings)=>void;scope?:'all'|'appearance'|'hero'}) {
    const [picker,setPicker]=useState<number|null>(null);
    const input='block w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-foreground';
    const set=<K extends keyof TemplateSettings>(key:K,next:TemplateSettings[K])=>onChange({...value,[key]:next});
    const hero=(next:Partial<TemplateSettings['hero']>)=>set('hero',{...value.hero,...next});
    const numeric=(label:string,current:number,min:number,max:number,change:(n:number)=>void)=><label className="block text-sm">{label}<input className={input} aria-label={label} type="number" min={min} max={max} value={current} onChange={e=>change(Number(e.target.value))}/></label>;
    const text=(label:string,current:string,change:(s:string)=>void)=><label className="block text-sm">{label}<input className={input} aria-label={label} value={current} maxLength={1000} onChange={e=>change(e.target.value)}/></label>;
    return <div className="space-y-5">
        {scope!=='hero'&&<fieldset className="space-y-3"><legend className="font-medium">Appearance</legend>
            <label className="block text-sm">Preset<select className={input} aria-label="Template preset" value={value.preset} onChange={e=>set('preset',e.target.value as TemplateSettings['preset'])}><option value="navy">Neutral Navy</option><option value="charcoal">Neutral Charcoal</option></select></label>
            <p className="text-xs text-muted-foreground">Presets change public template defaults. Custom component styles take precedence; the admin theme is separate.</p>
            <Button type="button" variant="outline" disabled={!Object.keys(value.colors).length} onClick={()=>set('colors',{})}>Reset color overrides</Button>
            <details><summary className="cursor-pointer text-sm">Advanced appearance</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(['background','surface','text','muted','primary','border'] as const).map(key=><label key={key} className="block text-sm">{key}<input className={input} aria-label={`Template ${key} color`} placeholder="Preset default" value={value.colors[key]??''} maxLength={7} onChange={e=>{const next={...value.colors};if(e.target.value)next[key]=e.target.value;else delete next[key];set('colors',next);}}/></label>)}
                <label className="block text-sm">Font<select className={input} aria-label="Template font" value={value.font} onChange={e=>set('font',e.target.value as TemplateSettings['font'])}><option value="system">System sans serif</option><option value="serif">Serif</option></select></label>
                {numeric('Content width',value.width,900,1440,n=>set('width',n))}{numeric('Section spacing',value.spacing,24,88,n=>set('spacing',n))}{numeric('Card radius',value.radius,0,24,n=>set('radius',n))}
            </div></details>
        </fieldset>}
        {scope!=='appearance'&&<fieldset className="space-y-3"><legend className="font-medium">Hero imagery and slider</legend>
            {text('Hero heading',value.hero.heading,heading=>hero({heading}))}<p className="text-xs text-muted-foreground">Use {'{destination}'} to insert this site's configured country.</p>
            {text('Hero introduction',value.hero.introduction,introduction=>hero({introduction}))}
            <label className="block text-sm">Hero mode<select className={input} aria-label="Hero mode" value={value.hero.mode} onChange={e=>hero({mode:e.target.value as TemplateSettings['hero']['mode']})}><option value="none">Plain surface</option><option value="image">Single image</option><option value="slider">Slideshow</option></select></label>
            <div className="grid gap-3 sm:grid-cols-2">{numeric('Hero height',value.hero.height,240,560,height=>hero({height}))}{numeric('Mobile hero height',value.hero.mobileHeight,200,460,mobileHeight=>hero({mobileHeight}))}</div>
            {value.hero.slides.map((slide,i)=><div key={i} className="space-y-3 rounded-md border p-3"><p className="text-sm font-medium">Image {i+1}</p>
                {text(`Image ${i+1} URL`,slide.src,src=>hero({slides:value.hero.slides.map((s,n)=>n===i?{...s,src}:s)}))}
                <Button type="button" variant="outline" onClick={()=>setPicker(i)}>Choose from connected storage</Button>
                {text(`Image ${i+1} alt text`,slide.alt,alt=>hero({slides:value.hero.slides.map((s,n)=>n===i?{...s,alt}:s)}))}
                <div className="grid gap-3 sm:grid-cols-2">{numeric(`Image ${i+1} horizontal focal point`,slide.focalX,0,100,focalX=>hero({slides:value.hero.slides.map((s,n)=>n===i?{...s,focalX}:s)}))}{numeric(`Image ${i+1} vertical focal point`,slide.focalY,0,100,focalY=>hero({slides:value.hero.slides.map((s,n)=>n===i?{...s,focalY}:s)}))}</div>
                <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!i} onClick={()=>{const slides=[...value.hero.slides];[slides[i-1],slides[i]]=[slides[i]!,slides[i-1]!];hero({slides});}}>Move up</Button><Button type="button" variant="outline" disabled={i===value.hero.slides.length-1} onClick={()=>{const slides=[...value.hero.slides];[slides[i],slides[i+1]]=[slides[i+1]!,slides[i]!];hero({slides});}}>Move down</Button><Button type="button" variant="ghost" onClick={()=>hero({slides:value.hero.slides.filter((_,n)=>n!==i)})}>Remove image</Button></div>
            </div>)}
            <Button type="button" variant="outline" disabled={value.hero.slides.length>=8} onClick={()=>setPicker(value.hero.slides.length)}>Add image from storage</Button>
            <p className="text-xs text-muted-foreground">No images uses the plain surface. One image hides unnecessary slideshow controls. Search stays stationary.</p>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={value.hero.controls} onChange={e=>hero({controls:e.target.checked})}/>Show slide controls</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={value.hero.autoplay} onChange={e=>hero({autoplay:e.target.checked})}/>Autoplay (includes pause; respects reduced motion)</label>
            {value.hero.autoplay&&numeric('Seconds per slide',value.hero.interval,5,30,interval=>hero({interval}))}
        </fieldset>}
        {scope==='all'&&<fieldset className="space-y-3"><legend className="font-medium">Homepage sections</legend>
            {(['guidance','programs','articles','counselor'] as const).map(key=><label key={key} className="flex gap-2 text-sm"><input type="checkbox" checked={value.sections[key]} onChange={e=>set('sections',{...value.sections,[key]:e.target.checked})}/>{key}</label>)}
            <div className="grid gap-3 sm:grid-cols-2">{numeric('Program cards',value.programCount,1,12,n=>set('programCount',n))}{numeric('Guide cards',value.articleCount,1,12,n=>set('articleCount',n))}</div>
            {text('Programs heading',value.programHeading,v=>set('programHeading',v))}{text('Guides heading',value.articleHeading,v=>set('articleHeading',v))}{text('Counselor heading',value.counselorHeading,v=>set('counselorHeading',v))}{text('Counselor introduction',value.counselorCopy,v=>set('counselorCopy',v))}
            <p className="text-xs text-muted-foreground">Featured institutions are a separate later feature. Edit other page sections, links and custom styles in the builder.</p>
        </fieldset>}
        {!templateSettingsSchema.safeParse(value).success&&<p role="alert" className="text-sm text-destructive">Check colors, public image URLs, text lengths and numeric limits before saving.</p>}
        {templateSettingsSchema.safeParse(value).success&&templateContrastIssues(value).map(issue=><p role="alert" key={issue} className="text-sm text-destructive">{issue}</p>)}
        {picker!==null&&<FilePickerDialog open onOpenChange={open=>{if(!open)setPicker(null);}} fileFilter="image" requirePublicUrl title="Choose hero image" onSelect={url=>{const slide={src:url,alt:'',focalX:50,focalY:50};const slides=[...value.hero.slides];slides[picker]={...(slides[picker]??slide),src:url};hero({slides});setPicker(null);}}/>}
    </div>;
}
