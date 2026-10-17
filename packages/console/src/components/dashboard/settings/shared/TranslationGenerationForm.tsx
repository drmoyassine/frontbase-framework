import React, { useEffect, useRef, useState } from 'react';
import { translationGenerationOptionsSchema, translationGenerationSettingsSchema, translationGenerationConfigurationSchema } from '@frontbase/edge-core/localization';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const endpoint = '/api/project/translation-generation/';
type Options = ReturnType<typeof translationGenerationOptionsSchema.parse>;
/** Reuses account references and revision-conflict semantics; never requests generation. */
export function TranslationGenerationForm() {
    const [options, setOptions] = useState<Options>(), [accountId, setAccount] = useState(''), [model, setModel] = useState('');
    const [source, setSource] = useState('en'), [targets, setTargets] = useState('ar'), [limit, setLimit] = useState('1024');
    const [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(true), [message, setMessage] = useState('');
    const generation = useRef(0);
    async function load() {
        const current = ++generation.current; setBusy(true); setBlocked(true); setMessage('');
        try {
            const result = await fetch(endpoint, { credentials: 'include' }); if (!result.ok) throw Error();
            const next = translationGenerationOptionsSchema.parse(await result.json());
            if (current !== generation.current) return;
            const config = next.configuration;
            setOptions(next); setAccount(config?.accountId ?? ''); setModel(config?.model ?? ''); setSource(config?.sourceLocale ?? 'en');
            setTargets(config?.targetLocales.join(', ') ?? 'ar'); setLimit(String(config?.maxOutputTokens ?? 1024)); setBlocked(false);
        } catch { if (current === generation.current) setMessage('Could not load AI settings. Reload to try again.'); }
        finally { if (current === generation.current) setBusy(false); }
    }
    useEffect(() => { void load(); return () => { generation.current++; }; }, []);
    const selected = options?.accounts.find(a => a.id === accountId);
    const parsed = translationGenerationConfigurationSchema.safeParse({ version: 1, accountId, model, sourceLocale: source,
        targetLocales: targets.split(',').map(s => s.trim()), promptVersion: 'plain-v1', maxOutputTokens: Number(limit) });
    async function save(clear = false) {
        if (!options || busy || blocked || (!clear && (!parsed.success || !selected?.supported))) return;
        setBusy(true); setMessage('');
        try {
            const result = await fetch(endpoint, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ expectedRevision: options.revision, configuration: clear ? null : parsed.success ? parsed.data : null }) });
            if (result.status === 409) { setBlocked(true); setMessage('Another editor changed AI settings. Your edits are retained; reload before saving.'); return; }
            if (!result.ok) throw Error();
            const next = translationGenerationSettingsSchema.parse(await result.json()); if (next.revision !== options.revision + 1) throw Error();
            setOptions({ ...options, ...next }); setMessage(clear ? 'AI selection cleared. Existing translations are preserved.' : 'AI settings saved. No content was sent to the provider.');
        } catch { setBlocked(true); setMessage('Save outcome needs review. Your edits are retained; reload before retrying.'); }
        finally { setBusy(false); }
    }
    const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
    return <Card><CardHeader><CardTitle>Translation AI</CardTitle><CardDescription>Select an existing connected account and model. Saving these settings does not generate translations.</CardDescription></CardHeader><CardContent className="space-y-4">
        <fieldset disabled={busy || blocked || !options} className="space-y-4">
            <div><Label htmlFor="translation-ai-account">AI connection</Label><select id="translation-ai-account" className={inputClass} value={accountId} onChange={e => setAccount(e.target.value)}>
                <option value="">Select a connected account</option>
                {accountId && !options?.accounts.some(a => a.id === accountId) && <option value={accountId} disabled>Saved account unavailable</option>}
                {options?.accounts.map(a => <option key={a.id} value={a.id} disabled={!a.supported}>{a.name}{a.supported ? '' : ' — unavailable for translation'}</option>)}
            </select></div>
            <div><Label htmlFor="translation-ai-model">Model ID</Label><input id="translation-ai-model" className={inputClass} value={model} maxLength={200} onChange={e => setModel(e.target.value)} /><p className="text-xs text-muted-foreground">Enter a text model supported by the connected account’s Chat Completions API. Model availability is checked only when an authorized job runs.</p></div>
            <div><Label htmlFor="translation-source-locale">Source language code</Label><input id="translation-source-locale" className={inputClass} value={source} onChange={e => setSource(e.target.value)} /></div>
            <div><Label htmlFor="translation-target-locales">Target language codes, separated by commas</Label><input id="translation-target-locales" className={inputClass} value={targets} onChange={e => setTargets(e.target.value)} /></div>
            <div><Label htmlFor="translation-ai-limit">Maximum output tokens per request</Label><input id="translation-ai-limit" type="number" min={1} max={16384} className={inputClass} value={limit} onChange={e => setLimit(e.target.value)} /></div>
            <p className="text-sm text-muted-foreground">Generation will become available after durable budget and batch controls are implemented. This output limit is not a spending allowance. The initial connection type is OpenAI; other providers remain unavailable.</p>
        </fieldset>
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} variant="outline" onClick={() => void load()}>Reload AI settings</Button>
            <Button type="button" disabled={busy || blocked || !parsed.success || !selected?.supported} onClick={() => void save()}>Save AI settings</Button>
            <Button type="button" variant="outline" disabled={busy || blocked || !options?.configuration} onClick={() => void save(true)}>Clear AI selection</Button></div>
        <p role="status" className="text-sm">{message}</p>
    </CardContent></Card>;
}
