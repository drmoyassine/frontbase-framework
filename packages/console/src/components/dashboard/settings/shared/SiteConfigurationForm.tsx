import React, { useEffect, useRef, useState } from 'react';
import { directoryConfigurationIssues, siteConfigurationDraftSchema, type DirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { DirectoryConfigurationPanel } from '@/components/builder/directory/DirectoryConfigurationPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const endpoint = '/api/project/site-configuration/';
export function SiteConfigurationForm() {
    const [configuration, setConfiguration] = useState<DirectoryConfiguration>();
    const [revision, setRevision] = useState<number | null>(null);
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState('');
    const [conflict, setConflict] = useState(false);
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
            setConfiguration(body.draft?.configuration); setRevision(body.revision); setConflict(false); setMessage('');
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
            setRevision(body.revision); setMessage('Shared settings saved. Pages and live publication are not activated.');
        } catch { setMessage('Could not save shared settings. Your edits are retained.'); }
        finally { setPending(false); }
    }
    return <Card><CardHeader><CardTitle>Shared directory settings</CardTitle><CardDescription>Project-wide authoring settings. Existing page settings remain separate until page linking is implemented.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
            <fieldset disabled={pending || revision === null}><DirectoryConfigurationPanel persistenceScope="site" value={configuration} onChange={setConfiguration} /></fieldset>
            <div className="flex gap-3"><Button disabled={pending || revision === null || !configuration || conflict || directoryConfigurationIssues(configuration).length > 0} onClick={() => void save()}>Save shared settings</Button>
                <Button variant="outline" disabled={pending} onClick={() => void load()}>Reload saved settings (discard edits)</Button></div>
            {revision !== null && <p className="text-sm text-muted-foreground">Saved revision: {revision}</p>}
            {message && <p role="status">{message}</p>}
        </CardContent></Card>;
}
