/**
 * InspectorNavPanel — Left panel navigation tree.
 *
 * Contains three collapsible sections: Files, Secrets, Settings.
 * Files section renders a hierarchical directory tree from the source snapshot.
 * Secrets/Settings sections are CF-only with graceful degradation.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEdgeAPIKeys } from '@/hooks/useEdgeInfrastructure';
import {
    FileCode, Lock, Settings2, ChevronDown, ChevronRight,
    File, Folder, Shield, Globe, Clock, Cpu, Loader2, Zap, Info, Circle, Key, Route, Bot,
} from 'lucide-react';
import type {
    SourceSnapshotResponse, InspectSettingsResponse, InspectSecretsResponse,
    InspectDomainsResponse,
    NavSection, SelectedItem, HierNode,
} from './types';

interface InspectorNavPanelProps {
    // File tree (hierarchical)
    sourceData: SourceSnapshotResponse | undefined;
    loadingSource: boolean;
    fileTree: HierNode;
    expandedDirs: Set<string>;
    toggleDir: (dir: string) => void;
    // Secrets (CF-only)
    secrets: InspectSecretsResponse | undefined;
    loadingSecrets: boolean;
    // Settings
    settings: InspectSettingsResponse | undefined;
    loadingSettings: boolean;
    /** Provider type string (e.g. 'cloudflare', 'vercel', 'supabase') */
    providerType: string;
    providerLabel: string;
    adapterType: string;
    // Section expand/collapse
    expandedSections: Set<NavSection>;
    toggleSection: (section: NavSection) => void;
    // Selection
    selectedItem: SelectedItem;
    setSelectedItem: (item: SelectedItem) => void;
    // Dirty files (edited but unsaved)
    dirtyFiles?: Set<string>;
    // OpenAPI spec (for dynamic endpoint count)
    openApiSpec?: any;
    // Domains
    domainsData?: InspectDomainsResponse;
    loadingDomains?: boolean;
    // Engine context (for API keys query)
    engineId: string;
}

export const InspectorNavPanel: React.FC<InspectorNavPanelProps> = ({
    sourceData, loadingSource, fileTree, expandedDirs, toggleDir,
    secrets, loadingSecrets,
    settings, loadingSettings, providerType, providerLabel, adapterType,
    expandedSections, toggleSection,
    selectedItem, setSelectedItem,
    dirtyFiles, openApiSpec,
    domainsData, loadingDomains,
    engineId,
}) => {
    const isSelected = (section: NavSection, key: string) =>
        selectedItem.section === section && selectedItem.key === key;

    const isCF = providerType === 'cloudflare';
    const isVercel = providerType === 'vercel';
    const isSupabase = providerType === 'supabase';
    const isNetlify = providerType === 'netlify';
    const hasSecrets = isCF || isVercel || isSupabase || isNetlify;

    // Fetch API key count for this engine
    const { data: apiKeys = [] } = useEdgeAPIKeys(engineId);

    // Parse endpoint count from live spec
    const endpointCount = React.useMemo(() => {
        if (!openApiSpec?.paths) return 0;
        let count = 0;
        for (const methods of Object.values(openApiSpec.paths as Record<string, any>)) {
            for (const m of Object.keys(methods as object)) {
                if (['get', 'post', 'put', 'delete', 'patch'].includes(m)) count++;
            }
        }
        return count;
    }, [openApiSpec]);

    // ── Render a single file item ─────────────────────────────────────
    const renderFile = (filePath: string, indent: number) => {
        const fileName = filePath.includes('/') ? filePath.substring(filePath.lastIndexOf('/') + 1) : filePath;
        return (
            <button
                key={filePath}
                onClick={() => setSelectedItem({ section: 'files', key: filePath })}
                className={`w-full flex items-center gap-1.5 pr-2 py-0.5 text-[11px] rounded-sm transition-colors ${isSelected('files', filePath)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                style={{ paddingLeft: `${indent * 12 + 8}px` }}
            >
                <File className="h-3 w-3 shrink-0" />
                <span className="truncate font-mono">{fileName}</span>
                {dirtyFiles?.has(filePath) && (
                    <Circle className="h-1.5 w-1.5 fill-amber-500 text-amber-500 ml-auto shrink-0" />
                )}
            </button>
        );
    };

    // ── Render a folder with toggle and children ──────────────────────
    const renderDir = (dirName: string, dirKey: string, node: HierNode, indent: number) => {
        const isOpen = expandedDirs.has(dirKey);
        const fileCount = node.rootFiles.length + Array.from(node.subdirs.values())
            .reduce((sum, sub) => sum + sub.rootFiles.length, 0);
        return (
            <div key={dirKey}>
                <button
                    onClick={() => toggleDir(dirKey)}
                    className="w-full flex items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    style={{ paddingLeft: `${indent * 12 + 8}px` }}
                >
                    {isOpen ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                    <Folder className="h-3 w-3 shrink-0 text-blue-400" />
                    <span className="truncate">{dirName}</span>
                    <Badge variant="secondary" className="ml-auto text-[9px] h-3.5 px-1">{fileCount}</Badge>
                </button>
                {isOpen && (
                    <>
                        {/* Direct files in this dir */}
                        {node.rootFiles.map(fp => renderFile(fp, indent + 1))}
                        {/* Subdirectories */}
                        {Array.from(node.subdirs.entries())
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([subName, subNode]) =>
                                renderDir(subName, `${dirKey}/${subName}`, subNode, indent + 1)
                            )}
                    </>
                )}
            </div>
        );
    };

    return (
        <div className="w-[220px] min-w-[220px] border-r border-border flex flex-col bg-muted/30">
            {/* Header */}
            <div className="px-3 py-2 border-b border-border">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inspector</div>
            </div>

            <ScrollArea className="flex-1">
                <div className="py-1">
                    {/* ── Files Section (provider-agnostic source snapshot) ── */}
                    <button
                        onClick={() => toggleSection('files')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {expandedSections.has('files') ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <FileCode className="h-3.5 w-3.5" />
                        FILES
                        {sourceData && (
                            <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">{sourceData.file_count}</Badge>
                        )}
                        {loadingSource && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                    </button>
                    {expandedSections.has('files') && (
                        <div className="ml-1">
                            {sourceData ? (
                                <>
                                    {/* Root-level files (including README.md hoisted from frontbase-core/) */}
                                    {fileTree.rootFiles.map(fp => renderFile(fp, 1))}
                                    {/* Top-level directories (frontbase-core, etc.) */}
                                    {Array.from(fileTree.subdirs.entries())
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([dirName, node]) =>
                                            renderDir(dirName, dirName, node, 1)
                                        )}
                                </>
                            ) : loadingSource ? (
                                <div className="px-3 py-1 space-y-1">
                                    <Skeleton className="h-3 w-full" />
                                    <Skeleton className="h-3 w-3/4" />
                                    <Skeleton className="h-3 w-5/6" />
                                </div>
                            ) : (
                                <div className="px-3 py-1 text-[10px] text-muted-foreground italic">No source snapshot — deploy to capture</div>
                            )}
                        </div>
                    )}

                    {/* ── Secrets Section ───────────────────────────── */}
                    <button
                        onClick={() => toggleSection('secrets')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mt-1"
                    >
                        {expandedSections.has('secrets') ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <Lock className="h-3.5 w-3.5" />
                        SECRETS
                        {loadingSecrets && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                    </button>
                    {expandedSections.has('secrets') && (
                        <div className="ml-2">
                            {/* Environment Variables */}
                            <button
                                onClick={() => setSelectedItem({ section: 'secrets', key: 'env-vars' })}
                                className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('secrets', 'env-vars')
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                    }`}
                            >
                                <Shield className="h-3 w-3 shrink-0" />
                                <span className="truncate">Environment Variables</span>
                                {secrets && (
                                    <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">{secrets.secrets.length}</Badge>
                                )}
                            </button>

                            {/* API Keys */}
                            <button
                                onClick={() => setSelectedItem({ section: 'secrets', key: 'api-keys' })}
                                className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('secrets', 'api-keys')
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                    }`}
                            >
                                <Key className="h-3 w-3 shrink-0" />
                                <span className="truncate">API Keys</span>
                                {apiKeys.length > 0 && (
                                    <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">{apiKeys.length}</Badge>
                                )}
                            </button>

                            {secrets?.imported_notice && (
                                <div className="mx-2 my-1 px-2.5 py-2 text-[10px] text-muted-foreground bg-muted/50 rounded-md border border-border leading-relaxed">
                                    <Info className="h-3 w-3 inline-block mr-1 -mt-0.5 text-blue-400" />
                                    {secrets.imported_notice}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Agents Section ──────────────────────────── */}
                    <button
                        onClick={() => toggleSection('agents')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mt-1"
                    >
                        {expandedSections.has('agents') ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <Bot className="h-3.5 w-3.5" />
                        AI AGENTS
                    </button>
                    {expandedSections.has('agents') && (
                        <div className="ml-2">
                            <button
                                onClick={() => setSelectedItem({ section: 'agents', key: 'profiles' })}
                                className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('agents', 'profiles')
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                    }`}
                            >
                                <Bot className="h-3 w-3 shrink-0" />
                                <span className="truncate">Agent Profiles</span>
                            </button>
                        </div>
                    )}

                    {/* ── Settings Section ──────────────────────────── */}
                    <button
                        onClick={() => toggleSection('settings')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mt-1"
                    >
                        {expandedSections.has('settings') ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <Settings2 className="h-3.5 w-3.5" />
                        SETTINGS
                        {loadingSettings && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                    </button>
                    {expandedSections.has('settings') && (
                        <div className="ml-2">
                            {/* Routes & Endpoints (combined) */}
                            <button
                                onClick={() => setSelectedItem({ section: 'settings', key: 'routes-endpoints' })}
                                className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('settings', 'routes-endpoints')
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                    }`}
                            >
                                <Route className="h-3 w-3 shrink-0" />
                                <span className="truncate">Routes & Endpoints ({(settings?.settings.routes?.length ?? 0) + endpointCount})</span>
                            </button>

                            {/* Crons (CF-only) */}
                            {isCF && settings && (settings.settings.cron_triggers?.length ?? 0) > 0 && (
                                <button
                                    onClick={() => setSelectedItem({ section: 'settings', key: 'crons' })}
                                    className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('settings', 'crons')
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                        }`}
                                >
                                    <Clock className="h-3 w-3 shrink-0" />
                                    <span className="truncate">Crons ({settings.settings.cron_triggers?.length ?? 0})</span>
                                </button>
                            )}

                            {/* Vercel-specific settings items */}
                            {isVercel && settings && [
                                { key: 'config', icon: Settings2, label: 'Function Config' },
                            ].map(item => (
                                <button
                                    key={item.key}
                                    onClick={() => setSelectedItem({ section: 'settings', key: item.key })}
                                    className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('settings', item.key)
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                        }`}
                                >
                                    <item.icon className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                </button>
                            ))}

                            {/* Supabase-specific settings items */}
                            {!isCF && !isVercel && settings && [
                                { key: 'config', icon: Settings2, label: 'Function Config' },
                            ].map(item => (
                                <button
                                    key={item.key}
                                    onClick={() => setSelectedItem({ section: 'settings', key: item.key })}
                                    className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('settings', item.key)
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                        }`}
                                >
                                    <item.icon className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                </button>
                            ))}

                            {/* Non-CF, no settings loaded */}
                            {!isCF && !isVercel && !settings && !loadingSettings && (
                                <div className="px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-1.5">
                                    <Info className="h-3 w-3 shrink-0" />
                                    Settings not available for {providerLabel}
                                </div>
                            )}

                            {(isCF || isVercel) && loadingSettings && (
                                <div className="px-3 py-1 space-y-1">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                </div>
                            )}

                            {/* Manage Domains (all providers) */}
                            <button
                                onClick={() => setSelectedItem({ section: 'domains', key: 'manager' })}
                                className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('domains', 'manager')
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                    }`}
                            >
                                <Globe className="h-3 w-3 shrink-0" />
                                <span className="truncate">Manage Domains</span>
                                {domainsData?.domains && domainsData.domains.length > 0 && (
                                    <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">{domainsData.domains.length}</Badge>
                                )}
                            </button>

                            {/* Runtime Logs (all providers) */}
                            <button
                                onClick={() => setSelectedItem({ section: 'logs', key: 'viewer' })}
                                className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('logs', 'viewer')
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                    }`}
                            >
                                <Zap className="h-3 w-3 shrink-0" />
                                <span className="truncate">Runtime Logs</span>
                            </button>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
};
