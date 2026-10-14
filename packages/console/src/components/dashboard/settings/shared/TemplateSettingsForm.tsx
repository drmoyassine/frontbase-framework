import React, { useEffect, useRef, useState } from 'react';
import { createEducationLanding, defaultTemplateSettings, readLandingSettings, templateSettingsSchema, templateContrastIssues, type TemplateSettings } from '@frontbase/edge-core/directory/configuration';
import type { PageLayoutData } from '@frontbase/edge-core';
import { TemplateSettingsEditor } from '@/components/builder/directory/TemplateSettingsEditor';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Home={id:string;layoutData:PageLayoutData};
export function TemplateSettingsForm() {
    const [home,setHome]=useState<Home>(),[settings,setSettings]=useState<TemplateSettings>(),[hash,setHash]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[conflict,setConflict]=useState(false),[candidate,setCandidate]=useState(''),[dirty,setDirty]=useState(false);
    const generation=useRef(0);
    async function load(){const current=++generation.current;setBusy(true);setMessage('');setHash('');setConflict(false);
        try{const pages=await fetch('/api/pages/',{credentials:'include'});if(!pages.ok)throw Error();const list=(await pages.json()).data;const matches=Array.isArray(list)?list.filter(p=>p.isHomepage===true):[];if(matches.length!==1)throw Error();
            const id=matches[0].id,stateUrl=`/api/pages/${id}/change-state/`;
            const first=await fetch(stateUrl,{credentials:'include'});if(!first.ok)throw Error();const before=await first.json();
            const page=await fetch(`/api/pages/${id}/`,{credentials:'include'});if(!page.ok)throw Error();const loaded=(await page.json()).data;
            const second=await fetch(stateUrl,{credentials:'include'});if(!second.ok)throw Error();const after=await second.json();if(before.hash!==after.hash)throw Error();
            if(current!==generation.current)return;setHome(loaded);setSettings(readLandingSettings(loaded.layoutData)??defaultTemplateSettings());setDirty(false);setCandidate('');
            if(!after.draft){setMessage('Unpublish the saved homepage in Pages before configuring its landing layout. This does not activate a site version.');return;}setHash(after.hash);
        }catch{if(current===generation.current)setMessage('Could not load a stable homepage draft. Check Pages and reload before saving.');}finally{if(current===generation.current)setBusy(false);}}
    useEffect(()=>{void load();return()=>{generation.current++;};},[]);
    async function save(){if(!home||!settings||!hash||conflict)return;setBusy(true);setMessage('');
        try{const root=home.layoutData.root;const isLanding=!!root?.directoryLanding;
            const layout=isLanding?{...home.layoutData,root:{...root,directoryLanding:{version:1,settings}}}:createEducationLanding(settings);
            const adjust=(nodes:PageLayoutData['content']):PageLayoutData['content']=>nodes.map(node=>({...node,...(node.props?.templateList&&node.props.directoryQuery?{props:{...node.props,directoryQuery:{...(node.props.directoryQuery as any),params:{...(node.props.directoryQuery as any).params,limit:node.props.templateList==='program'?settings.programCount:settings.articleCount}}}}:{}),...(node.children?{children:adjust(node.children)}:{})}));
            layout.content=adjust(layout.content);
            const result=await fetch(`/api/pages/${home.id}/changes/`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),expectedStateHash:hash,patch:{layoutData:layout,...(!isLanding?{name:'Education homepage'}:{})}})});
            if(result.status===409){setConflict(true);setMessage('The homepage changed. Your edits are retained; reload before saving again.');return;}
            if(!result.ok){setConflict(true);throw Error();}const body=await result.json();if(body.status!=='applied'){setConflict(true);throw Error();}
            await load();setMessage('Template settings saved in the homepage draft. Prepare and review a site version to publish.');
        }catch{setMessage('Save outcome needs review. Reload the homepage state before another save.');}finally{setBusy(false);}}
    async function prepare(){if(!home||!hash||dirty||conflict)return;setBusy(true);setMessage('');setCandidate('');try{
        const responses=await Promise.all([fetch('/api/project/site-configuration/',{credentials:'include'}),fetch('/api/project/site-configuration/publication/state/',{credentials:'include'})]);
        if(responses.some(r=>!r.ok))throw Error();const config=await responses[0]!.json(),state=await responses[1]!.json();if(!state.pointer?.hash||!config.draft?.revision)throw Error();
        const result=await fetch('/api/project/site-configuration/publication/prepare/',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({format:'chunked',expectedConfigurationRevision:config.draft.revision,pageIds:[],homepageBase:{baseHash:state.pointer.hash,homepageId:home.id,homepageStateHash:hash}})});
        if(!result.ok)throw Error();const prepared=await result.json();if(!/^[a-f0-9]{64}$/.test(prepared.hash))throw Error();setCandidate(prepared.hash);setMessage('Homepage version prepared from the reviewed published content. Reopen this version in Page settings to review and publish; nothing is activated.');
    }catch{setMessage('Could not prepare the homepage. Reload if the draft, settings or published content changed.');}finally{setBusy(false);}}
    return <Card><CardHeader><CardTitle>Appearance and homepage</CardTitle><CardDescription>Public appearance and hero controls. Saved with the homepage; approved article/data settings stay intact.</CardDescription></CardHeader><CardContent className="space-y-4">
        <fieldset disabled={busy||!hash||conflict}>{settings&&<TemplateSettingsEditor value={settings} onChange={next=>{setSettings(next);setDirty(true);setCandidate('');}}/>}</fieldset>
        <div className="flex flex-wrap gap-3"><Button disabled={busy||!hash||conflict||!settings||!templateSettingsSchema.safeParse(settings).success||templateContrastIssues(settings).length>0} onClick={()=>void save()}>{home?.layoutData.root?.directoryLanding?'Save template settings':'Create homepage landing layout'}</Button><Button variant="outline" disabled={busy} onClick={()=>void load()}>Reload saved settings</Button></div>
        {home&&<a className="text-sm underline" href={`/frontbase-admin/builder/${home.id}`}>Open homepage in builder</a>}
        {home?.layoutData.root?.directoryLanding&&<Button variant="outline" disabled={busy||!hash||conflict||dirty} onClick={()=>void prepare()}>Prepare homepage version</Button>}
        {candidate&&<div className="space-y-2"><code className="block select-all break-all text-xs">{candidate}</code><a className="underline" href={`/api/project/site-configuration/publication/render/?hash=${candidate}&path=%2F`} target="_blank" rel="noopener noreferrer">Open private homepage preview</a></div>}
        {message&&<p role="status">{message}</p>}
    </CardContent></Card>;
}
