import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Cloud, Plus, Trash2, Loader2, Shield, Server, Zap, ChevronDown, ChevronRight, Database, CheckCircle2, XCircle, Pencil, Table, Copy, TestTube } from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEdgeProviders, edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { API_BASE, PROVIDER_ICONS } from './edgeConstants';
import { useQueryClient } from '@tanstack/react-query';
import { datasourcesApi } from '@/modules/dbsync/api';

import { ConnectProviderDialog } from './ConnectProviderDialog';

export function EdgeProvidersSection() {
    const { data: providers = [], isLoading, refetch } = useEdgeProviders();
    const queryClient = useQueryClient();
    const [connectDialogOpen, setConnectDialogOpen] = useState(false);
    const [sheetsDialogOpen, setSheetsDialogOpen] = useState(false);

    // Edit provider state
    const [editProvider, setEditProvider] = useState<{ id: string; name: string; provider: string } | null>(null);

    // Re-test state for existing providers
    const [retestingId, setRetestingId] = useState<string | null>(null);
    const [retestResults, setRetestResults] = useState<Record<string, { success: boolean; detail: string }>>({});

    // Turso account expansion + per-DB management
    const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
    const [tursoTestingDb, setTursoTestingDb] = useState<string | null>(null);
    const [tursoDbResults, setTursoDbResults] = useState<Record<string, { success: boolean; detail: string }>>({});
    const [tursoDatabases, setTursoDatabases] = useState<Record<string, any[]>>({});

    // Google Sheets add-on connect flow
    const [sheetsConnect, setSheetsConnect] = useState<{
        loading: boolean;
        token?: string;
        installUrl?: string;
        polling?: boolean;
        error?: string;
    }>({ loading: false });
    const sheetsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopSheetsPoll = () => {
        if (sheetsPollRef.current) {
            clearInterval(sheetsPollRef.current);
            sheetsPollRef.current = null;
        }
    };
    useEffect(() => () => stopSheetsPoll(), []);

    const startSheetsConnect = async () => {
        setSheetsConnect({ loading: true, error: undefined });
        stopSheetsPoll();
        try {
            const res = await datasourcesApi.issueSheetsConnect();
            const { token, addonInstallUrl } = res.data;
            setSheetsConnect({ loading: false, token, installUrl: addonInstallUrl, polling: true });

            let attempts = 0;
            const maxAttempts = Math.floor((13 * 60 * 1000) / 2500);
            sheetsPollRef.current = setInterval(async () => {
                attempts += 1;
                if (attempts > maxAttempts) {
                    stopSheetsPoll();
                    setSheetsConnect((s) => ({ ...s, polling: false, error: 'Timed out waiting for the add-on. Retry with a new code.' }));
                    return;
                }
                try {
                    const s = await datasourcesApi.sheetsConnectStatus(token);
                    if (s.data?.connected && s.data.accountId) {
                        stopSheetsPoll();
                        queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
                        setSheetsDialogOpen(false);
                        setSheetsConnect({ loading: false });
                    }
                } catch {
                    /* transient — keep polling */
                }
            }, 2500);
        } catch (e: any) {
            setSheetsConnect({ loading: false, error: e?.response?.data?.detail || e.message || 'Failed to issue connect code' });
        }
    };

    // Auto-fetch Turso databases on mount (card starts expanded for Turso)
    useEffect(() => {
        providers.filter(p => p.provider === 'turso').forEach(async (p) => {
            if (!tursoDatabases[p.id]) {
                try {
                    const res = await fetch(`${API_BASE}/api/edge-providers/discover-by-account/${p.id}`, { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                        setTursoDatabases(prev => ({ ...prev, [p.id]: data.resources || [] }));
                    } else {
                        setTursoDatabases(prev => ({ ...prev, [p.id]: [] }));
                    }
                } catch {
                    setTursoDatabases(prev => ({ ...prev, [p.id]: [] }));
                }
            }
        });
    }, [providers]);

    const handleRetest = async (providerId: string) => {
        setRetestingId(providerId);
        setRetestResults(prev => { const n = { ...prev }; delete n[providerId]; return n; });
        try {
            const res = await fetch(`${API_BASE}/api/edge-providers/retest/${providerId}`, {
                method: 'POST',
            });
            const data = await res.json();
            setRetestResults(prev => ({ ...prev, [providerId]: data }));
        } catch (e: any) {
            setRetestResults(prev => ({
                ...prev,
                [providerId]: { success: false, detail: e.message || 'Connection test failed' },
            }));
        } finally {
            setRetestingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await edgeInfrastructureApi.deleteProvider(id);
            await refetch();
        } catch (e: any) {
            alert(e.message);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle>Edge Providers</CardTitle>
                    <CardDescription>Accounts connected to deploy edge infrastructure.</CardDescription>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" onClick={() => setConnectDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" /> Connect Provider
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSheetsDialogOpen(true)}>
                        <Table className="w-4 h-4 mr-2" /> Connect Google Sheets
                    </Button>
                </div>
                <ConnectProviderDialog
                    open={connectDialogOpen}
                    onOpenChange={setConnectDialogOpen}
                    onConnected={() => {
                        refetch();
                    }}
                />

                {/* Google Sheets Add-on Connect Dialog */}
                <Dialog open={sheetsDialogOpen} onOpenChange={setSheetsDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Table className="w-5 h-5" />
                                Connect Google Sheets
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            {!sheetsConnect.token ? (
                                <>
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                        Install the Frontbase add-on, paste a one-time code, click Configure — no copy-pasting Apps Script or secrets.
                                    </p>
                                    {sheetsConnect.error && (
                                        <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{sheetsConnect.error}</p>
                                    )}
                                    <Button
                                        onClick={startSheetsConnect}
                                        disabled={sheetsConnect.loading}
                                        className="w-full"
                                    >
                                        {sheetsConnect.loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                                        Get connect code
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-2 list-decimal list-inside">
                                        <li>
                                            Open the add-on in your Google Sheet
                                            {sheetsConnect.installUrl && (
                                                <a href={sheetsConnect.installUrl} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline ml-1">(install link)</a>
                                            )}
                                        </li>
                                        <li>In the add-on, paste this code and click <span className="font-semibold">Configure</span>:</li>
                                    </ol>
                                    <div className="flex gap-2">
                                        <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono text-sm break-all select-all">
                                            {sheetsConnect.token}
                                        </code>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(sheetsConnect.token!)}
                                            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                            title="Copy code"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {sheetsConnect.polling ? (
                                        <p className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for the add-on…
                                        </p>
                                    ) : (
                                        <button onClick={startSheetsConnect} className="text-sm text-emerald-700 dark:text-emerald-300 underline">Get a new code</button>
                                    )}
                                    {sheetsConnect.error && <p className="text-xs text-red-600 mt-2">{sheetsConnect.error}</p>}
                                </>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
                <ConnectProviderDialog
                    open={!!editProvider}
                    onOpenChange={(o) => { if (!o) setEditProvider(null); }}
                    editProvider={editProvider}
                    onConnected={() => {
                        refetch();
                        setEditProvider(null);
                    }}
                />
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : providers.length === 0 ? (
                    <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                        <Cloud className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <h3 className="text-sm font-medium">No Providers Connected</h3>
                        <p className="text-sm text-muted-foreground mt-1">Connect an account to start deploying.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {providers.map(p => {
                            const Icon = PROVIDER_ICONS[p.provider] || Server;
                            const testState = retestResults[p.id];
                            const metadata = (p as any).provider_metadata;
                            const hasCredentials = (p as any).has_credentials;
                            const isTurso = p.provider === 'turso';
                            const isExpanded = expandedAccounts[p.id] ?? isTurso;
                            const childDbs: any[] = tursoDatabases[p.id] || [];

                            // Auto-fetch Turso child databases on first expand
                            const handleToggle = async () => {
                                const newExpanded = !isExpanded;
                                setExpandedAccounts(prev => ({ ...prev, [p.id]: newExpanded }));
                                if (newExpanded && isTurso && !tursoDatabases[p.id]) {
                                    try {
                                        const res = await fetch(`${API_BASE}/api/edge-providers/discover-by-account/${p.id}`, { method: 'POST' });
                                        const data = await res.json();
                                        if (data.success) {
                                            setTursoDatabases(prev => ({ ...prev, [p.id]: data.resources || [] }));
                                        }
                                    } catch { /* silent */ }
                                }
                            };

                            // Test a specific Turso DB
                            const handleTestTursoDb = async (dbId: string) => {
                                setTursoTestingDb(dbId);
                                try {
                                    const res = await fetch(`${API_BASE}/api/edge-providers/${p.id}/turso-databases/${dbId}/test`, { method: 'POST' });
                                    const data = await res.json();
                                    setTursoDbResults(prev => ({ ...prev, [dbId]: data }));
                                    // Refresh to update test_ok badges
                                    const discRes = await fetch(`${API_BASE}/api/edge-providers/discover-by-account/${p.id}`, { method: 'POST' });
                                    const discData = await discRes.json();
                                    if (discData.success) setTursoDatabases(prev => ({ ...prev, [p.id]: discData.resources || [] }));
                                } catch (e: any) {
                                    setTursoDbResults(prev => ({ ...prev, [dbId]: { success: false, detail: e.message } }));
                                } finally {
                                    setTursoTestingDb(null);
                                }
                            };

                            // Delete a specific Turso DB
                            const handleDeleteTursoDb = async (dbId: string) => {
                                try {
                                    await fetch(`${API_BASE}/api/edge-providers/${p.id}/turso-databases/${dbId}`, { method: 'DELETE' });
                                    setTursoDatabases(prev => ({
                                        ...prev,
                                        [p.id]: (prev[p.id] || []).filter(d => d.id !== dbId),
                                    }));
                                } catch { /* silent */ }
                            };

                            return (
                                <div key={p.id} className="border rounded-lg bg-card hover:border-primary/50 transition-colors">
                                    <div className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-3">
                                            {isTurso ? (
                                                <button onClick={handleToggle} className="w-10 h-10 rounded-md bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                </button>
                                            ) : (
                                                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                            )}
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-sm">{p.name}</h4>
                                                    {p.is_active && <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Connected</Badge>}
                                                    {hasCredentials && (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                                                            <Shield className="w-2.5 h-2.5" /> Encrypted
                                                        </Badge>
                                                    )}
                                                    {isTurso && childDbs.length > 0 && (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                                            {childDbs.length} {childDbs.length === 1 ? 'database' : 'databases'}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground capitalize mt-0.5">{p.provider}</p>

                                                {testState && (
                                                    <div className={`flex items-center gap-1 mt-1 text-[11px] ${testState.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                                        }`}>
                                                        {testState.success
                                                            ? <CheckCircle2 className="w-3 h-3" />
                                                            : <XCircle className="w-3 h-3" />
                                                        }
                                                        <span>{testState.detail}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Edit credentials */}
                                            {!isTurso && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-muted-foreground hover:text-primary"
                                                    onClick={() => setEditProvider({ id: p.id, name: p.name, provider: p.provider })}
                                                    title="Edit credentials"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                            )}
                                            {/* Re-test connection (non-Turso) */}
                                            {!isTurso && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-muted-foreground hover:text-primary"
                                                    disabled={retestingId === p.id}
                                                    onClick={() => handleRetest(p.id)}
                                                    title="Test connection"
                                                >
                                                    {retestingId === p.id
                                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                                        : <Zap className="w-4 h-4" />
                                                    }
                                                </Button>
                                            )}

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Remove Provider?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            {isTurso
                                                                ? 'This will remove all registered Turso databases and their credentials from Frontbase.'
                                                                : 'This will remove the credentials from Frontbase. Existing deployed Edge Engines will continue to run, but Frontbase won\'t be able to update them.'
                                                            }
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(p.id)} className="bg-destructive hover:bg-destructive/90">
                                                            Remove
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>

                                    {/* Turso: child databases list */}
                                    {isTurso && isExpanded && (
                                        <div className="border-t px-4 pb-4 pt-3 space-y-2">
                                            {childDbs.length === 0 && !tursoDatabases[p.id] && (
                                                <p className="text-xs text-muted-foreground">Loading databases...</p>
                                            )}
                                            {childDbs.map(d => {
                                                const dbTest = tursoDbResults[d.id];
                                                return (
                                                    <div key={d.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 border border-transparent hover:border-muted-foreground/20">
                                                        <div className="flex items-center gap-2">
                                                            <Database className="w-3.5 h-3.5 text-muted-foreground" />
                                                            <div>
                                                                <span className="text-sm font-medium">{d.name}</span>
                                                                <span className="text-xs text-muted-foreground ml-2">{d.db_url}</span>
                                                            </div>
                                                            {d.test_ok === true && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                                                            {d.test_ok === false && <XCircle className="w-3 h-3 text-red-500" />}
                                                            {dbTest && (
                                                                <span className={`text-[11px] ${dbTest.success ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {dbTest.detail}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                                                disabled={tursoTestingDb === d.id}
                                                                onClick={() => handleTestTursoDb(d.id)}
                                                                title="Test database"
                                                            >
                                                                {tursoTestingDb === d.id
                                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    : <Zap className="w-3.5 h-3.5" />
                                                                }
                                                            </Button>
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Remove Database?</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            Remove "{d.name}" from this Turso account? This only removes the reference — the actual database on Turso is not affected.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                        <AlertDialogAction onClick={() => handleDeleteTursoDb(d.id)} className="bg-destructive hover:bg-destructive/90">
                                                                            Remove
                                                                        </AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {childDbs.length === 0 && tursoDatabases[p.id] && (
                                                <p className="text-xs text-muted-foreground">No databases yet. Use "Connect Provider → Turso" to add one.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
