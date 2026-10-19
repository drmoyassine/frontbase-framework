import React, { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { translationGenerationConfigurationSchema } from '@frontbase/edge-core/localization';
import { translationPagePreviewSchema } from '@frontbase/edge-core/localization/batches';
import { translationLanguages } from '../dashboard/settings/shared/translationLanguages';
import { TranslationPicker } from '../dashboard/settings/shared/TranslationPicker';
import { Button } from '@/components/ui/button';
import type { Page, ComponentData } from '@/types/builder';
import { useIframeCanvas } from './canvas/useIframeCanvas';
import { useSystemEdgeUrl } from './canvas/useSystemEdgeUrl';

type Preview = z.infer<typeof translationPagePreviewSchema>;
const root = '/api/project/translation-batches/page-preview/';
/** Project only fresh permitted fields onto a transient saved layout; never mutate the builder store. */
export function translatedPreviewPage(page: Page, preview: Preview, translate = true): Page {
    const byId = new Map(preview.fields.filter(field => translate && field.state === 'draft' && field.translation !== null).map(field => [field.selection.blockId, field]));
    const visit = (nodes: ComponentData[]): ComponentData[] => nodes.map(node => {
        const field = byId.get(node.id);
        return { ...node, props: field ? { ...node.props, [field.selection.field]: field.translation } : node.props,
            ...(node.children ? { children: visit(node.children) } : {}) };
    });
    const layout = preview.layout as Page['layoutData'];
    return { ...page, layoutData: { ...layout!, content: visit(layout!.content), root: { ...layout!.root } } };
}
export function localePreviewHtml(html: string, locale: string): string {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.documentElement.lang = locale;
    doc.documentElement.dir = /^(ar|fa|he|ur|ps|sd|ug|yi)(-|$)/i.test(locale) ? 'rtl' : 'ltr';
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
export function attachTranslationPreviewSelection(doc: Document, onSelectField?: (id: string) => void) {
    doc.addEventListener('click', event => {
        event.preventDefault(); event.stopImmediatePropagation();
        const node = (event.target as Element | null)?.closest('[id]');
        if (node?.id) onSelectField?.(node.id);
    }, true);
    doc.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
}
function TranslationCanvas({ page, locale, onSelectField }: { page: Page; locale: string; onSelectField?(id: string): void }) {
    const systemEdgeUrl = useSystemEdgeUrl();
    const { html, status, error } = useIframeCanvas(page, systemEdgeUrl, true);
    const srcDoc = useMemo(() => localePreviewHtml(html, locale), [html, locale]);
    return <div className="min-w-0 flex-1 overflow-auto bg-muted p-4">
        {error && <p role="alert">{error}</p>}
        {status === 'rendering' && <p role="status">Rendering translation preview…</p>}
        <iframe title="Translation draft preview" srcDoc={srcDoc} className="w-full min-h-[800px] border bg-white" sandbox="allow-same-origin allow-scripts"
            onLoad={event => { const frame = event.currentTarget; const doc = frame.contentDocument;
                if (doc) { frame.style.height = Math.max(800, doc.documentElement.scrollHeight) + 'px';
                    // Preview interactions cannot navigate, submit a form or edit the source page.
                    attachTranslationPreviewSelection(doc, onSelectField); }
            }} />
    </div>;
}
/** Separate editing surface unmounts source layout shortcuts/DnD; all saves are translation-only. */
export function TranslationPageWorkspace({ page, onClose }: { page: Page; onClose(): void }) {
    const [configuration, setConfiguration] = useState<z.infer<typeof translationGenerationConfigurationSchema> | null>(null);
    const [locale, setLocale] = useState('');
    const [preview, setPreview] = useState<Preview | null>(null);
    const [selected, setSelected] = useState('');
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const generation = useRef(0);
    useEffect(() => {
        const controller = new AbortController();
        void fetch('/api/project/translation-generation/', { credentials: 'include', signal: controller.signal }).then(async response => {
            if (!response.ok) throw Error();
            const config = translationGenerationConfigurationSchema.parse((await response.json()).configuration);
            if (!controller.signal.aborted) { setConfiguration(config); setLocale(config.targetLocales[0] ?? ''); }
        }).catch(() => { if (!controller.signal.aborted) setError('Choose source and target languages in Settings → Translations first.'); });
        return () => controller.abort();
    }, []);
    useEffect(() => {
        const controller = new AbortController(), current = ++generation.current;
        setPreview(null); setText(''); setError('');
        if (!locale || !configuration) { setBusy(false); return () => controller.abort(); }
        setBusy(true);
        void fetch(root + encodeURIComponent(page.id) + '/?locale=' + encodeURIComponent(locale === configuration.sourceLocale ? configuration.targetLocales[0] : locale), { credentials: 'include', signal: controller.signal }).then(async response => {
            if (!response.ok) throw Error();
            const value = translationPagePreviewSchema.parse(await response.json());
            if (value.pageId !== page.id || value.locale !== (locale === configuration.sourceLocale ? configuration.targetLocales[0] : locale)) throw Error();
            if (!controller.signal.aborted && current === generation.current) { setPreview(value); setSelected(value.fields[0]?.selection.blockId ?? ''); setText(value.fields[0]?.translation ?? ''); }
        }).catch(() => { if (!controller.signal.aborted) setError('Saved-page translation preview is unavailable. Check storage and reload.'); })
            .finally(() => { if (!controller.signal.aborted && current === generation.current) setBusy(false); });
        return () => controller.abort();
    }, [page.id, locale, configuration, refresh]);
    const field = preview?.fields.find(field => field.selection.blockId === selected);
    const projected = useMemo(() => preview ? translatedPreviewPage(page, preview, locale !== preview.sourceLocale) : null, [page, preview, locale]);
    async function save() {
        if (!field || !preview || busy) return;
        const current = generation.current;
        setBusy(true); setError('');
        try {
            const response = await fetch(root + 'field/', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selection: field.selection, locale, token: field.token, text }) });
            if (!response.ok) throw Error();
            const value = translationPagePreviewSchema.parse(await response.json());
            if (current !== generation.current || value.pageId !== page.id || value.locale !== locale) return;
            setPreview(value); setText(value.fields.find(item => item.selection.blockId === selected)?.translation ?? '');
        } catch { if (current === generation.current) { setError('Translation was not confirmed. Reload translations before editing again; source, settings or revision may have changed.'); setPreview(null); } }
        finally { if (current === generation.current) setBusy(false); }
    }
    return <section className="h-screen flex flex-col bg-background" aria-label="Page translations">
        <header className="flex flex-wrap items-center gap-3 border-b p-3">
            <Button onClick={onClose} disabled={busy}>Back to design</Button>
            <strong>{page.name} · Translation draft</strong>
            <TranslationPicker id="translation-preview-locale" label="Preview language" selected={locale ? [locale] : []} choices={translationLanguages(configuration ? [configuration.sourceLocale, ...configuration.targetLocales] : []).filter(item => configuration && [configuration.sourceLocale, ...configuration.targetLocales].includes(item.value))}
                onChange={values => setLocale(values[0] ?? '')} disabled={!configuration || busy} />
            <Button onClick={() => setRefresh(value => value + 1)} disabled={busy}>Reload translations</Button>
        </header>
        <p className="border-b px-4 py-2 text-sm">Private preview of saved Default page text. Missing/outdated fields use source text. Source editing is in Design; nothing here publishes or runs AI.</p>
        {error && <p role="alert" className="p-3">{error}</p>}
        <div className="flex min-h-0 flex-1">
            {projected ? <TranslationCanvas page={projected} locale={locale} onSelectField={id => { const next = preview?.fields.find(item => item.selection.blockId === id); if (next && !busy) { setSelected(id); setText(next.translation ?? ''); } }} /> : <p role="status" className="p-4">{busy ? 'Loading saved translations…' : 'Select a configured language to preview.'}</p>}
            {preview && locale !== preview.sourceLocale && <aside className="w-80 shrink-0 overflow-y-auto border-l p-4 space-y-3" aria-label="Translation field editor">
                <label>Text field<select className="block w-full" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setText(preview.fields.find(item => item.selection.blockId === event.target.value)?.translation ?? ''); }}>
                    {preview.fields.map(item => <option key={item.selection.blockId} value={item.selection.blockId}>{item.source.slice(0, 80)} · {item.state}</option>)}
                </select></label>
                {field ? <><p>Original ({preview.sourceLocale})</p><p dir="auto">{field.source}</p>
                    <p role="status">{field.state} · {field.provenance ?? 'no translation'}</p>
                    <label>Translation<textarea className="block w-full min-h-32 border rounded" dir="auto" lang={locale} value={text} maxLength={4000} disabled={busy} onChange={event => setText(event.target.value)} /></label>
                    <Button disabled={busy || !text.trim() || text === field.translation} onClick={() => void save()}>Save translation draft</Button>
                    <p className="text-xs">Manual corrections are protected from generated replacements. Save updates the preview; English stays unchanged.</p></> : <p>No supported Default plain-text fields on this saved page.</p>}
            </aside>}
        </div>
    </section>;
}
