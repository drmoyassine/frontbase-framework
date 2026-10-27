import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {useBuilderStore} from '@/stores/builder';

export function LiveListMigration(){
    const [plan,setPlan]=useState<any>(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[path,setPath]=useState('/'),[loaded,setLoaded]=useState(false);
    async function run(mode:'preview'|'publish'){
        if(mode==='publish'&&(!plan||!loaded))return;
        if(useBuilderStore.getState().hasUnsavedChanges){setMessage('Save or discard open builder edits first.');return;}
        setBusy(true);setMessage('');
        try{
            const stateResponse=await fetch('/api/project/site-configuration/publication/state/',{credentials:'include'});if(!stateResponse.ok)throw Error('Site state unavailable');
            const state=await stateResponse.json(),baseHash=state.pointer?.hash;
            if(mode==='publish'&&baseHash!==plan.baseHash)throw Error('Published version changed. Preview again.');
            const response=await fetch('/api/project/live-list-migration/',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,baseHash,...(mode==='publish'?{planHash:plan.planHash}:{})})});
            const result=await response.json();if(!response.ok)throw Error(result.code||result.detail||'Conversion unavailable');
            if(mode==='preview'){setPlan(result);setPath('/');setLoaded(false);}
            else{
                setPlan(undefined);setMessage(`Live lists published at generation ${result.pointer.generation}. Draft design edits remain pending.`);
                // App initialization caches pages before the server-side conversion.
                // Refresh only when no new browser edits appeared during publication.
                if(!useBuilderStore.getState().hasUnsavedChanges)await useBuilderStore.getState().loadPagesFromDatabase(false,true);
            }
        }catch(error){setMessage(error instanceof Error?error.message:'Conversion stopped. Check current state before retrying.');}
        finally{setBusy(false);}
    }
    return <details className="rounded border p-4"><summary className="cursor-pointer text-sm font-medium">Use live views for existing catalog lists</summary><div className="mt-3 space-y-3 text-sm"><p>Creates live SELECT views for the existing approved routes and saved views in Data. Existing data is not copied. Article revision approval remains required. Preview prepares the views; publication converts only list bindings and preserves pending design edits.</p><Button disabled={busy} variant="outline" onClick={()=>void run('preview')}>Prepare live-list preview</Button>{plan&&<><ul>{plan.views.map((view:any)=><li key={view.collection}>{view.collection}: {view.total} records</li>)}</ul><select aria-label="Live-list preview page" value={path} onChange={event=>{setPath(event.target.value);setLoaded(false);}}>{plan.previews.map((page:any)=><option key={page.path} value={page.path}>{page.label}</option>)}</select><iframe title="Live-list site preview" src={'/api/project/site-configuration/publication/render/?'+new URLSearchParams({hash:plan.hash,path})} onLoad={()=>setLoaded(true)} className="h-[60vh] w-full border"/><div className="flex gap-2"><Button disabled={busy||!loaded} onClick={()=>void run('publish')}>Publish live lists</Button><Button disabled={busy} variant="outline" onClick={()=>setPlan(undefined)}>Close preview</Button></div></>}{message&&<p role="status">{message}</p>}</div></details>;
}
