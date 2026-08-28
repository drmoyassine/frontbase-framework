import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Download, Loader2, Search, Check, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    useEdgeEngines, useEdgeProviders, edgeInfrastructureApi,
} from '@/hooks/useEdgeInfrastructure';
import { timeAgo } from '@/hooks/useEdgeEngineActions';
import { API_BASE, PROVIDER_ICONS, KNOWN_EDGE_PROVIDERS } from './edgeConstants';

// Providers that support engine listing (subset of KNOWN_EDGE_PROVIDERS)
const LISTABLE_PROVIDERS = new Set(['cloudflare', 'supabase', 'deno', 'vercel', 'netlify']);

type SortField = 'name' | 'deployed_at' | 'created_at';
type SortDir = 'asc' | 'desc';

interface RemoteEngine {
    name: string;
    url: string;
    provider: string;
    deployed_at: string;
    created_at: string;
}

/** Controlled-optional: the toolbar's ImportEngineMenu drives `open`; internal
 *  state is the fallback when used uncontrolled. */
export function FetchEnginesDialog({ open: openProp, onOpenChange: onOpenChangeProp }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
} = {}) {
    const [openState, setOpenState] = useState(false);
    const open = openProp ?? openState;
    const [step, setStep] = useState<'pick' | 'list'>('pick');
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [selectedProvider, setSelectedProvider] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [engines, setEngines] = useState<RemoteEngine[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<SortField>('deployed_at');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
    const [importing, setImporting] = useState(false);
    const [defaultDbId, setDefaultDbId] = useState<string | undefined>();

    const { data: existingEngines = [], refetch } = useEdgeEngines();
    const { data: providers = [] } = useEdgeProviders();

    // Only show providers that are active AND support listing
    const listableProviders = useMemo(
        () => providers.filter(p => p.is_active && LISTABLE_PROVIDERS.has(p.provider)),
        [providers],
    );

    // Set of already-imported engine names/URLs for duplicate detection
    const importedKeys = useMemo(() => {
        const keys = new Set<string>();
        for (const eng of existingEngines) {
            if (eng.url) keys.add(eng.url.replace(/\/$/, '').toLowerCase());
            const cfName = eng.engine_config?.worker_name;
            if (cfName) keys.add(cfName.toLowerCase());
            keys.add(eng.name.toLowerCase());
        }
        return keys;
    }, [existingEngines]);

    const isImported = useCallback((e: RemoteEngine) => {
        return importedKeys.has(e.name.toLowerCase())
            || importedKeys.has(e.url.replace(/\/$/, '').toLowerCase());
    }, [importedKeys]);

    // ── Filter + Sort ──
    const visibleEngines = useMemo(() => {
        let list = engines;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(e => e.name.toLowerCase().includes(q));
        }
        list = [...list].sort((a, b) => {
            const va = sortField === 'name' ? a.name.toLowerCase() : (a[sortField] || '');
            const vb = sortField === 'name' ? b.name.toLowerCase() : (b[sortField] || '');
            const cmp = va < vb ? -1 : va > vb ? 1 : 0;
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return list;
    }, [engines, searchQuery, sortField, sortDir]);

    // Selectables = engines that aren't already imported
    const selectableEngines = useMemo(
        () => visibleEngines.filter(e => !isImported(e)),
        [visibleEngines, isImported],
    );

    const allSelected = selectableEngines.length > 0
        && selectableEngines.every(e => selectedNames.has(e.name));

    const reset = () => {
        setStep('pick');
        setSelectedAccountId(null);
        setSelectedProvider('');
        setEngines([]);
        setError(null);
        setSearchQuery('');
        setSelectedNames(new Set());
    };

    const handleOpen = (v: boolean) => {
        setOpenState(v);
        onOpenChangeProp?.(v);
        if (v) reset();
    };

    const handlePickProvider = async (accountId: string, provider: string) => {
        setSelectedAccountId(accountId);
        setSelectedProvider(provider);
        setStep('list');
        setLoading(true);
        setError(null);
        setSearchQuery('');
        setSelectedNames(new Set());
        try {
            // Pre-fetch default DB
            const dbRes = await fetch(`${API_BASE}/api/edge-databases/`).catch(() => null);
            if (dbRes && dbRes.ok) {
                const dbs = await dbRes.json();
                const def = dbs.find((d: any) => d.is_default);
                if (def) setDefaultDbId(def.id);
            }
            const res = await fetch(`${API_BASE}/api/edge-providers/${accountId}/list-engines`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.detail || 'Failed to list engines');
            setEngines(data.engines || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir(field === 'name' ? 'asc' : 'desc');
        }
    };

    const toggleName = (name: string) => {
        setSelectedNames(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    };

    const toggleAll = () => {
        if (allSelected) {
            setSelectedNames(new Set());
        } else {
            setSelectedNames(new Set(selectableEngines.map(e => e.name)));
        }
    };

    // Provider display name helper
    const providerLabel = (p: string) => {
        const labels: Record<string, string> = { cloudflare: 'Cloudflare', supabase: 'Supabase', deno: 'Deno', vercel: 'Vercel', netlify: 'Netlify' };
        return labels[p] || p;
    };

    const handleImportSelected = async () => {
        const toImport = engines.filter(e => selectedNames.has(e.name) && !isImported(e));
        if (toImport.length === 0) return;
        setImporting(true);
        setError(null);
        let imported = 0;
        for (const eng of toImport) {
            try {
                // Use provider-specific config key for engine_config
                const configKeyMap: Record<string, string> = {
                    cloudflare: 'worker_name',
                    supabase: 'function_name',
                    deno: 'project_name',
                    vercel: 'project_name',
                    netlify: 'site_name',
                };
                const configKey = configKeyMap[eng.provider] || 'worker_name';
                const created = await edgeInfrastructureApi.createEngine({
                    name: eng.name,
                    provider: eng.provider,
                    edge_provider_id: selectedAccountId || undefined,
                    adapter_type: 'edge',
                    url: eng.url,
                    edge_db_id: defaultDbId || undefined,
                    engine_config: { [configKey]: eng.name },
                    is_active: true,
                    is_imported: true,
                });
                // Auto-sync manifest (silent)
                if (created?.id) {
                    fetch(`${API_BASE}/api/edge-engines/${created.id}/sync-manifest`, {
                        method: 'POST',
                    }).catch(() => {});
                }
                imported++;
            } catch {
                // Continue with remaining
            }
        }
        await refetch();
        setImporting(false);
        setSelectedNames(new Set());
        if (imported === toImport.length) {
            handleOpen(false);
        } else {
            setError(`Imported ${imported}/${toImport.length} engines`);
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
        return sortDir === 'asc'
            ? <ArrowUp className="w-3 h-3 ml-1" />
            : <ArrowDown className="w-3 h-3 ml-1" />;
    };

    return (
        <Dialog open={open} onOpenChange={handleOpen}>
            <DialogContent className="sm:max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle>
                        {step === 'pick' ? 'Import Engines' : `Import from ${providerLabel(selectedProvider)}`}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'pick'
                            ? 'Select an edge provider to discover engines.'
                            : 'Select engines to import into your Frontbase dashboard.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 py-2 min-h-0 flex-1">
                    {error && (
                        <Alert variant="destructive" className="py-2 px-3 shrink-0">
                            <AlertDescription className="text-sm">{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* ── Step 1: Provider Picker ── */}
                    {step === 'pick' && (
                        listableProviders.length === 0 ? (
                            <p className="text-sm text-center text-muted-foreground py-6">
                                No edge compute providers connected.<br />
                                Connect Cloudflare, Supabase, or Deno in Connected Accounts first.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {listableProviders.map(p => {
                                    const Icon = PROVIDER_ICONS[p.provider] || Download;
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => handlePickProvider(p.id, p.provider)}
                                            className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors text-left"
                                        >
                                            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                                <Icon className="w-4 h-4 text-primary" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-sm">{p.name}</div>
                                                <div className="text-xs text-muted-foreground capitalize">{p.provider}</div>
                                            </div>
                                            <Badge variant="outline" className="text-[10px] shrink-0">Select</Badge>
                                        </button>
                                    );
                                })}
                            </div>
                        )
                    )}

                    {/* ── Step 2: Engine List ── */}
                    {step === 'list' && (
                        loading ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : engines.length === 0 ? (
                            <p className="text-sm text-center text-muted-foreground py-6">
                                No engines found on this account.
                            </p>
                        ) : (
                            <>
                                {/* Search + back */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={reset}>
                                        ← Back
                                    </Button>
                                    <div className="relative flex-1">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                        <Input
                                            placeholder="Search engines..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="h-8 pl-8 text-xs"
                                        />
                                    </div>
                                </div>

                                {/* Column headers */}
                                <div className="flex items-center gap-2 px-3 text-[11px] text-muted-foreground uppercase tracking-wide shrink-0">
                                    <Checkbox
                                        checked={allSelected}
                                        onCheckedChange={toggleAll}
                                        className="mr-1"
                                    />
                                    <button
                                        onClick={() => toggleSort('name')}
                                        className="flex items-center flex-1 hover:text-foreground transition-colors"
                                    >
                                        Name <SortIcon field="name" />
                                    </button>
                                    <button
                                        onClick={() => toggleSort('created_at')}
                                        className="flex items-center w-24 justify-end hover:text-foreground transition-colors"
                                    >
                                        Created <SortIcon field="created_at" />
                                    </button>
                                    <button
                                        onClick={() => toggleSort('deployed_at')}
                                        className="flex items-center w-24 justify-end hover:text-foreground transition-colors"
                                    >
                                        Updated <SortIcon field="deployed_at" />
                                    </button>
                                    <div className="w-20" />
                                </div>

                                {/* Scrollable engine list */}
                                <div className="space-y-1 overflow-y-auto flex-1 pr-1">
                                    {visibleEngines.length === 0 ? (
                                        <p className="text-sm text-center text-muted-foreground py-4">No engines match your search.</p>
                                    ) : (
                                        visibleEngines.map(eng => {
                                            const already = isImported(eng);
                                            const checked = selectedNames.has(eng.name);
                                            return (
                                                <div
                                                    key={eng.name}
                                                    className={`flex items-center gap-2 p-2.5 border rounded-lg ${already ? 'bg-muted/50 opacity-60' : 'bg-card'}`}
                                                >
                                                    <Checkbox
                                                        checked={checked}
                                                        disabled={already}
                                                        onCheckedChange={() => toggleName(eng.name)}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-medium text-sm truncate">{eng.name}</div>
                                                        <div className="text-[11px] text-muted-foreground truncate">{eng.url}</div>
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground w-24 text-right shrink-0">
                                                        {eng.created_at ? timeAgo(eng.created_at) : '—'}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground w-24 text-right shrink-0">
                                                        {eng.deployed_at ? timeAgo(eng.deployed_at) : '—'}
                                                    </div>
                                                    <div className="w-20 flex justify-end shrink-0">
                                                        {already && (
                                                            <Badge variant="secondary" className="text-[10px] gap-1 bg-green-500/10 text-green-500">
                                                                <Check className="w-3 h-3" /> Imported
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Import action bar */}
                                {selectedNames.size > 0 && (
                                    <div className="flex items-center justify-between pt-2 border-t shrink-0">
                                        <span className="text-xs text-muted-foreground">
                                            {selectedNames.size} selected
                                        </span>
                                        <Button
                                            size="sm"
                                            onClick={handleImportSelected}
                                            disabled={importing}
                                        >
                                            {importing
                                                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Importing...</>
                                                : <><Download className="w-3.5 h-3.5 mr-1.5" /> Import Selected</>
                                            }
                                        </Button>
                                    </div>
                                )}
                            </>
                        )
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
