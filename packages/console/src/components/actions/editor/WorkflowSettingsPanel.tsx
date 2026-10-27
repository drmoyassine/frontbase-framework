/**
 * WorkflowSettingsPanel — Popover panel for per-workflow settings
 *
 * Configures runtime behavior grouped into four sections:
 *   1. Rate Control — rate limiting, debounce, cooldown
 *   2. Execution — timeout, concurrency, priority, timezone
 *   3. Queue & Durability — durable execution, retries, backoff, DLQ
 *   4. Observability — logging level
 *
 * Every control has an info tooltip (ⓘ) on hover explaining what it does.
 * Queue-dependent settings show an amber "Requires Queue" badge when queue is off.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Settings2, HelpCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';

// ─── Defaults ────────────────────────────────────────────

/** Default workflow settings (matches edge runtime defaults) */
const DEFAULTS = {
    // Rate Control
    rate_limit_enabled: true,
    rate_limit_max: 60,
    debounce_ms: 0,
    cooldown_ms: 0,
    // Execution
    execution_timeout_ms: 30000,
    concurrency_limit: 0,
    execution_priority: 'normal' as 'low' | 'normal' | 'high',
    timezone: 'UTC',
    // Queue & Durability
    queue_enabled: false,
    retry_count: 3,
    retry_backoff: 'exponential' as 'linear' | 'exponential',
    dlq_enabled: false,
    // Observability
    log_level: 'all' as 'none' | 'errors' | 'all',
};

export type WorkflowSettings = typeof DEFAULTS;

// ─── Tooltip Descriptions ────────────────────────────────

const TOOLTIPS: Record<string, string> = {
    rate_limit:
        'Caps how many times this workflow can trigger per minute. Protects against runaway loops and abuse.',
    debounce:
        'Collapses rapid triggers into one execution. Timer resets on each new trigger. 0 = disabled.',
    cooldown:
        'Minimum time between successful executions. Starts after completion, not trigger. 0 = disabled.',
    timeout:
        'Max time a single execution can run before being killed. Prevents hung workflows.',
    concurrency:
        'Max parallel executions of this workflow. 1 = serial queue. 0 = unlimited.',
    priority:
        'Queue ordering when multiple workflows compete for resources. Only effective with queue enabled.',
    timezone:
        'Timezone for scheduled triggers, execution timestamps, and cool-down calculations. Default: UTC.',
    queue:
        'Routes executions through a message queue for at-least-once delivery. Enables auto-retry on crash.',
    retry_count:
        'How many times a failed execution retries via the queue before giving up.',
    retry_backoff:
        'Delay strategy between retries. Exponential (1s → 2s → 4s) prevents hammering failing services.',
    dlq:
        'Parks permanently failed executions for manual inspection instead of silently dropping them.',
    log_level:
        'Per-workflow log verbosity. "errors" reduces noise in production, "all" logs everything for debugging.',
};

// ─── Props ───────────────────────────────────────────────

interface WorkflowSettingsPanelProps {
    /** Current settings from the draft (may be null/undefined for new drafts) */
    settings?: Record<string, any> | null;
    /** Called when settings change — parent should include these in the next save */
    onSettingsChange: (settings: WorkflowSettings) => void;
    /** Whether the draft has been saved at least once */
    hasDraft: boolean;
}

// ─── Helpers ─────────────────────────────────────────────

/** ⓘ icon with tooltip */
function InfoTip({ tip }: { tip: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help shrink-0" />
            </TooltipTrigger>
            <TooltipContent
                side="top"
                className="max-w-[240px] text-xs leading-relaxed"
            >
                {tip}
            </TooltipContent>
        </Tooltip>
    );
}

/** Section header */
function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <div className="pt-2 pb-1 border-t first:border-t-0 first:pt-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {children}
            </span>
        </div>
    );
}

/** "Requires Queue" badge shown when queue-dependent settings are visible but queue is off */
function RequiresQueueBadge({ queueEnabled }: { queueEnabled: boolean }) {
    if (queueEnabled) return null;
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-600 dark:text-amber-400 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    Queue
                </span>
            </TooltipTrigger>
            <TooltipContent
                side="top"
                className="max-w-[200px] text-xs"
            >
                This setting requires &quot;Durable Execution (Queue)&quot; to be enabled and a Queue provider configured on the target engine.
            </TooltipContent>
        </Tooltip>
    );
}

// ─── Timezone Picker ─────────────────────────────────────

const ALL_TIMEZONES = (() => {
    try {
        return (Intl as any).supportedValuesOf('timeZone') as string[];
    } catch {
        // Fallback for older browsers
        return [
            'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
            'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
            'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney',
            'Pacific/Auckland', 'Africa/Cairo', 'America/Sao_Paulo',
        ];
    }
})();

function TimezonePicker({
    value,
    onChange,
}: {
    value: string;
    onChange: (tz: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search) return ALL_TIMEZONES.slice(0, 50);
        const q = search.toLowerCase();
        return ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q)).slice(0, 50);
    }, [search]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-full justify-start text-xs font-normal"
                    role="combobox"
                    aria-expanded={open}
                >
                    {value || 'UTC'}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-0" align="start" side="bottom">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search timezone..."
                        className="h-8 text-xs"
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList className="max-h-[200px]">
                        <CommandEmpty className="text-xs py-2 text-center">
                            No timezone found.
                        </CommandEmpty>
                        <CommandGroup>
                            {filtered.map((tz) => (
                                <CommandItem
                                    key={tz}
                                    value={tz}
                                    onSelect={() => {
                                        onChange(tz);
                                        setOpen(false);
                                        setSearch('');
                                    }}
                                    className="text-xs"
                                >
                                    {tz}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

// ─── Main Component ──────────────────────────────────────

export function WorkflowSettingsPanel({
    settings,
    onSettingsChange,
    hasDraft,
}: WorkflowSettingsPanelProps) {
    // Merge saved settings with defaults
    const [local, setLocal] = useState<WorkflowSettings>({
        ...DEFAULTS,
        ...(settings || {}),
    });

    // Sync when draft loads/reloads
    useEffect(() => {
        setLocal({ ...DEFAULTS, ...(settings || {}) });
    }, [settings]);

    const update = (key: keyof WorkflowSettings, value: any) => {
        const next = { ...local, [key]: value };
        setLocal(next);
        onSettingsChange(next);
    };

    return (
        <TooltipProvider delayDuration={200}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        title="Workflow Settings"
                    >
                        <Settings2 className="w-4 h-4" />
                        Settings
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    side="bottom"
                    className="w-[340px] sm:w-96 p-4 space-y-3 max-h-[80vh] overflow-y-auto"
                >
                    {/* Header */}
                    <div className="space-y-1">
                        <h4 className="font-medium text-sm">Workflow Settings</h4>
                        <p className="text-xs text-muted-foreground">
                            Configure runtime behavior for this workflow.
                        </p>
                    </div>

                    {/* ═══ RATE CONTROL ═══ */}
                    <SectionHeader>Rate Control</SectionHeader>

                    {/* Rate Limiting */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <Label htmlFor="rate-limit" className="text-xs font-medium">
                                    Rate Limiting
                                </Label>
                                <InfoTip tip={TOOLTIPS.rate_limit} />
                            </div>
                            <Switch
                                id="rate-limit"
                                checked={local.rate_limit_enabled}
                                onCheckedChange={(v) => update('rate_limit_enabled', v)}
                                className="scale-75"
                            />
                        </div>
                        {local.rate_limit_enabled && (
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min={1}
                                    max={10000}
                                    value={local.rate_limit_max}
                                    onChange={(e) =>
                                        update('rate_limit_max', parseInt(e.target.value) || 60)
                                    }
                                    className="h-8 w-20 text-xs"
                                />
                                <span className="text-xs text-muted-foreground">
                                    executions / minute
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Debounce Window */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Label htmlFor="debounce" className="text-xs font-medium">
                                Debounce Window
                            </Label>
                            <InfoTip tip={TOOLTIPS.debounce} />
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                id="debounce"
                                type="number"
                                min={0}
                                max={600000}
                                step={1000}
                                value={local.debounce_ms}
                                onChange={(e) =>
                                    update('debounce_ms', parseInt(e.target.value) || 0)
                                }
                                className="h-8 w-24 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">
                                ms (0 = disabled)
                            </span>
                        </div>
                    </div>

                    {/* Cool-down Period */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Label htmlFor="cooldown" className="text-xs font-medium">
                                Cool-down Period
                            </Label>
                            <InfoTip tip={TOOLTIPS.cooldown} />
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                id="cooldown"
                                type="number"
                                min={0}
                                max={600000}
                                step={1000}
                                value={local.cooldown_ms}
                                onChange={(e) =>
                                    update('cooldown_ms', parseInt(e.target.value) || 0)
                                }
                                className="h-8 w-24 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">
                                ms (0 = disabled)
                            </span>
                        </div>
                    </div>

                    {/* ═══ EXECUTION ═══ */}
                    <SectionHeader>Execution</SectionHeader>

                    {/* Execution Timeout */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Label htmlFor="timeout" className="text-xs font-medium">
                                Execution Timeout
                            </Label>
                            <InfoTip tip={TOOLTIPS.timeout} />
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                id="timeout"
                                type="number"
                                min={1000}
                                max={300000}
                                step={1000}
                                value={local.execution_timeout_ms}
                                onChange={(e) =>
                                    update(
                                        'execution_timeout_ms',
                                        parseInt(e.target.value) || 30000
                                    )
                                }
                                className="h-8 w-24 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">ms</span>
                        </div>
                    </div>

                    {/* Concurrency Limit */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Label htmlFor="concurrency" className="text-xs font-medium">
                                Concurrency Limit
                            </Label>
                            <InfoTip tip={TOOLTIPS.concurrency} />
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                id="concurrency"
                                type="number"
                                min={0}
                                max={50}
                                value={local.concurrency_limit}
                                onChange={(e) =>
                                    update('concurrency_limit', parseInt(e.target.value) || 0)
                                }
                                className="h-8 w-16 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">
                                0 = unlimited
                            </span>
                        </div>
                    </div>

                    {/* Execution Priority */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Label className="text-xs font-medium">
                                Execution Priority
                            </Label>
                            <InfoTip tip={TOOLTIPS.priority} />
                        </div>
                        <Select
                            value={local.execution_priority}
                            onValueChange={(v) => update('execution_priority', v)}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low" className="text-xs">Low</SelectItem>
                                <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                                <SelectItem value="high" className="text-xs">High</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Timezone */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Label className="text-xs font-medium">Timezone</Label>
                            <InfoTip tip={TOOLTIPS.timezone} />
                        </div>
                        <TimezonePicker
                            value={local.timezone}
                            onChange={(tz) => update('timezone', tz)}
                        />
                    </div>

                    {/* ═══ QUEUE & DURABILITY ═══ */}
                    <SectionHeader>Queue &amp; Durability</SectionHeader>

                    {/* Durable Execution toggle */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <Label htmlFor="queue" className="text-xs font-medium">
                                    Durable Execution (Queue)
                                </Label>
                                <InfoTip tip={TOOLTIPS.queue} />
                            </div>
                            <Switch
                                id="queue"
                                checked={local.queue_enabled}
                                onCheckedChange={(v) => update('queue_enabled', v)}
                                className="scale-75"
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Route through message queue for auto-retry
                        </p>
                    </div>

                    {local.queue_enabled && (
                        <div className="space-y-3 pl-1 border-l-2 border-border ml-1">
                            {/* Retry Count */}
                            <div className="space-y-2 pl-2">
                                <div className="flex items-center gap-1.5">
                                    <Label htmlFor="retries" className="text-xs font-medium">
                                        Retry Count
                                    </Label>
                                    <InfoTip tip={TOOLTIPS.retry_count} />
                                    <RequiresQueueBadge queueEnabled={local.queue_enabled} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="retries"
                                        type="number"
                                        min={0}
                                        max={10}
                                        value={local.retry_count}
                                        onChange={(e) =>
                                            update('retry_count', parseInt(e.target.value) || 3)
                                        }
                                        className="h-8 w-16 text-xs"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        retries on failure
                                    </span>
                                </div>
                            </div>

                            {/* Retry Backoff */}
                            <div className="space-y-2 pl-2">
                                <div className="flex items-center gap-1.5">
                                    <Label className="text-xs font-medium">
                                        Retry Backoff
                                    </Label>
                                    <InfoTip tip={TOOLTIPS.retry_backoff} />
                                    <RequiresQueueBadge queueEnabled={local.queue_enabled} />
                                </div>
                                <Select
                                    value={local.retry_backoff}
                                    onValueChange={(v) => update('retry_backoff', v)}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="linear" className="text-xs">
                                            Linear (1s → 2s → 3s)
                                        </SelectItem>
                                        <SelectItem value="exponential" className="text-xs">
                                            Exponential (1s → 2s → 4s)
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Dead Letter Queue */}
                            <div className="pl-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <Label htmlFor="dlq" className="text-xs font-medium">
                                            Dead Letter Queue
                                        </Label>
                                        <InfoTip tip={TOOLTIPS.dlq} />
                                        <RequiresQueueBadge queueEnabled={local.queue_enabled} />
                                    </div>
                                    <Switch
                                        id="dlq"
                                        checked={local.dlq_enabled}
                                        onCheckedChange={(v) => update('dlq_enabled', v)}
                                        className="scale-75"
                                    />
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Park failed executions for manual inspection
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ═══ OBSERVABILITY ═══ */}
                    <SectionHeader>Observability</SectionHeader>

                    {/* Logging Level */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Label className="text-xs font-medium">Logging Level</Label>
                            <InfoTip tip={TOOLTIPS.log_level} />
                        </div>
                        <Select
                            value={local.log_level}
                            onValueChange={(v) => update('log_level', v)}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none" className="text-xs">None</SelectItem>
                                <SelectItem value="errors" className="text-xs">Errors only</SelectItem>
                                <SelectItem value="all" className="text-xs">All</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Footer */}
                    <p className="text-[10px] text-muted-foreground pt-2 border-t">
                        Settings are saved with the workflow and applied on publish.
                    </p>
                </PopoverContent>
            </Popover>
        </TooltipProvider>
    );
}
