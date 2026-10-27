/**
 * HealthCheckPopover — Shared health check trigger + result display.
 *
 * Used in:
 *   - EdgeInspectorDialog header (pill variant)
 *   - EdgeEnginesSection card actions (icon variant)
 *
 * On open → calls GET /api/edge-engines/{id}/health-check (proxied via FastAPI)
 * → shows status, version, provider, uptime, and binding health in a popover.
 */

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
    Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from '@/components/ui/tooltip';
import { Zap, Loader2, Database, HardDrive, Layers, Copy, Check, ExternalLink } from 'lucide-react';
import { useEngineHealthCheck, type BindingStatus } from '@/hooks/useEdgeInfrastructure';

// ─── Provider label mapping ────────────────────────────────────────────────
// Maps raw platform strings from health.ts → human-readable labels.
const PROVIDER_DISPLAY_LABELS: Record<string, string> = {
    'cloudflare': 'Cloudflare Workers',
    'cloudflare-lite': 'Cloudflare Workers',
    'vercel-edge': 'Vercel Edge',
    'vercel-edge-lite': 'Vercel Edge',
    'supabase-edge': 'Supabase Edge',
    'supabase-edge-lite': 'Supabase Edge',
    'netlify-edge': 'Netlify Edge',
    'netlify-edge-lite': 'Netlify Edge',
    'deno-deploy': 'Deno Deploy',
    'deno-deploy-lite': 'Deno Deploy',
    'docker': 'Docker (Local)',
    'node': 'Node.js',
};

// ─── Binding status helpers ─────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
    ok: 'bg-green-500/10 text-green-400 border-green-500/20',
    error: 'bg-red-500/10 text-red-400 border-red-500/20',
    not_configured: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    degraded: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    down: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const BINDING_ICONS: Record<string, React.ElementType> = {
    stateDb: Database,
    cache: HardDrive,
    queue: Layers,
};

const BINDING_LABELS: Record<string, string> = {
    stateDb: 'State DB',
    cache: 'Cache',
    queue: 'Queue',
};

function BindingRow({ name, binding }: { name: string; binding: BindingStatus }) {
    const Icon = BINDING_ICONS[name] || Database;
    return (
        <div className="flex items-center gap-2 py-1">
            <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-foreground w-14">{BINDING_LABELS[name] || name}</span>
            <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[binding.status] || ''}`}>
                {binding.status}
            </Badge>
            {binding.provider !== 'hidden' && binding.provider !== 'none' && (
                <span className="text-[10px] text-muted-foreground font-mono ml-auto">{binding.provider}</span>
            )}
        </div>
    );
}

function formatUptime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface HealthCheckPopoverProps {
    engineId: string;
    /** Engine endpoint URL — displayed in health card with copy/open actions */
    engineUrl?: string;
    /** 'pill' = Inspector header style, 'icon' = engine card minimal icon */
    variant?: 'pill' | 'icon';
}

export const HealthCheckPopover: React.FC<HealthCheckPopoverProps> = ({
    engineId,
    engineUrl,
    variant = 'icon',
}) => {
    const { mutate: checkHealth, data, isPending, reset } = useEngineHealthCheck(engineId);
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    // Reset stale data when engine changes
    useEffect(() => {
        reset();
    }, [engineId, reset]);

    // Fire health check automatically when popover opens
    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) {
            checkHealth();
        }
    };

    const isHealthy = data?.status === 'ok';
    const isError = data?.status === 'error';
    const hasResult = !!data;

    // ── Trigger button ──────────────────────────────────────────────────
    const trigger = variant === 'pill' ? (
        <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
        >
            {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
                <Zap className={`h-3 w-3 ${
                    isHealthy ? 'text-green-400' :
                    isError ? 'text-red-400' :
                    ''
                }`} />
            )}
            {hasResult ? (
                <span className={isHealthy ? 'text-green-400' : 'text-red-400'}>
                    {isHealthy ? 'Healthy' : 'Unhealthy'}
                </span>
            ) : (
                'Health'
            )}
        </Button>
    ) : (
        <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Health Check"
        >
            {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <Zap className={`h-4 w-4 ${
                    isHealthy ? 'text-green-400' :
                    isError ? 'text-red-400' :
                    'text-muted-foreground'
                }`} />
            )}
        </Button>
    );

    // ── Popover content ─────────────────────────────────────────────────
    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                {trigger}
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="end" side="bottom">
                {isPending ? (
                    <div className="p-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Checking health…
                    </div>
                ) : !hasResult ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                        Click to run a health check
                    </div>
                ) : isError ? (
                    <div className="p-4 space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-red-400" />
                            <span className="text-sm font-medium text-red-400">Unhealthy</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{data.error}</p>
                    </div>
                ) : (
                    <div>
                        {/* Status header */}
                        <div className="px-4 py-3 border-b border-border/50">
                            <div className="flex items-center gap-2 mb-2">
                                <div className={`h-2 w-2 rounded-full ${isHealthy ? 'bg-green-400' : 'bg-red-400'}`} />
                                <span className="text-sm font-medium">{isHealthy ? 'Healthy' : 'Unhealthy'}</span>
                                {data.version && (
                                    <Badge variant="outline" className="text-[10px] ml-auto font-mono">v{data.version}</Badge>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                                {data.provider && (
                                    <span>Provider: <span className="text-foreground">{PROVIDER_DISPLAY_LABELS[data.provider] || data.provider}</span></span>
                                )}
                                {data.uptime_seconds != null && (
                                    <span>Uptime: <span className="text-foreground">{formatUptime(data.uptime_seconds)}</span></span>
                                )}
                            </div>
                            {/* Endpoint URL — copy + open */}
                            {engineUrl && (
                                <div className="flex items-center gap-1.5 mt-2 bg-muted/50 rounded-md px-2 py-1.5 border border-border/50">
                                    <span className="flex-1 min-w-0 truncate text-[10px] font-mono text-blue-400">
                                        {engineUrl.startsWith('http') ? engineUrl : `https://${engineUrl}`}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 shrink-0"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const url = engineUrl.startsWith('http') ? engineUrl : `https://${engineUrl}`;
                                            navigator.clipboard.writeText(url);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        }}
                                        title="Copy URL"
                                    >
                                        {copied ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 shrink-0"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const url = engineUrl.startsWith('http') ? engineUrl : `https://${engineUrl}`;
                                            window.open(url, '_blank', 'noreferrer');
                                        }}
                                        title="Open in browser"
                                    >
                                        <ExternalLink className="h-2.5 w-2.5" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Bindings */}
                        {data.bindings && (
                            <div className="px-4 py-3">
                                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Bindings
                                </div>
                                {Object.entries(data.bindings).map(([name, binding]) => (
                                    <BindingRow key={name} name={name} binding={binding} />
                                ))}
                            </div>
                        )}

                        {/* Resilience (Sprint 2D) — shows only when a binding is degraded/down */}
                        {data.resilience && (data.resilience.stateDb?.level !== 'ok' || data.resilience.cache?.level !== 'ok') && (
                            <div className="px-4 py-3 border-t border-border">
                                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Resilience
                                </div>
                                {(['stateDb', 'cache'] as const).map((comp) => {
                                    const r = data.resilience?.[comp];
                                    if (!r || r.level === 'ok') return null;
                                    return (
                                        <div key={comp} className="flex items-center gap-2 py-1">
                                            <span className="text-xs text-foreground w-14 capitalize">{comp === 'stateDb' ? 'State DB' : 'Cache'}</span>
                                            <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[r.level] || ''}`}>
                                                {r.level}
                                            </Badge>
                                            {r.reason && (
                                                <span className="text-[10px] text-muted-foreground ml-auto truncate" title={r.reason}>{r.reason}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Timestamp */}
                        {data.timestamp && (
                            <div className="px-4 pb-3 text-[10px] text-muted-foreground">
                                Checked: {new Date(data.timestamp).toLocaleTimeString()}
                            </div>
                        )}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
};
