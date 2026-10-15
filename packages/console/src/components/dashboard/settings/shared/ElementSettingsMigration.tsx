import React,{useState} from 'react';
import {Button} from '@/components/ui/button';
import {useBuilderStore} from '@/stores/builder';

export function ElementSettingsMigration(){
    const [plan,setPlan]=useState<any>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const [candidate,setCandidate]=useState<any>(),[loaded,setLoaded]=useState(false),[path,setPath]=useState('/');
    async function capture(mode:'preview'|'publish'){
        if(mode==='publish'&&(!candidate||!loaded))return;
        setBusy(true);setMessage('');try{
            const active=await fetch('/api/project/site-configuration/publication/state/',{credentials:'include'});if(!active.ok)throw Error();
            const baseHash=(await active.json()).pointer?.hash;
            if(mode==='publish'&&baseHash!==candidate.expected.hash)throw Error();
            const response=await fetch('/api/project/element-settings-migration/capture/',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,baseHash,...(mode==='publish'?{hash:candidate.hash}:{})})});
            if(!response.ok)throw Error();const result=await response.json();
            if(mode==='preview'){setCandidate(result);setPath('/');setLoaded(false);}else{setCandidate(undefined);setMessage('Converted published layouts are now active. Saved authoring drafts were not published.');}
        }catch{setCandidate(undefined);setMessage('Published layouts changed or the conversion is unavailable. Preview again.');}finally{setBusy(false);}
    }
    async function preview(){setBusy(true);setMessage('');try{const response=await fetch('/api/project/element-settings-migration/',{credentials:'include'});if(!response.ok)throw Error();setPlan(await response.json());}catch{setMessage('Could not prepare the migration. Saved drafts are unchanged.');}finally{setBusy(false);}}
    async function apply(){if(!plan||plan.blocked.length)return;const state=useBuilderStore.getState();
        if(state.hasUnsavedChanges&&plan.plan.some((page:any)=>page.pageId===state.currentPageId)){setMessage('Save or discard the open page’s edits before applying this migration.');return;}
        setBusy(true);setMessage('');try{
            const active=await fetch('/api/project/site-configuration/publication/state/',{credentials:'include'});if(!active.ok||(await active.json()).pointer?.hash!==plan.baseHash)throw Error();
            const settings=await fetch('/api/project/site-configuration/',{credentials:'include'});if(!settings.ok||(await settings.json()).revision!==plan.configurationRevision)throw Error();
            for(const page of plan.plan){
                const response=await fetch(`/api/pages/${page.pageId}/changes/`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),expectedStateHash:page.expectedStateHash,patch:{layoutData:page.layoutData}})});
                if(!response.ok||(await response.json()).status!=='applied')throw Error();
            }
            setPlan(undefined);setMessage('Drafts migrated. Reload Settings to see the remaining global controls. Preview and publish a new site version to apply the public layouts.');
        }catch{setPlan(undefined);setMessage('Migration stopped. Some drafts may have been applied; preview again to reconcile their current state. Nothing was published.');}finally{setBusy(false);}
    }
    const previewUrl=candidate?`/api/project/site-configuration/publication/render/?hash=${candidate.hash}&path=${encodeURIComponent(path)}`:'';
    return <details className="rounded border p-4"><summary className="cursor-pointer text-sm font-medium">Move legacy template controls into page elements</summary><div className="mt-3 space-y-3 text-sm"><p>Copies saved browsing and homepage values into their elements, and converts Explore into one standard Repeater with Block Versions. Existing published content stays active.</p><Button variant="outline" disabled={busy} onClick={()=>void preview()}>Preview element migration</Button>{plan&&<><ul>{plan.plan.map((page:any)=><li key={page.pageId}>{page.name}</li>)}</ul>{plan.blocked.length>0?<p role="alert">These authoring pages must be drafts: {plan.blocked.join(', ')}</p>:<Button disabled={busy||!plan.plan.length} onClick={()=>void apply()}>Apply to saved drafts</Button>}{!plan.plan.length&&<p>Page elements already own these settings.</p>}</>}
        <div className="space-y-3 border-t pt-3"><p>Convert the currently published layouts separately. This preserves published records and excludes any unrelated draft edits.</p><Button disabled={busy} variant="outline" onClick={()=>void capture('preview')}>Preview published-layout conversion</Button>{candidate&&<><select aria-label="Converted preview page" value={path} onChange={event=>{setPath(event.target.value);setLoaded(false);}}>{candidate.previews.map((preview:any)=><option key={preview.path} value={preview.path}>{preview.label}</option>)}</select><iframe title="Converted site preview" src={previewUrl} onLoad={()=>setLoaded(true)} className="h-[60vh] w-full border"/><Button disabled={busy||!loaded} onClick={()=>void capture('publish')}>Publish converted layouts</Button></>}</div>{message&&<p role="status">{message}</p>}</div></details>;
}
