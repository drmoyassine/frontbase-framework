import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Cloud, Loader2, Plus, AlertTriangle, Search, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useEdgeEngines, edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { API_BASE } from './edgeConstants';

export function ImportCloudflareWorkers({ providerId }: { providerId: string }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [workers, setWorkers] = useState<any[]>([]);
    const [defaultDbId, setDefaultDbId] = useState<string | undefined>();
    const [error, setError] = useState<string | null>(null);
    const [importingId, setImportingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const { data: engines = [], refetch } = useEdgeEngines();

    // Build a set of already-imported worker identifiers for quick lookup
    const importedWorkerNames = useMemo(() => {
        const names = new Set<string>();
        for (const eng of engines) {
            // Match by URL (normalized) or by worker_name in engine_config
            if (eng.url) names.add(eng.url.replace(/\/$/, '').toLowerCase());
            const cfName = eng.engine_config?.worker_name;
            if (cfName) names.add(cfName.toLowerCase());
            // Also match by engine name pattern "Cloudflare: <worker_name>"
            const nameMatch = eng.name.match(/^Cloudflare:\s*(.+)$/i);
            if (nameMatch) names.add(nameMatch[1].trim().toLowerCase());
        }
        return names;
    }, [engines]);

    const isImported = (worker: any): boolean => {
        const nameKey = (worker.name || '').toLowerCase();
        const urlKey = (worker.url || '').replace(/\/$/, '').toLowerCase();
        return importedWorkerNames.has(nameKey) || importedWorkerNames.has(urlKey);
    };

    // Filter workers by search query
    const filteredWorkers = useMemo(() => {
        if (!searchQuery) return workers;
        const q = searchQuery.toLowerCase();
        return workers.filter(w => w.name.toLowerCase().includes(q));
    }, [workers, searchQuery]);

    const fetchWorkers = async () => {
        setLoading(true);
        setError(null);
        setSearchQuery('');
        try {
            // Also fetch default DB in case we want to attach it silently
            const dbRes = await fetch(`${API_BASE}/api/edge-databases/`).catch(() => null);
            if (dbRes && dbRes.ok) {
                const dbs = await dbRes.json();
                const def = dbs.find((d: any) => d.is_default);
                if (def) setDefaultDbId(def.id);
            }

            const res = await fetch(`${API_BASE}/api/cloudflare/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider_id: providerId }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.detail || data.error || 'Failed to fetch workers');
            setWorkers(data.workers || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async (worker: any) => {
        setImportingId(worker.name);
        try {
            const created = await edgeInfrastructureApi.createEngine({
                name: worker.name,
                provider: 'cloudflare',
                edge_provider_id: providerId,
                adapter_type: 'edge',
                url: worker.url,
                edge_db_id: defaultDbId || undefined,
                engine_config: { worker_name: worker.name },
                is_active: true,
            });
            // Auto-sync manifest to populate GPU model badges + capabilities
            if (created?.id) {
                try {
                    await fetch(`${API_BASE}/api/edge-engines/${created.id}/sync-manifest`, {
                        method: 'POST',
                    });
                } catch {
                    // Silent — engine might not have manifest (non-Frontbase worker)
                }
            }
            await refetch();
        } catch (e: any) {
            setError(e.message || 'Import failed');
        } finally {
            setImportingId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) fetchWorkers(); }}>
            <DialogTrigger asChild>
                <Button variant="secondary" size="sm" className="h-8">
                    <Cloud className="w-4 h-4 mr-2 text-muted-foreground" />
                    Fetch Engines
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle>Import Cloudflare Workers</DialogTitle>
                    <DialogDescription>Select an existing Worker to map as a Frontbase Edge Engine.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 py-2 min-h-0 flex-1">
                    {error && (
                        <Alert variant="destructive" className="py-2 px-3 shrink-0">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="text-sm">{error}</AlertDescription>
                        </Alert>
                    )}
                    {loading ? (
                        <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : workers.length === 0 ? (
                        <p className="text-sm text-center text-muted-foreground py-4">No workers found on this account.</p>
                    ) : (
                        <>
                            {/* Search */}
                            <div className="relative shrink-0">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <Input
                                    placeholder="Search workers..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="h-8 pl-8 text-xs"
                                />
                            </div>

                            {/* Scrollable worker list — inside the dialog panel */}
                            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                                {filteredWorkers.length === 0 ? (
                                    <p className="text-sm text-center text-muted-foreground py-4">No workers match your search.</p>
                                ) : (
                                    filteredWorkers.map(w => {
                                        const alreadyImported = isImported(w);
                                        return (
                                            <div
                                                key={w.name}
                                                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg ${alreadyImported ? 'bg-muted/50 opacity-60' : 'bg-card'}`}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-sm truncate">{w.name}</div>
                                                    <div className="text-xs text-muted-foreground truncate">{w.url}</div>
                                                </div>
                                                {alreadyImported ? (
                                                    <Badge variant="secondary" className="shrink-0 text-xs gap-1 bg-green-500/10 text-green-500">
                                                        <Check className="w-3 h-3" /> Imported
                                                    </Badge>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleImport(w)}
                                                        disabled={importingId === w.name}
                                                        className="shrink-0"
                                                    >
                                                        {importingId === w.name ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                                                        Import
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
