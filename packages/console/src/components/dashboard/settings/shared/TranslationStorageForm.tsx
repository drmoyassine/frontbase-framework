import React, { useEffect, useRef, useState } from 'react';
import { translationStorageOptionsSchema, translationStorageSettingsSchema, type TranslationStorageConfiguration } from '@frontbase/edge-core/localization';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';

const endpoint = '/api/project/translation-storage/';
type Options = ReturnType<typeof translationStorageOptionsSchema.parse>;
/** References existing connected credentials; browser never receives URLs, keys or account config. */
export function TranslationStorageForm() {
    const [options, setOptions] = useState<Options>();
    const [mode, setMode] = useState<'same' | 'choose'>('choose');
    const [datasourceId, setDatasourceId] = useState('');
    const [format, setFormat] = useState<TranslationStorageConfiguration['endpoint']>('supabase');
    const [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false), [message, setMessage] = useState('');
    const generation = useRef(0);
    async function load() {
        const current = ++generation.current; setBusy(true); setBlocked(true); setMessage('');
        try {
            const result = await fetch(endpoint, { credentials: 'include' }); if (!result.ok) throw Error();
            const next = translationStorageOptionsSchema.parse(await result.json());
            if (current !== generation.current) return;
            const id = next.configuration?.datasourceId ?? next.contentDatasourceId ?? '';
            setOptions(next); setDatasourceId(id); setFormat(next.configuration?.endpoint ?? 'supabase');
            setMode(id && id === next.contentDatasourceId ? 'same' : 'choose'); setBlocked(false);
        } catch { if (current === generation.current) setMessage('Could not load translation storage. Reload to try again.'); }
        finally { if (current === generation.current) setBusy(false); }
    }
    useEffect(() => { void load(); return () => { generation.current++; }; }, []);
    const selectedId = mode === 'same' ? options?.contentDatasourceId ?? '' : datasourceId;
    const selected = options?.datasources.find(source => source.id === selectedId);
    const valid = !!selected?.supported;
    const selection = (): TranslationStorageConfiguration => ({ version: 1, datasourceId: selectedId, endpoint: format, namespace: 'translations' });
    const changed = () => setMessage('');
    async function check() {
        if (!valid || busy || blocked) return;
        setBusy(true); setMessage('');
        try {
            const result = await fetch(`${endpoint}check/`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(selection()) });
            if (!result.ok) throw Error();
            const body = await result.json(); if (body.status !== 'protocol-verified' || body.readOnly !== true || body.writePermissionsVerified !== false) throw Error();
            setMessage('Connection and translation protocol verified. This read-only check does not verify write permissions.');
        } catch { setMessage('Connection check failed. Check the datasource credentials and installed translations protocol.'); }
        finally { setBusy(false); }
    }
    async function save(clear = false) {
        if (!options || blocked || busy || (!clear && !valid)) return;
        setBusy(true); setMessage('');
        try {
            const result = await fetch(endpoint, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ expectedRevision: options.revision, configuration: clear ? null : selection() }) });
            if (result.status === 409) { setBlocked(true); setMessage('Another editor changed storage settings. Your selection is retained; reload before saving.'); return; }
            if (!result.ok) throw Error();
            const next = translationStorageSettingsSchema.parse(await result.json());
            if (next.revision !== options.revision + 1) throw Error();
            setOptions({ ...options, ...next });
            setMessage(clear ? 'Storage selection cleared. Existing translations are preserved.' : 'Translation storage saved. Existing translations have not been moved.');
        } catch { setBlocked(true); setMessage('Save outcome needs review. Your selection is retained; reload before retrying.'); }
        finally { setBusy(false); }
    }
    const selectClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
    return <Card><CardHeader><CardTitle>Translation storage</CardTitle><CardDescription>Keep translations alongside your content or choose another connected datasource.</CardDescription></CardHeader><CardContent className="space-y-4">
        <fieldset disabled={busy || blocked || !options} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="translation-storage-location">Storage location</Label><select id="translation-storage-location" className={selectClass} value={mode} onChange={e => { setMode(e.target.value as 'same' | 'choose'); changed(); }}>
                <option value="same" disabled={!options?.contentDatasourceId}>Use the content datasource</option><option value="choose">Choose a datasource</option>
            </select></div>
            {mode === 'same' ? <p>{selected?.name ?? 'The content datasource is unavailable.'}</p> : <div className="space-y-2"><Label htmlFor="translation-datasource">Translation datasource</Label><select id="translation-datasource" className={selectClass} value={datasourceId} onChange={e => { setDatasourceId(e.target.value); changed(); }}>
                <option value="">Select a datasource</option>
                {datasourceId && !options?.datasources.some(s => s.id === datasourceId) && <option value={datasourceId} disabled>Saved datasource unavailable</option>}
                {options?.datasources.map(s => <option key={s.id} value={s.id} disabled={!s.supported}>{s.name}{s.id === options.contentDatasourceId ? ' (content datasource)' : ''}{s.supported ? '' : ' — translation adapter unavailable'}</option>)}
            </select></div>}
            <div className="space-y-2"><Label htmlFor="translation-endpoint">Connection format</Label><select id="translation-endpoint" className={selectClass} value={format} onChange={e => { setFormat(e.target.value as TranslationStorageConfiguration['endpoint']); changed(); }}>
                <option value="supabase">Supabase Data API</option><option value="postgrest">Native PostgREST</option>
            </select></div>
        </fieldset>
        <p className="text-sm text-muted-foreground">Schema: <strong>translations</strong>. Credentials stay in the connected datasource. <Link to="/data-studio/datasources" className="underline">Manage datasources</Link>.</p>
        <p className="text-sm text-muted-foreground">The current adapter supports Supabase and native PostgREST connections. The translation SQL protocol must already be installed by an administrator. Checking or saving does not create tables, move translations or enable AI generation.</p>
        {selected && !selected.supported && <p role="alert">This datasource does not have a verified HTTP translation adapter. Choose a supported connection.</p>}
        <div className="flex flex-wrap gap-3">
            <Button onClick={() => void check()} variant="outline" disabled={busy || blocked || !valid}>Check connection</Button>
            <Button onClick={() => void save()} disabled={busy || blocked || !valid}>Save storage selection</Button>
            <Button onClick={() => void save(true)} variant="outline" disabled={busy || blocked || !options?.configuration}>Clear selection</Button>
            <Button onClick={() => void load()} variant="outline" disabled={busy}>Reload storage</Button>
        </div>
        {message && <p role="status">{message}</p>}
    </CardContent></Card>;
}
