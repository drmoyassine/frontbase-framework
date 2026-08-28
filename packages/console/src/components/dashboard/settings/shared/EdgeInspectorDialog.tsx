/**
 * EdgeInspectorDialog — Mission Control Style
 *
 * Provider-agnostic inspector for deployed Edge Engines.
 * Split-pane layout: left panel (file tree + secrets + settings), right panel (Monaco editor / detail view).
 *
 * Phase 2: Full IDE with dirty state tracking, Save All, and Compile & Deploy.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Search, Loader2, AlertTriangle, ExternalLink, Save, Rocket, Circle, Check, Lock as LockIcon, Info,
} from 'lucide-react';
import type { EdgeEngine } from '@/hooks/useEdgeInfrastructure';

// Sub-components
import { InspectorNavPanel } from './inspector/InspectorNavPanel';
import { SourceViewer } from './inspector/SourceViewer';
import { SecretViewer } from './inspector/SecretViewer';
import { SettingsPanel } from './inspector/SettingsPanel';
import { EndpointsPanel } from './inspector/EndpointsPanel';
import { LogsPanel } from './inspector/LogsPanel';
import { DomainsPanel } from './inspector/DomainsPanel';
import { HealthCheckPopover } from './HealthCheckPopover';
import { ApiKeysPanel } from './inspector/ApiKeysPanel';
import { AgentProfilesPanel } from './inspector/AgentProfilesPanel';
import {
    type NavSection, type SelectedItem, type HierNode,
    type SourceSnapshotResponse, type InspectSettingsResponse, type InspectSecretsResponse,
    type InspectDomainsResponse,
    API_BASE, PROVIDER_LABELS,
    extractWorkerName, getWorkerBaseUrl, engineInspectFetch,
} from './inspector/types';
import { resolveEngineOrigin } from '@/lib/edgeUtils';

// ─── Props ──────────────────────────────────────────────────────────────────

interface EdgeInspectorDialogProps {
    engine: EdgeEngine;
    providerId: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const EdgeInspectorDialog: React.FC<EdgeInspectorDialogProps> = ({ engine, providerId }) => {
    const [open, setOpen] = useState(false);
    const queryClient = useQueryClient();

    // Navigation state
    const [expandedSections, setExpandedSections] = useState<Set<NavSection>>(new Set(['files', 'secrets', 'settings']));
    const [selectedItem, setSelectedItem] = useState<SelectedItem>({ section: 'files', key: '' });
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

    // Edit state
    const [dirtyFiles, setDirtyFiles] = useState<Map<string, string>>(new Map());
    const [saving, setSaving] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const workerName = extractWorkerName(engine);
    const cacheKey = `${providerId}:${workerName}`;
    const providerStr = engine.provider || 'cloudflare';
    const providerLabel = PROVIDER_LABELS[engine.provider || 'cloudflare'] || engine.provider || 'Provider';

    // Imported engines have no source snapshot — skip fetch to avoid 404 spam
    const hasDeployHistory = !!(engine.last_deployed_at || engine.bundle_checksum);
    const hasProvider = !!engine.edge_provider_id;

    // ─── Source: prefer local snapshot, fall back to provider API for imported engines ─────

    const {
        data: sourceData,
        isLoading: loadingSource,
        error: sourceError,
    } = useQuery<SourceSnapshotResponse>({
        queryKey: ['edge-inspector', 'source', engine.id],
        queryFn: async () => {
            // Try local snapshot first (from previous deploy)
            if (hasDeployHistory) {
                const resp = await fetch(`${API_BASE}/api/edge-engines/${engine.id}/source`);
                if (resp.ok) {
                    const data = await resp.json();
                    return data;
                }
            }
            // Fall back to live provider API (import-friendly)
            if (hasProvider) {
                return await engineInspectFetch<SourceSnapshotResponse>(engine.id, 'source');
            }
            throw new Error('No source available');
        },
        enabled: open && (hasDeployHistory || hasProvider),
        staleTime: STALE.STANDARD,
        retry: 0,
    });

    // ─── Settings + Secrets (multi-provider via engine inspector) ─────

    const {
        data: settings,
        isLoading: loadingSettings,
    } = useQuery<InspectSettingsResponse>({
        queryKey: ['edge-inspector', 'settings', engine.id],
        queryFn: () => engineInspectFetch<InspectSettingsResponse>(engine.id, 'settings'),
        enabled: open && hasProvider,
        staleTime: STALE.STANDARD,
    });

    const {
        data: secrets,
        isLoading: loadingSecrets,
    } = useQuery<InspectSecretsResponse>({
        queryKey: ['edge-inspector', 'secrets', engine.id],
        queryFn: () => engineInspectFetch<InspectSecretsResponse>(engine.id, 'secrets'),
        enabled: open && hasProvider,
        staleTime: STALE.STANDARD,
    });

    // Fetch live OpenAPI spec from the engine itself (provider-agnostic)
    const workerBaseUrl = getWorkerBaseUrl(engine);
    const { data: openApiSpec } = useQuery<any>({
        queryKey: ['edge-inspector', 'openapi', workerBaseUrl],
        queryFn: async () => {
            const resp = await fetch(`${workerBaseUrl}/api/openapi.json`);
            if (!resp.ok) return null;
            return resp.json();
        },
        enabled: open && !!workerBaseUrl,
        staleTime: STALE.STANDARD,
    });

    // ── Domains (multi-provider via domain_manager) ───────────────────

    const {
        data: domainsData,
        isLoading: loadingDomains,
    } = useQuery<InspectDomainsResponse>({
        queryKey: ['edge-inspector', 'domains', engine.id],
        queryFn: () => engineInspectFetch<InspectDomainsResponse>(engine.id, 'domains'),
        enabled: open && hasProvider,
        staleTime: STALE.STANDARD,
    });

    const error = sourceError ? (sourceError as Error).message : null;

    // ─── Build hierarchical file tree from snapshot keys ─────────────────
    // Structure: { rootFiles: [...], subdirs: { "frontbase-core": { rootFiles: [...], subdirs: { "adapters": [...], ... } } } }

    const fileTree = useMemo((): HierNode => {
        const root: HierNode = { rootFiles: [], subdirs: new Map() };
        if (!sourceData?.files) return root;

        const CORE = 'frontbase-core';

        for (const path of Object.keys(sourceData.files).sort()) {
            const parts = path.split('/');

            if (parts[0] === CORE) {
                // Special case: README.md goes to root
                if (parts.length === 2 && parts[1] === 'README.md') {
                    root.rootFiles.push(path);
                    continue;
                }

                // Everything else nests under frontbase-core
                if (!root.subdirs.has(CORE)) {
                    root.subdirs.set(CORE, { rootFiles: [], subdirs: new Map() });
                }
                const coreNode = root.subdirs.get(CORE)!;

                if (parts.length === 2) {
                    // Direct file in frontbase-core/ (e.g. index.ts)
                    coreNode.rootFiles.push(path);
                } else {
                    // Subdir within frontbase-core/ (e.g. frontbase-core/adapters/foo.ts)
                    const subdir = parts[1];
                    if (!coreNode.subdirs.has(subdir)) {
                        coreNode.subdirs.set(subdir, { rootFiles: [], subdirs: new Map() });
                    }
                    coreNode.subdirs.get(subdir)!.rootFiles.push(path);
                }
            } else {
                // Non-core file — put at root level
                root.rootFiles.push(path);
            }
        }
        return root;
    }, [sourceData]);

    // Auto-select first file when source loads
    const firstFile = useMemo(() => {
        if (!sourceData?.files) return '';
        const keys = Object.keys(sourceData.files).sort();
        return keys[0] || '';
    }, [sourceData]);

    React.useEffect(() => {
        if (firstFile && !selectedItem.key) {
            setSelectedItem({ section: 'files', key: firstFile });
        }
    }, [firstFile]);

    const toggleDir = (dir: string) => {
        setExpandedDirs(prev => {
            const next = new Set(prev);
            if (next.has(dir)) next.delete(dir);
            else next.add(dir);
            return next;
        });
    };

    const toggleSection = (section: NavSection) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    // ─── Edit handlers ──────────────────────────────────────────────────

    const onContentChange = useCallback((filePath: string, newContent: string) => {
        // Only mark dirty if content actually differs from saved snapshot
        const savedContent = sourceData?.files[filePath];
        setDirtyFiles(prev => {
            const next = new Map(prev);
            if (newContent === savedContent) {
                next.delete(filePath);
            } else {
                next.set(filePath, newContent);
            }
            return next;
        });
    }, [sourceData]);

    const hasDirtyFiles = dirtyFiles.size > 0;
    const dirtyFileSet = useMemo(() => new Set(dirtyFiles.keys()), [dirtyFiles]);

    // ─── Save All ───────────────────────────────────────────────────────

    const handleSaveAll = useCallback(async () => {
        if (dirtyFiles.size === 0) return;
        setSaving(true);
        setStatusMessage(null);
        try {
            const files = Object.fromEntries(dirtyFiles);
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engine.id}/source`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Save failed');

            setDirtyFiles(new Map());
            queryClient.invalidateQueries({ queryKey: ['edge-inspector', 'source', engine.id] });
            setStatusMessage({ type: 'success', text: `Saved ${data.files_written} file(s)` });
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (e: any) {
            setStatusMessage({ type: 'error', text: e.message });
        } finally {
            setSaving(false);
        }
    }, [dirtyFiles, engine.id, queryClient]);

    // ─── Compile & Deploy ───────────────────────────────────────────────

    const handleCompileAndDeploy = useCallback(async () => {
        setDeploying(true);
        setStatusMessage(null);
        try {
            // Save first if there are dirty files
            if (dirtyFiles.size > 0) {
                const files = Object.fromEntries(dirtyFiles);
                const saveResp = await fetch(`${API_BASE}/api/edge-engines/${engine.id}/source`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files }),
                });
                if (!saveResp.ok) {
                    const err = await saveResp.json();
                    throw new Error(err.detail || 'Save failed before deploy');
                }
                setDirtyFiles(new Map());
            }

            // Trigger redeploy
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engine.id}/redeploy`, {
                method: 'POST',
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Deploy failed');

            queryClient.invalidateQueries({ queryKey: ['edge-inspector', 'source', engine.id] });
            setStatusMessage({ type: 'success', text: `Deployed! hash=${data.source_hash}` });
            setTimeout(() => setStatusMessage(null), 5000);
        } catch (e: any) {
            setStatusMessage({ type: 'error', text: e.message });
        } finally {
            setDeploying(false);
        }
    }, [dirtyFiles, engine.id, queryClient]);

    // ─── Right Panel: Content Viewer (delegated to sub-components) ───────

    const renderRightPanel = () => {
        // Loading state
        if (selectedItem.section === 'files' && loadingSource) {
            return (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">Loading source snapshot...</p>
                    </div>
                </div>
            );
        }

        // Error/no-source state
        if ((error || !hasDeployHistory) && selectedItem.section === 'files') {
            return (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-3 max-w-sm">
                        <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">
                            {hasDeployHistory
                                ? error || 'Source snapshot not found'
                                : 'No source snapshot available'
                            }
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {hasDeployHistory
                                ? 'Deploy or redeploy this engine to capture a source snapshot.'
                                : 'This engine was imported externally. Deploy through Frontbase to capture source code.'
                            }
                        </p>
                    </div>
                </div>
            );
        }

        // Source code editor
        if (selectedItem.section === 'files' && sourceData && selectedItem.key) {
            // Use dirty version if available, otherwise snapshot version
            const fileContent = dirtyFiles.get(selectedItem.key) ?? sourceData.files[selectedItem.key];
            if (fileContent === undefined) {
                return (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-sm text-muted-foreground">Select a file to view</p>
                    </div>
                );
            }
            return (
                <SourceViewer
                    filePath={selectedItem.key}
                    content={fileContent}
                    isDirty={dirtyFiles.has(selectedItem.key)}
                    onContentChange={onContentChange}
                />
            );
        }

        // Secret detail panels (under SECRETS section)
        if (selectedItem.section === 'secrets') {
            // API Keys panel
            if (selectedItem.key === 'api-keys') {
                return <ApiKeysPanel engineId={engine.id} />;
            }
            // Environment Variables list
            if (selectedItem.key === 'env-vars') {
                return (
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                            <LockIcon className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">Environment Variables ({secrets?.secrets?.length ?? 0})</span>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-2">
                                {loadingSecrets ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (secrets?.secrets?.length ?? 0) === 0 ? (
                                    <div className="text-center py-8 text-sm text-muted-foreground">
                                        No environment variables deployed to this engine.
                                    </div>
                                ) : (
                                    secrets!.secrets.map(name => (
                                        <div key={name} className="p-3 rounded-lg border bg-card flex items-center gap-3">
                                            <Badge variant="outline" className="text-[10px] font-mono shrink-0">SECRET</Badge>
                                            <span className="text-sm font-mono font-medium">{name}</span>
                                            <span className="text-[10px] text-muted-foreground ml-auto">••••••••</span>
                                        </div>
                                    ))
                                )}
                                {/* Bindings section */}
                                {settings?.settings?.bindings && settings.settings.bindings.length > 0 && (
                                    <>
                                        <div className="pt-3 pb-1">
                                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Bindings</span>
                                        </div>
                                        {settings.settings.bindings.map((binding: any, i: number) => (
                                            <div key={i} className="p-3 rounded-lg border bg-card flex items-center gap-3">
                                                <Badge variant="outline" className="text-[10px] font-mono shrink-0 uppercase">{binding.type}</Badge>
                                                <span className="text-sm font-mono font-medium">{binding.name}</span>
                                                {binding.namespace_id && (
                                                    <span className="text-[10px] text-muted-foreground font-mono ml-auto truncate max-w-[200px]">{binding.namespace_id}</span>
                                                )}
                                            </div>
                                        ))}
                                    </>
                                )}
                                {secrets?.imported_notice && (
                                    <div className="p-3 rounded-lg border bg-muted/50 text-xs text-muted-foreground">
                                        <Info className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5 text-blue-400" />
                                        {secrets.imported_notice}
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                );
            }
            // Legacy: individual secret name (fallback)
            return <SecretViewer secretName={selectedItem.key} providerLabel={providerLabel} />;
        }

        // Routes & Endpoints (combined panel)
        if (selectedItem.section === 'settings' && selectedItem.key === 'routes-endpoints') {
            return (
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                        <span className="text-xs font-medium">Routes & Endpoints</span>
                    </div>
                    <ScrollArea className="flex-1">
                        {/* Routes section (CF) */}
                        {settings?.settings?.routes && settings.settings.routes.length > 0 && (
                            <div className="p-4 border-b border-border/50">
                                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    Routes ({settings.settings.routes.length})
                                </div>
                                <div className="space-y-2">
                                    {settings.settings.routes.map((route: any, i: number) => (
                                        <div key={i} className="p-3 rounded-lg border bg-card flex items-center gap-3">
                                            <Badge variant="outline" className="text-[10px] font-mono shrink-0">{route.type}</Badge>
                                            <a
                                                href={`https://${route.pattern}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-mono text-primary hover:underline flex items-center gap-1.5 transition-colors"
                                            >
                                                {route.pattern}
                                                <ExternalLink className="h-3 w-3 opacity-60" />
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Endpoints section */}
                        <EndpointsPanel engine={engine} openApiSpec={openApiSpec} />
                    </ScrollArea>
                </div>
            );
        }

        // Settings (CF-only)
        if (selectedItem.section === 'settings' && settings) {
            return <SettingsPanel settingsKey={selectedItem.key} settings={settings} />;
        }

        // Agent Profiles
        if (selectedItem.section === 'agents') {
            return <AgentProfilesPanel engineId={engine.id} engineName={engine.name} openApiSpec={openApiSpec} />;
        }

        // Logs (all providers) — pass settings for compatibility section
        if (selectedItem.section === 'logs') {
            return <LogsPanel engineId={engine.id} engineName={engine.name} settings={settings} />;
        }

        // Domains (multi-provider)
        if (selectedItem.section === 'domains') {
            return (
                <DomainsPanel
                    engineId={engine.id}
                    domainsData={domainsData}
                    loadingDomains={loadingDomains}
                    providerLabel={providerLabel}
                    providerType={providerStr}
                    engineUrl={engine.url}
                />
            );
        }

        // Default empty state
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                    <Search className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                    <p className="text-sm text-muted-foreground">Select an item to inspect</p>
                </div>
            </div>
        );
    };

    // ─── Dialog ─────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="Inspect deployment">
                    <Search className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
                {/* Header */}
                <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="text-sm flex items-center gap-2">
                                <Search className="h-4 w-4 text-primary" />
                                Inspect: {workerName}
                            </DialogTitle>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px]">{engine.provider || 'cloudflare'}</Badge>
                                <Badge variant="outline" className="text-[10px]">{engine.adapter_type}</Badge>
                                {engine.url && (() => {
                                    const originUrl = resolveEngineOrigin(engine.url);
                                    if (!originUrl) return null;
                                    return (
                                        <a
                                            href={originUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                                        >
                                            {originUrl.replace(/^https?:\/\//, '')}
                                            <ExternalLink className="h-2.5 w-2.5" />
                                        </a>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Toolbar — health check always visible, IDE actions when source loaded */}
                        <div className="flex items-center gap-2 pr-6">
                            {sourceData && (
                            <>
                                {/* Status message */}
                                {statusMessage && (
                                    <span className={`text-[10px] ${statusMessage.type === 'success' ? 'text-emerald-500' : 'text-destructive'}`}>
                                        {statusMessage.type === 'success' && <Check className="h-3 w-3 inline mr-1" />}
                                        {statusMessage.text}
                                    </span>
                                )}

                                {/* Dirty count */}
                                {hasDirtyFiles && (
                                    <Badge variant="secondary" className="text-[10px] gap-1">
                                        <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />
                                        {dirtyFiles.size} unsaved
                                    </Badge>
                                )}

                                {/* Save All */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1.5"
                                    disabled={!hasDirtyFiles || saving}
                                    onClick={handleSaveAll}
                                >
                                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                    Save
                                </Button>

                                {/* Compile & Deploy */}
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="h-7 text-xs gap-1.5"
                                    disabled={deploying}
                                    onClick={handleCompileAndDeploy}
                                >
                                    {deploying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
                                    Compile & Deploy
                                </Button>
                            </>
                            )}

                            {/* Health check — always visible */}
                            <HealthCheckPopover engineId={engine.id} engineUrl={engine.url} variant="pill" />
                        </div>
                    </div>
                </DialogHeader>

                {/* Split pane */}
                <div className="flex flex-1 min-h-0 overflow-hidden">
                    <InspectorNavPanel
                        sourceData={sourceData}
                        loadingSource={loadingSource}
                        fileTree={fileTree}
                        expandedDirs={expandedDirs}
                        toggleDir={toggleDir}
                        secrets={secrets}
                        loadingSecrets={loadingSecrets}
                        settings={settings}
                        loadingSettings={loadingSettings}
                        providerType={engine.provider || 'cloudflare'}
                        providerLabel={providerLabel}
                        adapterType={engine.adapter_type || 'automations'}
                        expandedSections={expandedSections}
                        toggleSection={toggleSection}
                        selectedItem={selectedItem}
                        setSelectedItem={setSelectedItem}
                        dirtyFiles={dirtyFileSet}
                        openApiSpec={openApiSpec}
                        domainsData={domainsData}
                        loadingDomains={loadingDomains}
                        engineId={engine.id}
                    />
                    {renderRightPanel()}
                </div>
            </DialogContent>
        </Dialog>
    );
};
