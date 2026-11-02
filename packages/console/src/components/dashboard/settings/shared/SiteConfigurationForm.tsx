import {RecordIdentityFields,type RecordIdentityRole} from '@/components/builder/directory/RecordIdentityFields';
import React, { useEffect, useRef, useState } from 'react';
import { directoryConfigurationIssues, siteConfigurationDraftSchema, type DirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { DirectoryConfigurationPanel } from '@/components/builder/directory/DirectoryConfigurationPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const endpoint = '/api/project/site-configuration/';
export function SiteConfigurationForm({section='all', onSaved,identityRole,onDirtyChange}: {section?: 'all'|'site'|'data'; onSaved?:()=>void;identityRole?:RecordIdentityRole;onDirtyChange?:(dirty:boolean)=>void}) {
    const [initialSite, setInitialSite] = useState<Partial<DirectoryConfiguration['site']>>({});
    const [configuration, setConfiguration] = useState<DirectoryConfiguration>();
    const [revision, setRevision] = useState<number | null>(null);
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState('');
    const [conflict, setConflict] = useState(false);
    const [elementBrowsing,setElementBrowsing]=useState(false);
    const [identityRolesInUrls,setIdentityRolesInUrls]=useState<string[]>([]);
    useEffect(()=>{
        if(section!=='data')return;
        let current=true;
        // Legacy sites without reusable layouts keep their existing field editor.
        fetch('/api/project/pages-workspace/',{credentials:'include'}).then(async response=>{
            if(!response.ok)return;const body=await response.json();
            if(!Array.isArray(body.entries))return;
            const roles=['institution','program','article'].filter(role=>body.entries.filter((entry:any)=>entry.kind==='layout'&&entry.role===role&&entry.pageId).length===1);
            if(current)setIdentityRolesInUrls(roles);
        }).catch(()=>{});
        return()=>{current=false;};
    },[section]);
    const [baseline,setBaseline]=useState<string|null>(null);
    const dirty=!!configuration&&baseline!==null&&JSON.stringify(configuration)!==baseline;
    useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
    const loadGeneration = useRef(0);
    async function load() {
        const generation = ++loadGeneration.current;
        setPending(true);
        try {
            const response = await fetch(endpoint, { credentials: 'include' });
            if (!response.ok) throw new Error();
            const body = await response.json();
            if (body.draft !== null) {
                const draft = siteConfigurationDraftSchema.parse(body.draft);
                if (body.revision !== draft.revision) throw new Error();
            } else if (body.revision !== 0) throw new Error();
            if (generation !== loadGeneration.current) return;
            if (!body.draft) {
                const projectResponse = await fetch('/api/project/', { credentials: 'include' });
                if (!projectResponse.ok) throw new Error();
                const project = await projectResponse.json();
                if (generation !== loadGeneration.current) return;
                setInitialSite(project.siteIdentity || { name: project.name || '', origin: project.appUrl || project.app_url || '', locale: 'en' });
            }
            setConfiguration(body.draft?.configuration); setBaseline(JSON.stringify(body.draft?.configuration??null)); setElementBrowsing(body.elementBrowsing===true);setRevision(body.revision); setConflict(false); setMessage('');
        } catch { if (generation === loadGeneration.current) { setRevision(null); setMessage('Could not load shared settings. Reload before saving.'); } }
        finally { if (generation === loadGeneration.current) setPending(false); }
    }
    useEffect(() => { void load(); return () => { loadGeneration.current++; }; }, []);
    async function save() {
        if (revision === null || !configuration || conflict) return;
        setPending(true); setMessage('');
        try {
            const response = await fetch(endpoint, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ schemaVersion: 1, expectedRevision: revision, configuration }) });
            if (response.status === 409) { setConflict(true); setMessage('Another editor saved changes. Your edits are retained; reload to use the saved version.'); return; }
            if (!response.ok) { setMessage(response.status === 403 ? 'You cannot save these settings or the selected datasource is unavailable.' : 'Could not save shared settings. Check the configuration and try again.'); return; }
            const body = await response.json(); const draft = siteConfigurationDraftSchema.parse(body.draft);
            if (body.revision !== draft.revision || body.revision !== revision + 1) throw new Error();
            setConfiguration(draft.configuration);setBaseline(JSON.stringify(draft.configuration));setRevision(body.revision); setMessage('Shared settings saved. Pages and live publication are not activated.'); onSaved?.();
        } catch { setMessage('Could not save shared settings. Your edits are retained.'); }
        finally { setPending(false); }
    }
    return <Card><CardHeader><CardTitle>{identityRole?'Record identity and URLs':section==='data'?'Collection mappings and publication scope':section==='site'?'Shared routes':'Directory setup'}</CardTitle><CardDescription>Shared across linked pages. Site identity is managed in General. Saving updates authoring settings; prepare and review a site version in the builder to publish.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
            <fieldset disabled={pending || revision === null}>{identityRole?(configuration?<RecordIdentityFields configuration={configuration} role={identityRole} onChange={setConfiguration}/>:<p>Install or initialize the shared template configuration first.</p>):<DirectoryConfigurationPanel identityRolesInUrls={identityRolesInUrls} section={section} persistenceScope="site" hideIdentity elementBrowsing={elementBrowsing} initialSite={initialSite} value={configuration} onChange={setConfiguration} />}</fieldset>
            <div className="flex gap-3"><Button disabled={pending || revision === null || !configuration || conflict || directoryConfigurationIssues(configuration).length > 0} onClick={() => void save()}>Save shared settings</Button>
                <Button variant="outline" disabled={pending} onClick={() => void load()}>Reload saved settings (discard edits)</Button></div>
            {revision !== null && <p className="text-sm text-muted-foreground">Saved revision: {revision}</p>}
            {message && <p role="status">{message}</p>}
        </CardContent></Card>;
}
