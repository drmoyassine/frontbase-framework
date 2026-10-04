/** Local review harness: the real Page Settings drawer and existing page-save client. */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';
import { PageSettingsDrawer } from '@/components/builder/PageSettingsDrawer';
import { useBuilderStore } from '@/stores/builder';
import '@/lib/api-client';
import type { Page } from '@/types/builder';

function App() {
    const [pages, setPages] = useState<Page[]>([]);
    const [selected, setSelected] = useState('');
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState('Loading saved pages…');
    const reload = async (id = selected) => {
        const response = await fetch('/api/pages/');
        if (!response.ok) throw new Error('Could not load pages');
        const result = await response.json();
        const next = result.data || [];
        setPages(next); const current = next.find((p: Page) => p.id === id) || next[0];
        if (current) { setSelected(current.id); useBuilderStore.setState({ pages: next, currentPageId: current.id }); }
        setStatus('Loaded from the local page database');
    };
    useEffect(() => { reload().catch(e => setStatus(e.message)); }, []);
    const duplicate = async () => {
        const current = pages.find(p => p.id === selected);
        if (!current) return;
        const layout = structuredClone(current.layoutData);
        if (layout?.root.directoryConfiguration) {
            const c = layout.root.directoryConfiguration;
            c.site.name = ''; c.site.destination = ''; c.site.origin = '';
            for (const collection of Object.values(c.collections) as any[]) collection.scope.value = '';
            // Avoid retaining the previous destination's rendered content in the new draft.
            layout.content = layout.content.filter(c => c.props.templateId !== 'education-directory' && c.props.className !== 'education-directory');
        }
        const response = await fetch('/api/pages/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'New destination draft', slug: 'directory-' + crypto.randomUUID(), layoutData: layout }) });
        if (!response.ok) throw new Error('Could not create destination draft');
        await reload((await response.json()).data.id); setOpen(true);
    };
    return <main className="mx-auto max-w-5xl space-y-6 p-8">
        <h1 className="text-3xl font-semibold">Frontbase directory configuration</h1>
        <p>This local review uses the actual Page Settings drawer and tenant-scoped page API. The datasource/schema choices are fixtures; no live Studygram connection or production publication is enabled.</p>
        <label className="block">Saved draft<select aria-label="Saved draft" className="ml-3 rounded border p-2" value={selected} onChange={e => { setSelected(e.target.value); useBuilderStore.setState({ pages, currentPageId: e.target.value }); }}>{pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="flex flex-wrap gap-3"><button className="rounded border p-3" onClick={() => setOpen(true)}>Open Page Settings</button><button className="rounded border p-3" onClick={() => reload().catch(e => setStatus(e.message))}>Reload saved settings</button><button className="rounded border p-3" onClick={() => duplicate().catch(e => setStatus(e.message))}>Create another destination</button><a className="rounded border p-3" href={`/preview/${selected}`} target="_blank" rel="noopener">Preview saved layout</a></div>
        <p role="status">{status}</p>
        <pre className="overflow-auto rounded border bg-white p-4 text-xs">{JSON.stringify(pages.find(p => p.id === selected)?.layoutData?.root.directoryConfiguration, null, 2)}</pre>
        <PageSettingsDrawer open={open} onOpenChange={next => { setOpen(next); if (!next) reload().catch(e => setStatus(e.message)); }} />
        <Toaster />
    </main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><TooltipProvider><App /></TooltipProvider></QueryClientProvider>);
