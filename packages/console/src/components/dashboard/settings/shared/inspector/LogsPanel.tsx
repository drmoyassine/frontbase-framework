/**
 * LogsPanel — Terminal-style runtime log viewer.
 * 
 * Displays live provider logs with:
 * - Color-coded log levels (debug/info/warn/error)
 * - Level filtering
 * - Infinite scroll (cursor pagination)
 * - Log persistence toggle + interval config
 * 
 * Data: useQuery → GET /api/edge-engines/{id}/logs
 * Config: GET /api/edge-engines/{id}/logs/retention
 * Caching: staleTime: 60s, retry: 1, refetchOnWindowFocus: false (AGENTS.md)
 */

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from '@/components/ui/tooltip';
import {
    RefreshCw, Loader2, ChevronDown, AlertTriangle, Info,
    Database, Server, Clock, Cpu,
} from 'lucide-react';
import { API_BASE } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    source?: string;
    metadata?: Record<string, unknown>;
}

interface LogsResponse {
    logs: LogEntry[];
    next_cursor: string | null;
    provider: string;
    cached: boolean;
}

interface RetentionResponse {
    provider: string;
    plan_tier: string;
    retention_hours: number;
    log_persistence: {
        enabled?: boolean;
        interval_hours?: number;
        last_sync_at?: string;
    };
    prerequisites_met: boolean;
}

interface LogsPanelProps {
    engineId: string;
    engineName: string;
    /** CF settings — when present, compatibility section is rendered at top */
    settings?: {
        settings: {
            compatibility_date?: string;
            compatibility_flags?: string[];
            usage_model?: string;
            [key: string]: any;
        };
    };
}

// ─── Level Colors ───────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
    debug: 'text-gray-400',
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
};

const LEVEL_BG: Record<string, string> = {
    debug: 'bg-gray-500/20 text-gray-400',
    info: 'bg-blue-500/20 text-blue-400',
    warn: 'bg-yellow-500/20 text-yellow-400',
    error: 'bg-red-500/20 text-red-400',
};

// ─── Component ──────────────────────────────────────────────────────────────

export const LogsPanel: React.FC<LogsPanelProps> = ({ engineId, engineName, settings }) => {
    const queryClient = useQueryClient();
    const scrollRef = useRef<HTMLDivElement>(null);

    // Filter state
    const [levelFilter, setLevelFilter] = useState<string>('all');
    const [cursor, setCursor] = useState<string | undefined>();

    // Persistence config state
    const [intervalValue, setIntervalValue] = useState<number>(12);
    const [intervalUnit, setIntervalUnit] = useState<'hours' | 'days'>('hours');

    // ── Fetch live logs ─────────────────────────────────────────────────
    const { data: logsData, isLoading, refetch, isFetching } = useQuery<LogsResponse>({
        queryKey: ['edge-logs', engineId, levelFilter, cursor],
        queryFn: async () => {
            const params = new URLSearchParams({ limit: '100' });
            if (levelFilter !== 'all') params.set('level', levelFilter);
            if (cursor) params.set('cursor', cursor);
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engineId}/logs?${params}`);
            if (!resp.ok) throw new Error('Failed to fetch logs');
            return resp.json();
        },
        staleTime: 60_000, // custom TTL (not a STALE tier)
        enabled: !!engineId,
    });

    // ── Fetch retention config ──────────────────────────────────────────
    const { data: retention } = useQuery<RetentionResponse>({
        queryKey: ['edge-logs-retention', engineId],
        queryFn: async () => {
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engineId}/logs/retention`);
            if (!resp.ok) throw new Error('Failed to fetch retention config');
            return resp.json();
        },
        staleTime: STALE.STANDARD, // 5 min
        enabled: !!engineId,
    });

    // Sync config state from server
    useEffect(() => {
        if (retention?.log_persistence?.interval_hours) {
            const hours = retention.log_persistence.interval_hours;
            if (hours >= 24 && hours % 24 === 0) {
                setIntervalValue(hours / 24);
                setIntervalUnit('days');
            } else {
                setIntervalValue(hours);
                setIntervalUnit('hours');
            }
        }
    }, [retention]);

    // ── Update persistence config ───────────────────────────────────────
    const configMutation = useMutation({
        mutationFn: async (payload: { enabled?: boolean; interval_hours?: number }) => {
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engineId}/logs/config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                throw new Error(data.detail || 'Failed to update config');
            }
            return resp.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['edge-logs-retention', engineId] });
        },
    });

    // ── Auto-scroll to bottom on new logs ───────────────────────────────
    useEffect(() => {
        if (scrollRef.current && logsData?.logs?.length) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logsData?.logs?.length]);

    const logs = logsData?.logs || [];
    const isEnabled = retention?.log_persistence?.enabled || false;
    const prereqsMet = retention?.prerequisites_met || false;
    const retentionHours = retention?.retention_hours || 24;

    const missingResources: string[] = [];
    if (!prereqsMet && retention) {
        // We can't tell which specific resources are missing from the retention response,
        // so show a generic message
        missingResources.push('Edge DB', 'Edge Cache', 'Edge Queue');
    }

    // Calculate interval in hours for API
    const intervalHours = intervalUnit === 'days' ? intervalValue * 24 : intervalValue;

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-muted/30">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium">Runtime Logs</h3>
                    {retention && (
                        <Badge variant="outline" className="text-xs">
                            {retention.provider} · {retention.plan_tier}
                        </Badge>
                    )}
                    {logsData?.cached && (
                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400">
                            cached
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* Level filter */}
                    <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setCursor(undefined); }}>
                        <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="debug">Debug</SelectItem>
                            <SelectItem value="info">Info</SelectItem>
                            <SelectItem value="warn">Warn</SelectItem>
                            <SelectItem value="error">Error</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* ── Compatibility Section (from settings) ────────────── */}
            {settings?.settings && (settings.settings.compatibility_date || (settings.settings.compatibility_flags?.length ?? 0) > 0) && (
                <div className="px-4 py-2.5 border-b border-border/50 bg-muted/20">
                    <div className="flex items-center gap-2 mb-1.5">
                        <Cpu className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Compatibility</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {settings.settings.compatibility_date && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground">Date:</span>
                                <Badge variant="outline" className="text-[10px] font-mono">{settings.settings.compatibility_date}</Badge>
                            </div>
                        )}
                        {settings.settings.usage_model && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground">Model:</span>
                                <Badge variant="outline" className="text-[10px] font-mono capitalize">{settings.settings.usage_model}</Badge>
                            </div>
                        )}
                        {(settings.settings.compatibility_flags?.length ?? 0) > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-muted-foreground">Flags:</span>
                                {settings.settings.compatibility_flags!.map(flag => (
                                    <Badge key={flag} variant="secondary" className="text-[10px] font-mono">{flag}</Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Log Viewer (terminal style) ─────────────────────────── */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto font-mono text-xs bg-[#0d1117] text-gray-300 p-3 space-y-0.5"
            >
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                        <Server className="h-8 w-8 opacity-40" />
                        <p>No logs available</p>
                        <p className="text-xs opacity-60">
                            Deploy and run the engine to generate runtime logs
                        </p>
                    </div>
                ) : (
                    <>
                        {logs.map((log, i) => (
                            <div key={`${log.timestamp}-${i}`} className="flex gap-2 hover:bg-white/5 px-1 py-0.5 rounded">
                                {/* Timestamp */}
                                <span className="text-gray-500 shrink-0 select-none">
                                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--:--'}
                                </span>
                                {/* Level badge */}
                                <span className={`shrink-0 uppercase font-bold w-12 text-center ${LEVEL_COLORS[log.level] || 'text-gray-400'}`}>
                                    {log.level}
                                </span>
                                {/* Message */}
                                <span className="break-all">
                                    {log.message}
                                </span>
                            </div>
                        ))}

                        {/* Load more */}
                        {logsData?.next_cursor && (
                            <div className="pt-2 text-center">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-muted-foreground"
                                    onClick={() => setCursor(logsData.next_cursor!)}
                                >
                                    <ChevronDown className="h-3 w-3 mr-1" />
                                    Load more
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Persistence Config Bar ──────────────────────────────── */}
            <div className="border-t border-border/50 bg-muted/30 px-4 py-2.5 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 text-muted-foreground" />
                        <Label className="text-xs font-medium">Auto-Persist Logs</Label>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Info className="h-3 w-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                    {prereqsMet
                                        ? 'Automatically save provider logs to your edge database on a schedule.'
                                        : 'Requires Edge Database, Edge Cache, and Edge Queue connected to this engine.'}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <Switch
                        checked={isEnabled}
                        disabled={!prereqsMet || configMutation.isPending}
                        onCheckedChange={(checked) => {
                            configMutation.mutate({ enabled: checked });
                        }}
                    />
                </div>

                {/* Interval config — only show when enabled */}
                {isEnabled && (
                    <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Every</span>
                        <Input
                            type="number"
                            min={1}
                            max={intervalUnit === 'days' ? Math.floor(retentionHours / 24) : retentionHours}
                            value={intervalValue}
                            onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
                            className="h-7 w-16 text-xs"
                        />
                        <Select value={intervalUnit} onValueChange={(v) => setIntervalUnit(v as 'hours' | 'days')}>
                            <SelectTrigger className="h-7 w-20 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="hours">hours</SelectItem>
                                <SelectItem value="days">days</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={configMutation.isPending || intervalHours > retentionHours}
                            onClick={() => {
                                configMutation.mutate({ interval_hours: intervalHours });
                            }}
                        >
                            Save
                        </Button>
                        {intervalHours > retentionHours && (
                            <span className="text-xs text-red-400 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Max: {retentionHours}h
                            </span>
                        )}
                    </div>
                )}

                {/* Error message */}
                {configMutation.isError && (
                    <p className="text-xs text-red-400">
                        {configMutation.error instanceof Error ? configMutation.error.message : 'Config update failed'}
                    </p>
                )}

                {/* Last sync timestamp */}
                {isEnabled && retention?.log_persistence?.last_sync_at && (
                    <p className="text-xs text-muted-foreground">
                        Last sync: {new Date(retention.log_persistence.last_sync_at).toLocaleString()}
                    </p>
                )}
            </div>
        </div>
    );
};
