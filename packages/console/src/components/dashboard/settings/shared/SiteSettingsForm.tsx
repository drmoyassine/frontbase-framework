import React, {useEffect, useRef, useState} from 'react';
import {directoryConfigurationSchema, siteConfigurationDraftSchema, type DirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {Card, CardHeader, CardTitle, CardDescription, CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {FilePickerDialog} from '@/components/dashboard/FileBrowser/FilePickerDialog';
import {TranslationPicker} from './TranslationPicker';
import {translationLanguages} from './translationLanguages';

type Identity=Pick<DirectoryConfiguration['site'],'name'|'origin'|'locale'>;
type Branding={logoUrl:string;faviconUrl:string;description:string};
const identitySchema=directoryConfigurationSchema.shape.site.omit({destination:true});
const endpoint='/api/project/site-configuration/';
const sameIdentity=(a:Identity,b:Identity)=>a.name===b.name&&a.origin===b.origin&&a.locale===b.locale;

/** One authoring form; retain the existing configuration and project API boundaries. */
export function SiteSettingsForm(){
    const [identity,setIdentity]=useState<Identity>({name:'',origin:'',locale:'en'});
    const [branding,setBranding]=useState<Branding>({logoUrl:'',faviconUrl:'',description:''});
    const [saved,setSaved]=useState<{identity:Identity;branding:Branding;projectName:string}>();
    const [configuration,setConfiguration]=useState<DirectoryConfiguration>();
    const [revision,setRevision]=useState<number|null>(null);
    const [busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[message,setMessage]=useState('');
    const [picker,setPicker]=useState<'logoUrl'|'faviconUrl'>();
    const generation=useRef(0);
    async function load(){
        const current=++generation.current;setBusy(true);setRevision(null);setMessage('');
        try{
            const responses=await Promise.all([fetch(endpoint,{credentials:'include'}),fetch('/api/project/',{credentials:'include'})]);
            if(responses.some(r=>!r.ok))throw Error();
            const [body,project]=await Promise.all(responses.map(r=>r.json()));
            const draft=body.draft===null?undefined:siteConfigurationDraftSchema.parse(body.draft);
            if(body.revision!==(draft?.revision??0))throw Error();
            const source=draft?.configuration.site??project.siteIdentity??{name:project.name,origin:project.appUrl??project.app_url,locale:'en'};
            const next={name:typeof source.name==='string'?source.name:'',origin:typeof source.origin==='string'?source.origin:'',locale:typeof source.locale==='string'?source.locale:'en'};
            const assets={logoUrl:project.logoUrl??'',faviconUrl:project.faviconUrl??'',description:project.description??''};
            if(current!==generation.current)return;
            setIdentity(next);setBranding(assets);setSaved({identity:next,branding:assets,projectName:project.name??''});
            setConfiguration(draft?.configuration);setRevision(body.revision);setBlocked(false);
        }catch{if(current===generation.current)setMessage('Could not load site settings. Reload before saving.');}
        finally{if(current===generation.current)setBusy(false);}
    }
    useEffect(()=>{void load();return()=>{generation.current++;};},[]);
    const dirty=!!saved&&(!sameIdentity(identity,saved.identity)||identity.name!==saved.projectName||JSON.stringify(branding)!==JSON.stringify(saved.branding));
    async function save(){
        if(revision===null||blocked||busy||!dirty||!identitySchema.safeParse(identity).success)return;
        setBusy(true);setMessage('');let identityWritten=false;
        try{
            // Also check revision for branding-only edits, so a stale site name is never copied into project metadata.
            const check=await fetch(endpoint,{credentials:'include'});if(!check.ok)throw Error();
            const latest=await check.json();
            if(latest.revision!==revision||(latest.draft===null)!==!configuration){setBlocked(true);setMessage('Site settings changed in another editor. Your edits are retained; reload before saving.');return;}
            if(configuration&&!sameIdentity(identity,configuration.site)){
                const result=await fetch(endpoint,{method:'PUT',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({schemaVersion:1,expectedRevision:revision,configuration:{...configuration,site:{...configuration.site,...identity}}})});
                if(result.status===409){setBlocked(true);setMessage('Site settings changed in another editor. Your edits are retained; reload before saving.');return;}
                if(!result.ok)throw Error();
                identityWritten=true;
                const body=await result.json(),draft=siteConfigurationDraftSchema.parse(body.draft);
                if(draft.revision!==revision+1||body.revision!==draft.revision)throw Error();
                setConfiguration(draft.configuration);setRevision(draft.revision);
            }
            const result=await fetch('/api/project/',{method:'PUT',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({name:identity.name,siteIdentity:identity,...branding})});
            if(!result.ok)throw Error();
            const project=await result.json();
            if(project.name!==identity.name||!identitySchema.safeParse(project.siteIdentity).success)throw Error();
            setSaved({identity:{...identity},branding:{...branding},projectName:identity.name});
            setMessage(configuration?'Site settings saved. Identity changes require site preparation and publication; branding is saved to the project.':'Site settings saved.');
        }catch{
            setBlocked(true);
            setMessage(identityWritten?'Site identity was saved, but the remaining save needs review. Your edits are retained. Reload to reconcile before retrying.':'Save outcome needs review. Your edits are retained; reload before retrying.');
        }finally{setBusy(false);}
    }
    return <Card className="max-w-4xl"><CardHeader><CardTitle>Site settings</CardTitle><CardDescription>Your site name, address, language and branding.</CardDescription></CardHeader><CardContent className="space-y-6">
        <fieldset disabled={busy||blocked||revision===null} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="site-name">Site name</Label><Input id="site-name" value={identity.name} onChange={e=>setIdentity({...identity,name:e.target.value})}/></div>
                <div className="space-y-2"><Label htmlFor="site-language">Default language</Label><TranslationPicker id="site-language" label="Default language" choices={translationLanguages(identity.locale?[identity.locale]:[])} selected={identity.locale?[identity.locale]:[]} disabled={busy||blocked||revision===null} onChange={values=>setIdentity({...identity,locale:values[0]??''})}/></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="site-origin">Canonical site URL</Label><Input id="site-origin" type="url" value={identity.origin} onChange={e=>setIdentity({...identity,origin:e.target.value})}/><p className="text-xs text-muted-foreground">The public HTTPS address used by search engines. Preview and deployment addresses are managed separately.</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">{(['logoUrl','faviconUrl'] as const).map(key=><div key={key} className="space-y-2 rounded border p-4">
                <Label htmlFor={'site-'+key}>{key==='logoUrl'?'Logo':'Favicon'}</Label>
                {branding[key]&&<img src={branding[key]} alt={key==='logoUrl'?'Logo preview':'Favicon preview'} className="h-12 max-w-32 object-contain"/>}
                <Input id={'site-'+key} placeholder="Image URL" value={branding[key]} onChange={e=>setBranding({...branding,[key]:e.target.value})}/>
                <div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>setPicker(key)}>Choose {key==='logoUrl'?'logo':'favicon'}</Button>{branding[key]&&<Button type="button" variant="ghost" onClick={()=>setBranding({...branding,[key]:''})}>Remove {key==='logoUrl'?'logo':'favicon'}</Button>}</div>
            </div>)}</div>
            <details><summary className="cursor-pointer font-medium">Additional details</summary><div className="mt-3 space-y-2"><Label htmlFor="site-description">Description</Label><Textarea id="site-description" rows={2} value={branding.description} onChange={e=>setBranding({...branding,description:e.target.value})}/><p className="text-xs text-muted-foreground">Project notes. Configure page SEO in the builder.</p></div></details>
        </fieldset>
        <p className="text-sm text-muted-foreground">Contact buttons are configured in <a className="underline" href="/frontbase-admin/menus">Menus</a>. Manage additional languages in <a className="underline" href="/frontbase-admin/settings?tab=translations">Translations</a>.</p>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">About publishing identity changes</summary><p className="mt-2">Changes to the canonical URL or language can require renewed content approvals. Prepare and review a site version before publishing. Changing these settings does not change your deployment address.</p></details>
        <div className="flex flex-wrap items-center gap-3"><Button disabled={busy||blocked||revision===null||!dirty||!identitySchema.safeParse(identity).success} onClick={()=>void save()}>{busy?'Saving…':'Save changes'}</Button><Button variant="outline" disabled={busy} onClick={()=>void load()}>Reload saved settings</Button>{dirty&&<span className="text-sm text-muted-foreground">Unsaved changes</span>}</div>
        {message&&<p role="status">{message}</p>}
        {picker&&<FilePickerDialog open fileFilter="image" requirePublicUrl title={picker==='logoUrl'?'Choose logo':'Choose favicon'} onOpenChange={open=>{if(!open)setPicker(undefined);}} onSelect={url=>{setBranding({...branding,[picker]:url});setPicker(undefined);}}/>}
    </CardContent></Card>;
}
