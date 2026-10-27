import React, { useEffect, useMemo, useRef, useState } from 'react';
import { translationGenerationOptionsSchema, translationGenerationSettingsSchema, translationGenerationConfigurationSchema } from '@frontbase/edge-core/localization';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { translationModelCatalogSchema } from '@frontbase/edge-core/localization/batches';
import { TranslationPicker, type TranslationChoice } from './TranslationPicker';
import { translationLanguages } from './translationLanguages';

const endpoint = '/api/project/translation-generation/';
type Options = ReturnType<typeof translationGenerationOptionsSchema.parse>;
/** Reuses account references and revision-conflict semantics; never requests generation. */
export function TranslationGenerationForm() {
    const [options, setOptions] = useState<Options>(), [accountId, setAccount] = useState(''), [model, setModel] = useState('');
    const [source, setSource] = useState('en'), [targets, setTargets] = useState<string[]>(['ar']), [limit, setLimit] = useState('1024');
    const [catalog,setCatalog] = useState<{accountId:string; models:TranslationChoice[]; error:boolean; loading:boolean}>(), [catalogReload,setCatalogReload] = useState(0);
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
            setTargets(config?.targetLocales ?? ['ar']); setLimit(String(config?.maxOutputTokens ?? 1024)); setBlocked(false);
        } catch { if (current === generation.current) setMessage('Could not load AI settings. Reload to try again.'); }
        finally { if (current === generation.current) setBusy(false); }
    }
    useEffect(() => { void load(); return () => { generation.current++; }; }, []);
    const selected = options?.accounts.find(a => a.id === accountId);
    useEffect(()=>{
        if(!selected?.supported || blocked) return;
        let active=true; const controller=new AbortController(), requested=accountId;
        setCatalog({accountId:requested,models:[],error:false,loading:true});
        void (async()=>{try{
            const result=await fetch(`${endpoint}models/${encodeURIComponent(requested)}`,{credentials:'include',signal:controller.signal});
            if(!result.ok) throw Error(); const value=translationModelCatalogSchema.parse(await result.json());
            if(value.accountId!==requested) throw Error();
            if(active) setCatalog({accountId:requested,models:value.models.map(m=>({value:m.id,label:`${m.name}${m.name===m.id?'':` · ${m.id}`}${m.free?' · Free':''}`,keywords:[m.id,...m.free?['free']:[]]})),error:false,loading:false});
        }catch{if(active) setCatalog({accountId:requested,models:[],error:true,loading:false});}})();
        return ()=>{active=false;controller.abort();};
    },[accountId,selected?.supported,blocked,catalogReload]);
    const currentCatalog=catalog?.accountId===accountId?catalog:undefined;
    const models=currentCatalog?.models ?? [];
    const modelChoices=model && !models.some(m=>m.value===model)?[{value:model,label:`${model} · Saved selection (not in loaded catalog)`},...models]:models;
    const languages=useMemo(()=>translationLanguages([source,...targets]),[source,targets]);
    const parsed = translationGenerationConfigurationSchema.safeParse({ version: 1, accountId, model, sourceLocale: source,
        targetLocales: targets, promptVersion: 'plain-v1', maxOutputTokens: Number(limit) });
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
            <div><Label htmlFor="translation-ai-account">AI connection</Label><select id="translation-ai-account" className={inputClass} value={accountId} onChange={e => {setAccount(e.target.value);setModel('');}}>
                <option value="">Select a connected account</option>
                {accountId && !options?.accounts.some(a => a.id === accountId) && <option value={accountId} disabled>Saved account unavailable</option>}
                {options?.accounts.map(a => <option key={a.id} value={a.id} disabled={!a.supported}>{a.name}{a.supported ? '' : ' — unavailable for translation'}</option>)}
            </select></div>
            <div><Label htmlFor="translation-ai-model">Model</Label><TranslationPicker id="translation-ai-model" label="Model" choices={modelChoices} selected={model?[model]:[]} onChange={values=>setModel(values[0]??'')}
                disabled={busy||blocked||!selected?.supported||currentCatalog?.loading} placeholder={currentCatalog?.loading?'Loading models…':'Select a model'} />
                <p className="text-xs text-muted-foreground">Search the connected provider’s catalog by name or model ID. Chat Completions compatibility and current availability are checked when an authorized job runs.</p>
                {currentCatalog?.error && <p role="status" className="text-sm">Models could not be loaded. Your saved selection is retained.</p>}
                {selected?.supported && <Button type="button" variant="ghost" size="sm" disabled={busy||blocked||currentCatalog?.loading} onClick={()=>setCatalogReload(n=>n+1)}>Refresh models</Button>}
            </div>
            <div><Label htmlFor="translation-source-locale">Source language</Label><TranslationPicker id="translation-source-locale" label="Source language" choices={languages} selected={[source]} disabled={busy||blocked||!options}
                onChange={values=>{const next=values[0];if(next){setSource(next);setTargets(prior=>prior.filter(v=>v!==next));}}} /></div>
            <div><Label htmlFor="translation-target-locales">Target languages</Label><TranslationPicker id="translation-target-locales" label="Target languages" multiple choices={languages.map(l=>({...l,disabled:l.value===source||targets.length>=16&&!targets.includes(l.value)}))}
                selected={targets} disabled={busy||blocked||!options} onChange={setTargets} placeholder="Select target languages" /><p className="text-xs text-muted-foreground">Select up to 16 languages. The source language is excluded.</p></div>
            <div><Label htmlFor="translation-ai-limit">Maximum output tokens per request</Label><input id="translation-ai-limit" type="number" min={1} max={16384} className={inputClass} value={limit} onChange={e => setLimit(e.target.value)} /></div>
            <p className="text-sm text-muted-foreground">Use Jobs & advanced to review selected content and check host availability. This output limit is not a spending allowance. Supported connections: OpenAI and OpenRouter.</p>
            {selected?.provider === 'openrouter' && <p className="text-sm text-muted-foreground">Use an exact OpenRouter model ID, including :free for an available free variant. Free-model requests enforce zero prompt, completion and request pricing. Routing excludes providers that collect data and disables provider fallbacks; unavailable models fail without automatic retries. Availability and rate limits depend on OpenRouter.</p>}
        </fieldset>
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} variant="outline" onClick={() => void load()}>Reload AI settings</Button>
            <Button type="button" disabled={busy || blocked || !parsed.success || !selected?.supported} onClick={() => void save()}>Save AI settings</Button>
            <Button type="button" variant="outline" disabled={busy || blocked || !options?.configuration} onClick={() => void save(true)}>Clear AI selection</Button></div>
        <p role="status" className="text-sm">{message}</p>
    </CardContent></Card>;
}
