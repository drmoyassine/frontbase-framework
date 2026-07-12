import { useEffect, useState } from 'react';
import { api, ApiError, type PageSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BuilderCanvas } from '@/components/BuilderCanvas';
import { Layers } from 'lucide-react';

const EMPTY_LAYOUT = JSON.stringify(
    { root: {}, content: [{ id: 'h', type: 'Heading', props: { content: 'New page', level: 'h1' } }] },
    null, 2,
);

export function Pages() {
    const [pages, setPages] = useState<PageSummary[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [layout, setLayout] = useState('');
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [previewKey, setPreviewKey] = useState(0);
    const [editMode, setEditMode] = useState<'visual' | 'json'>('visual');

    const loadPages = () => api<{ pages: PageSummary[] }>('/pages')
        .then((r) => setPages(r.pages ?? []))
        .catch(() => setPages([]));

    useEffect(() => { loadPages(); }, []);

    const open = async (slug: string) => {
        setSelected(slug);
        setMsg(null);
        try {
            const { draft } = await api<{ draft?: { layoutData: string } }>(`/drafts/${encodeURIComponent(slug)}`);
            setLayout(draft?.layoutData ?? EMPTY_LAYOUT);
        } catch {
            setLayout(EMPTY_LAYOUT); // no draft yet → seed an editable layout
        }
    };

    const save = async (publish: boolean) => {
        if (!selected) return;
        // Validate JSON before sending (the engine stores layoutData verbatim).
        try { JSON.parse(layout); } catch (e) { setMsg({ kind: 'err', text: 'Invalid JSON: ' + (e as Error).message }); return; }
        setBusy(true); setMsg(null);
        try {
            await api(`/drafts/${encodeURIComponent(selected)}`, { method: 'PUT', body: JSON.stringify({ layoutData: layout }) });
            if (!publish) { setMsg({ kind: 'ok', text: 'Draft saved' }); }
            else {
                const r = await api<{ version: string }>(`/publish/${encodeURIComponent(selected)}`, { method: 'POST', body: JSON.stringify({ title: selected }) });
                setMsg({ kind: 'ok', text: `Published · version ${r.version}` });
                setPreviewKey((k) => k + 1); // refresh the preview
                await loadPages();
            }
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' });
        } finally { setBusy(false); }
    };

    const previewUrl = selected ? `${window.location.origin}/${selected === 'home' ? '' : selected}` : '';

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Pages</h1>
                <p className="text-muted-foreground">Edit draft layouts and publish to the edge.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
                <Card>
                    <CardHeader><CardTitle className="text-sm">Pages</CardTitle></CardHeader>
                    <CardContent className="space-y-1 p-3">
                        {pages.length === 0 && <p className="px-2 py-4 text-sm text-muted-foreground">No pages yet.</p>}
                        {pages.map((p) => (
                            <button key={p.slug} onClick={() => open(p.slug)}
                                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent ${selected === p.slug ? 'bg-accent font-medium' : ''}`}>
                                <span className="truncate">{p.slug}</span>
                                {(p.version ?? 0) > 0 && <Badge variant="secondary" className="text-[10px]">v{p.version}</Badge>}
                            </button>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle className="text-sm">{selected ? `Draft: ${selected}` : 'Select a page'}</CardTitle>
                        <div className="flex gap-2">
                            <div className="flex rounded-md border border-input overflow-hidden">
                                <button
                                    onClick={() => setEditMode('visual')}
                                    className={`px-3 py-1 text-xs ${editMode === 'visual' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                                >
                                    <Layers className="inline h-3 w-3 mr-1" />Visual
                                </button>
                                <button
                                    onClick={() => setEditMode('json')}
                                    className={`px-3 py-1 text-xs ${editMode === 'json' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                                >
                                    JSON
                                </button>
                            </div>
                            <Button size="sm" variant="secondary" disabled={!selected || busy} onClick={() => save(false)}>Save draft</Button>
                            <Button size="sm" disabled={!selected || busy} onClick={() => save(true)}>Publish</Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {msg && <div className={msg.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>{msg.text}</div>}
                        {editMode === 'visual' ? (
                            <BuilderCanvas
                                initialLayout={layout}
                                onLayoutChange={(json) => setLayout(json)}
                            />
                        ) : (
                            <textarea
                                disabled={!selected}
                                value={layout}
                                onChange={(e) => setLayout(e.target.value)}
                                spellCheck={false}
                                className="h-64 w-full rounded-md border border-input bg-background p-3 font-mono text-xs disabled:opacity-50"
                                placeholder="Layout JSON…"
                            />
                        )}
                        {selected && (
                            <div>
                                <div className="mb-1 text-xs text-muted-foreground">Published preview</div>
                                <iframe key={previewKey} title="preview" src={previewUrl} className="h-80 w-full rounded-md border" />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
