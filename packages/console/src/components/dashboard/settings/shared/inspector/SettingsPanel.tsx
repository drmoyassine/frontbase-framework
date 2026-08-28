/**
 * SettingsPanel — Provider settings detail views.
 *
 * Renders compatibility, bindings, routes, and crons views
 * based on the selected settings key.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Settings2, Globe, Clock, Cpu, ExternalLink,
} from 'lucide-react';
import type { InspectSettingsResponse } from './types';

interface SettingsPanelProps {
    settingsKey: string;
    settings: InspectSettingsResponse;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settingsKey, settings }) => {
    const s = settings.settings;

    if (settingsKey === 'compatibility') {
        return (
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                    <Cpu className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Compatibility</span>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg border bg-card">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Compatibility Date</div>
                            <div className="text-sm font-mono font-medium">{s.compatibility_date}</div>
                        </div>
                        <div className="p-3 rounded-lg border bg-card">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Usage Model</div>
                            <div className="text-sm font-mono font-medium capitalize">{s.usage_model}</div>
                        </div>
                    </div>
                    {(s.compatibility_flags?.length ?? 0) > 0 && (
                        <div className="p-3 rounded-lg border bg-card">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Compatibility Flags</div>
                            <div className="flex flex-wrap gap-1.5">
                                {s.compatibility_flags!.map(flag => (
                                    <Badge key={flag} variant="outline" className="text-[10px] font-mono">{flag}</Badge>
                                ))}
                            </div>
                        </div>
                    )}
                    {Object.keys(s.placement ?? {}).length > 0 && (
                        <div className="p-3 rounded-lg border bg-card">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Smart Placement</div>
                            <pre className="text-xs font-mono text-muted-foreground">{JSON.stringify(s.placement ?? {}, null, 2)}</pre>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (settingsKey === 'bindings') {
        return (
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                    <Settings2 className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Bindings ({s.bindings?.length ?? 0})</span>
                </div>
                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-2">
                        {(s.bindings?.length ?? 0) === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">No bindings configured</div>
                        ) : (
                            s.bindings!.map((binding, i) => (
                                <div key={i} className="p-3 rounded-lg border bg-card flex items-center gap-3">
                                    <Badge variant="outline" className="text-[10px] font-mono shrink-0 uppercase">{binding.type}</Badge>
                                    <span className="text-sm font-mono font-medium">{binding.name}</span>
                                    {binding.namespace_id && (
                                        <span className="text-[10px] text-muted-foreground font-mono ml-auto truncate max-w-[200px]">{binding.namespace_id}</span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </div>
        );
    }

    if (settingsKey === 'routes') {
        return (
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                    <Globe className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Routes ({s.routes?.length ?? 0})</span>
                </div>
                <div className="p-4 space-y-2">
                    {(s.routes?.length ?? 0) === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">No routes configured</div>
                    ) : (
                        s.routes!.map((route, i) => (
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
                        ))
                    )}
                    <p className="text-[10px] text-muted-foreground italic mt-3">
                        Routes define how traffic reaches this worker. Add custom domains in the Cloudflare Dashboard.
                    </p>
                </div>
            </div>
        );
    }

    if (settingsKey === 'crons') {
        return (
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Cron Triggers ({s.cron_triggers?.length ?? 0})</span>
                </div>
                <div className="p-4 space-y-2">
                    {(s.cron_triggers?.length ?? 0) === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">No cron triggers configured</div>
                    ) : (
                        s.cron_triggers!.map((cron, i) => (
                            <div key={i} className="p-3 rounded-lg border bg-card flex items-center gap-3">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-mono font-medium">{cron.cron}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    // ─── Function Config (Supabase / Vercel) ──────────────────────────
    if (settingsKey === 'config') {
        // Detect Vercel by presence of its fields
        const isVercelConfig = s.framework !== undefined || s.node_version !== undefined || s.region !== undefined;

        if (isVercelConfig) {
            return (
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                        <Settings2 className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Function Config</span>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 rounded-lg border bg-card">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Runtime</div>
                                <div className="text-sm font-mono font-medium">Edge Functions</div>
                            </div>
                            <div className="p-3 rounded-lg border bg-card">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Region</div>
                                <div className="text-sm font-mono font-medium">{s.region || 'auto'}</div>
                            </div>
                            <div className="p-3 rounded-lg border bg-card">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Framework</div>
                                <div className="text-sm font-mono font-medium">{s.framework || 'none'}</div>
                            </div>
                            <div className="p-3 rounded-lg border bg-card">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Node Version</div>
                                <div className="text-sm font-mono font-medium">{s.node_version || 'default'}</div>
                            </div>
                        </div>
                        {(s.build_command || s.install_command || s.output_directory) && (
                            <div className="space-y-2">
                                {s.build_command && (
                                    <div className="p-3 rounded-lg border bg-card">
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Build Command</div>
                                        <div className="text-sm font-mono font-medium">{s.build_command}</div>
                                    </div>
                                )}
                                {s.install_command && (
                                    <div className="p-3 rounded-lg border bg-card">
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Install Command</div>
                                        <div className="text-sm font-mono font-medium">{s.install_command}</div>
                                    </div>
                                )}
                                {s.output_directory && (
                                    <div className="p-3 rounded-lg border bg-card">
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Output Directory</div>
                                        <div className="text-sm font-mono font-medium">{s.output_directory}</div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="p-3 rounded-lg border bg-card">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Auto-expose System Env Vars</div>
                            <div className="text-sm font-medium">
                                <Badge variant={s.auto_expose_system_envs ? 'default' : 'secondary'} className="text-[10px]">
                                    {s.auto_expose_system_envs ? 'Enabled' : 'Disabled'}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Supabase config (default)
        return (
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                    <Settings2 className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Function Config</span>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg border bg-card">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">JWT Verification</div>
                            <div className="text-sm font-medium">
                                <Badge variant={s.verify_jwt ? 'default' : 'secondary'} className="text-[10px]">
                                    {s.verify_jwt ? 'Enabled' : 'Disabled'}
                                </Badge>
                            </div>
                        </div>
                        <div className="p-3 rounded-lg border bg-card">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Status</div>
                            <div className="text-sm font-mono font-medium capitalize">{s.status || 'unknown'}</div>
                        </div>
                        <div className="p-3 rounded-lg border bg-card">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Entrypoint</div>
                            <div className="text-sm font-mono font-medium">{s.entrypoint_path || 'default'}</div>
                        </div>
                        <div className="p-3 rounded-lg border bg-card">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Version</div>
                            <div className="text-sm font-mono font-medium">v{s.version ?? 0}</div>
                        </div>
                    </div>
                    {s.import_map && (
                        <div className="p-3 rounded-lg border bg-card">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Import Map</div>
                            <div className="text-sm font-mono">{s.import_map_path || 'configured'}</div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return null;
};
