import React, { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { translationGenerationConfigurationSchema } from '@frontbase/edge-core/localization';
import { translationPagePreviewSchema } from '@frontbase/edge-core/localization/batches';
import { translationLanguages } from '../dashboard/settings/shared/translationLanguages';
import { TranslationPicker } from '../dashboard/settings/shared/TranslationPicker';
import { TranslationBatchForm } from '../dashboard/settings/shared/TranslationBatchForm';
import { translationStateLabels, translationProvenanceLabels } from '../dashboard/settings/shared/translationStateLabels';
import { Button } from '@/components/ui/button';
import type { Page, ComponentData } from '@/types/builder';
import { useIframeCanvas } from './canvas/useIframeCanvas';
import { useSystemEdgeUrl } from './canvas/useSystemEdgeUrl';

type Preview = z.infer<typeof translationPagePreviewSchema>;
type Selection = Preview['fields'][number]['selection'];
const fieldKey = (selection: Selection) => JSON.stringify(selection);
const root = '/api/project/translation-batches/page-preview/';
/** Name of a Block Version alternative, wherever its node lives (Default tree or an override subtree). */
export function versionLabel(nodes: ComponentData[], blockId: string, versionId: string, inherited?: string): string {
    const fallback = inherited ?? versionId;
    for (const node of nodes) {
        if (node.id === blockId) return node.versions?.find(version => version.id === versionId)?.name ?? fallback;
        if (node.children) { const nested = versionLabel(node.children, blockId, versionId, inherited); if (nested !== fallback) return nested; }
        for (const version of node.versions ?? []) {
            const nested = version.overrides.children ? versionLabel(version.overrides.children, blockId, versionId, version.name) : versionId;
            if (nested !== versionId) return nested;
        }
    }
    return versionId;
}
/** Project only fresh permitted fields onto a transient saved layout; never mutate the builder store.
 *  Default-field drafts land on base props so alternatives inherit them; a version-owned draft lands
 *  inside that alternative's own overrides. */
export function translatedPreviewPage(page: Page, preview: Preview, translate = true): Page {
    const fresh = preview.fields.filter(field => translate && field.state === 'draft' && field.translation !== null);
    const byDefault = new Map(fresh.filter(field => !field.selection.versionId).map(field => [field.selection.blockId, field]));
    const byVersion = new Map(fresh.filter(field => field.selection.versionId).map(field => [field.selection.blockId + '\u0000' + field.selection.versionId, field]));
    const projectAlternative = (nodes: ComponentData[], versionId: string): ComponentData[] => nodes.map(child => {
        const field = byVersion.get(child.id + '\u0000' + versionId);
        return { ...child, props: field ? { ...child.props, [field.selection.field]: field.translation } : child.props,
            ...(child.children ? { children: projectAlternative(child.children, versionId) } : {}) };
    });
    const visit = (nodes: ComponentData[]): ComponentData[] => nodes.map(node => {
        const field = byDefault.get(node.id);
        let next: ComponentData = field ? { ...node, props: { ...node.props, [field.selection.field]: field.translation } } : node;
        if (next.versions?.length) {
            let versions = next.versions;
            for (const version of versions) {
                const owned = byVersion.get(next.id + '\u0000' + version.id);
                const children = version.overrides.children ? projectAlternative(version.overrides.children, version.id) : undefined;
                if (owned || children) versions = versions.map(item => item.id === version.id ? { ...item, overrides: {
                    ...item.overrides, ...(owned ? { props: { ...item.overrides.props, [owned.selection.field]: owned.translation } } : {}),
                    ...(children ? { children } : {}) } } : item);
            }
            next = { ...next, versions };
        }
        return { ...next, ...(next.children ? { children: visit(next.children) } : {}) };
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
function TranslationCanvas({ page, locale, force, onSelectField }: { page: Page; locale: string; force: Readonly<Record<string, string>>; onSelectField?(id: string): void }) {
    const systemEdgeUrl = useSystemEdgeUrl();
    const { html, status, error } = useIframeCanvas(page, systemEdgeUrl, true, force);
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
const stateLabel = translationStateLabels;
const provenanceLabel = translationProvenanceLabels;
/** Separate editing surface unmounts source layout shortcuts/DnD; all saves are translation-only. */
export function TranslationPageWorkspace({ page, onClose, onHomepage }: { page: Page; onClose(): void; onHomepage?(): void }) {
    const [configuration, setConfiguration] = useState<z.infer<typeof translationGenerationConfigurationSchema> | null>(null);
    const [locale, setLocale] = useState('');
    const [preview, setPreview] = useState<Preview | null>(null);
    const [selected, setSelected] = useState('');
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const [showGenerate, setShowGenerate] = useState(false);
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
            if (!controller.signal.aborted && current === generation.current) { setPreview(value); setSelected(value.fields[0] ? fieldKey(value.fields[0].selection) : ''); setText(value.fields[0]?.translation ?? ''); }
        }).catch(() => { if (!controller.signal.aborted) setError('Saved-page translation preview is unavailable. Check storage and reload.'); })
            .finally(() => { if (!controller.signal.aborted && current === generation.current) setBusy(false); });
        return () => controller.abort();
    }, [page.id, locale, configuration, refresh]);
    const field = preview?.fields.find(item => fieldKey(item.selection) === selected);
    const projected = useMemo(() => preview ? translatedPreviewPage(page, preview, locale !== preview.sourceLocale) : null, [page, preview, locale]);
    // The canvas renders the alternative of the field being edited; everything else resolves to Default.
    const force = useMemo(() => field?.selection.versionId ? { [field.selection.blockId]: field.selection.versionId } : {}, [field]);
    const needsAttention = preview?.fields.filter(item => item.state !== 'draft') ?? [];
    const generateSelections = useMemo(() => (preview?.fields ?? []).filter(item => item.state !== 'draft').map(item => item.selection).slice(0, 4), [preview]);
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
            setPreview(value); setText(value.fields.find(item => fieldKey(item.selection) === selected)?.translation ?? '');
        } catch { if (current === generation.current) { setError('Translation was not confirmed. Reload translations before editing again; source, settings or revision may have changed.'); setPreview(null); } }
        finally { if (current === generation.current) setBusy(false); }
    }
    return <section className="h-screen flex flex-col bg-background" aria-label="Page translations">
        <header className="flex flex-wrap items-center gap-3 border-b p-3">
            <Button onClick={onClose} disabled={busy}>Back to design</Button>
            <strong>{page.name} · Translation draft</strong>
            {onHomepage && <Button onClick={onHomepage} disabled={busy}>Publish homepage language</Button>}
            <TranslationPicker id="translation-preview-locale" label="Preview language" selected={locale ? [locale] : []} choices={translationLanguages(configuration ? [configuration.sourceLocale, ...configuration.targetLocales] : []).filter(item => configuration && [configuration.sourceLocale, ...configuration.targetLocales].includes(item.value))}
                onChange={values => setLocale(values[0] ?? '')} disabled={!configuration || busy} />
            <Button onClick={() => setRefresh(value => value + 1)} disabled={busy}>Reload translations</Button>
        </header>
        <p className="border-b px-4 py-2 text-sm">Private preview of saved page text, including Block Version alternatives. Missing/outdated fields use source text. Source editing is in Design; nothing here publishes or runs AI.</p>
        {error && <p role="alert" className="p-3">{error}</p>}
        <div className="flex min-h-0 flex-1">
            {projected ? <TranslationCanvas page={projected} locale={locale} force={force} onSelectField={id => { const next = preview?.fields.find(item => item.selection.blockId === id); if (next && !busy) { setSelected(fieldKey(next.selection)); setText(next.translation ?? ''); } }} /> : <p role="status" className="p-4">{busy ? 'Loading saved translations…' : 'Select a configured language to preview.'}</p>}
            {preview && locale !== preview.sourceLocale && <aside className="w-80 shrink-0 overflow-y-auto border-l p-4 space-y-3" aria-label="Translation field editor">
                {needsAttention.length > 0 && <p className="text-xs text-muted-foreground">{needsAttention.length} of {preview.fields.length} fields need attention (missing or outdated).</p>}
                <label>Text field<select className="block w-full" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setText(preview.fields.find(item => fieldKey(item.selection) === event.target.value)?.translation ?? ''); }}>
                    {preview.fields.map(item => <option key={fieldKey(item.selection)} value={fieldKey(item.selection)}>{item.source.slice(0, 60)} · {item.state}{item.selection.versionId ? ' · ' + versionLabel(preview.layout.content as ComponentData[], item.selection.blockId, item.selection.versionId) : ''}</option>)}
                </select></label>
                {field ? <><p>Original ({preview.sourceLocale})</p><p dir="auto">{field.source}</p>
                    <p role="status">{stateLabel[field.state]} · {field.provenance ? provenanceLabel[field.provenance] : 'no translation'}</p>
                    {field.selection.versionId && <p className="text-xs text-muted-foreground">Editing the “{versionLabel(preview.layout.content as ComponentData[], field.selection.blockId, field.selection.versionId)}” alternative; the canvas previews it while selected.</p>}
                    <label>Translation<textarea className="block w-full min-h-32 border rounded" dir="auto" lang={locale} value={text} maxLength={4000} disabled={busy} onChange={event => setText(event.target.value)} /></label>
                    <Button disabled={busy || !text.trim() || text === field.translation} onClick={() => void save()}>Save translation draft</Button>
                    <p className="text-xs">Manual corrections are protected from generated replacements. Save updates the preview; English stays unchanged.</p></> : <p>No supported Default plain-text fields on this saved page.</p>}
                <Button type="button" variant="outline" disabled={busy} onClick={() => setShowGenerate(value => !value)}>{showGenerate ? 'Hide AI generation review' : 'Generate or refine with AI'}</Button>
                {showGenerate && <section aria-label="AI generation review" className="space-y-2">
                    <p className="text-xs text-muted-foreground">The first four missing or outdated fields of this page are preselected below. Review, approve, and continue there; finished drafts appear back in this workspace after “Reload translations”.</p>
                    <TranslationBatchForm initialPageId={page.id} initialSelections={generateSelections} />
                </section>}
            </aside>}
        </div>
    </section>;
}
