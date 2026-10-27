import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { translationGenerationConfigurationSchema } from '@frontbase/edge-core/localization';
import { translationRecordPreviewSchema } from '@frontbase/edge-core/localization/batches';
import { translationStateLabels, translationProvenanceLabels } from '@/components/dashboard/settings/shared/translationStateLabels';
import type { ViewAsset } from './SavedViewInspector';

type Preview = z.infer<typeof translationRecordPreviewSchema>;
const root = '/api/project/translation-batches/';
let generation = 0;
/** Live rows are addressed by their `id`; records without one cannot carry a stable translation identity. */
const keyed = (rows: Record<string, unknown>[]) => rows.filter(row => row.id !== undefined && row.id !== null);

/** Selected-field/per-record locale review inside the Data Inspector: the server re-reads every
 *  record through the owned connection, so this panel only addresses rows and edits translations. */
export function RecordLocaleReview({ view, rows }: { view: ViewAsset; rows: Record<string, unknown>[] }) {
    const [configuration, setConfiguration] = useState<z.infer<typeof translationGenerationConfigurationSchema> | null>(null);
    const [locale, setLocale] = useState('');
    const [field, setField] = useState('');
    const [preview, setPreview] = useState<Preview | null>(null);
    const [selected, setSelected] = useState('');
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        // A missing or inert global fetch must degrade to the hint, never crash the host inspector.
        void Promise.resolve(typeof fetch === 'function' ? fetch('/api/project/translation-generation/', { credentials: 'include', signal: controller.signal }) : undefined)
            .then(async response => {
                if (!response || !response.ok) throw Error();
                setConfiguration(translationGenerationConfigurationSchema.parse((await response.json()).configuration));
            }).catch(() => { if (!controller.signal.aborted) setConfiguration(null); });
        return () => controller.abort();
    }, []);
    const columns = useMemo(() => (view.visible_columns?.length ? view.visible_columns : view.column_order).filter(name => name !== 'id'), [view.visible_columns, view.column_order]);
    const selections = useMemo(() => field && configuration ? keyed(rows).map(row => ({
        kind: 'view-record' as const, viewId: view.id, endpoint: 'supabase' as const, keyColumn: 'id', keyValue: row.id as string | number, field })) : [],
        [field, configuration, rows, view.id]);
    useEffect(() => {
        const controller = new AbortController(), current = ++generation;
        setPreview(null); setSelected(''); setText(''); setError('');
        if (!locale || !selections.length) { setBusy(false); return () => controller.abort(); }
        setBusy(true);
        void fetch(root + 'record-preview/', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locale, selections }), signal: controller.signal }).then(async response => {
            if (!response.ok) throw Error();
            const value = translationRecordPreviewSchema.parse(await response.json());
            if (!controller.signal.aborted && current === generation) {
                setPreview(value);
                const first = value.fields[0];
                setSelected(first ? JSON.stringify(first.selection) : ''); setText(first?.translation ?? '');
            }
        }).catch(() => { if (!controller.signal.aborted) setError('Record translation preview is unavailable. Check language settings and reload.'); })
            .finally(() => { if (!controller.signal.aborted && current === generation) setBusy(false); });
        return () => controller.abort();
    }, [locale, selections, refresh]);
    const active = preview?.fields.find(item => JSON.stringify(item.selection) === selected);
    async function save() {
        if (!active || !preview || busy) return;
        const current = generation;
        setBusy(true); setError('');
        try {
            const response = await fetch(root + 'record-preview/save/', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selection: active.selection, locale, token: active.token, text }) });
            if (!response.ok) throw Error();
            const value = translationRecordPreviewSchema.parse(await response.json());
            if (current !== generation) return;
            const saved = value.fields[0];
            setPreview(saved ? { ...preview, fields: preview.fields.map(item => JSON.stringify(item.selection) === selected ? saved : item) } : preview);
            setText(saved?.translation ?? '');
        } catch { if (current === generation) setError('Translation was not confirmed. Reload the records; the source, settings or revision may have changed.'); }
        finally { if (current === generation) setBusy(false); }
    }
    if (!configuration) return <p className="rounded border p-3 text-sm">Choose source and target languages in Settings → Translations to review record translations here.</p>;
    return <section className="space-y-3" aria-label="Record translations">
        <div className="flex flex-wrap gap-3">
            <label>Preview language<select className="block border rounded bg-background p-2" value={locale} disabled={busy}
                onChange={event => setLocale(event.target.value)}>
                <option value="">Select language</option>
                {configuration.targetLocales.map(value => <option key={value} value={value}>{value}</option>)}
            </select></label>
            <label>Review field<select className="block border rounded bg-background p-2" value={field} disabled={busy || !locale}
                onChange={event => setField(event.target.value)}>
                <option value="">Select field</option>
                {columns.map(name => <option key={name} value={name}>{name}</option>)}
            </select></label>
            <button type="button" className="underline text-sm self-end" disabled={busy || !locale || !field} onClick={() => setRefresh(value => value + 1)}>Reload translations</button>
        </div>
        {error && <p role="alert" className="text-sm">{error}</p>}
        {locale && field && keyed(rows).length === 0 && <p className="text-sm">Records need a visible <code>id</code> column to carry a stable translation identity.</p>}
        {busy && !preview && <p role="status">Loading record translations…</p>}
        {preview && <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{preview.fields.length} of {selections.length} records reviewable on this page of results; source text stays untouched.</p>
            <ul className="space-y-2">
                {preview.fields.map(item => {
                    const key = JSON.stringify(item.selection);
                    const identity = String(item.selection.keyValue ?? item.selection.keyColumns?.map(part => part.value).join(', ') ?? '');
                    return <li key={key} className="rounded border p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" className="underline" disabled={busy} onClick={() => { setSelected(key); setText(item.translation ?? ''); }}>
                                Record {identity}
                            </button>
                            <span dir="auto" className="text-sm max-w-md truncate">{item.source}</span>
                            <span className="text-sm">{translationStateLabels[item.state]} · {item.provenance ? translationProvenanceLabels[item.provenance] : 'no translation'}</span>
                        </div>
                        {selected === key && <div className="space-y-2">
                            <label>Translation<textarea className="block w-full min-h-24 border rounded" dir="auto" lang={locale} value={text} maxLength={4000}
                                disabled={busy} onChange={event => setText(event.target.value)} /></label>
                            <button type="button" className="rounded bg-primary text-primary-foreground px-3 py-1 text-sm" disabled={busy || !text.trim() || text === item.translation}
                                onClick={() => void save()}>Save translation draft</button>
                            <p className="text-xs text-muted-foreground">Manual corrections are protected from generated replacements; the record itself never changes.</p>
                        </div>}
                    </li>;
                })}
            </ul>
            {preview.fields.length === 0 && <p className="text-sm">No reviewable plain-text values on this page of records.</p>}
        </div>}
    </section>;
}
