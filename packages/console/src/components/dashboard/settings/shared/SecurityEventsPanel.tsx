/**
 * SecurityEventsPanel — read-only audit view over backend security_events.
 *
 * Surfaces blocked SSRF attempts, upstream auth failures, and
 * credential-resolution failures recorded by the connection testers. Server-side
 * tenant-scoped; only the caller's tenant is visible. Filters by event type and
 * severity; "Load More" grows the page size (capped at the backend max).
 */

import React, { useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    useSecurityEvents, useSecurityEventsSummary,
    type SecurityEvent, type SecuritySeverity,
} from '@/hooks/useSecurityEvents';

interface SecurityEventsPanelProps {
    withCard?: boolean;
}

const EVENT_TYPES: { value: string; label: string }[] = [
    { value: 'ssrf_attempt_blocked', label: 'SSRF Attempt Blocked' },
    { value: 'vector_auth_failed', label: 'Vector Auth Failed' },
    { value: 'vector_connection_failed', label: 'Vector Connection Failed' },
    { value: 'credential_resolution_failed', label: 'Credential Resolution Failed' },
];

const SEVERITY_VARIANT: Record<SecuritySeverity, 'outline' | 'secondary' | 'default' | 'destructive'> = {
    low: 'outline',
    medium: 'secondary',
    high: 'default',
    critical: 'destructive',
};

const PAGE_SIZE = 100;
const MAX_LIMIT = 500;

function eventLabel(type: string): string {
    return EVENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

function detailPreview(details: Record<string, any> | null): string | null {
    if (!details || Object.keys(details).length === 0) return null;
    return JSON.stringify(details);
}

export const SecurityEventsPanel: React.FC<SecurityEventsPanelProps> = ({ withCard = false }) => {
    const [severity, setSeverity] = useState<SecuritySeverity | ''>('');
    const [eventType, setEventType] = useState<string>('');
    const [limit, setLimit] = useState<number>(PAGE_SIZE);

    const { data, isLoading, error } = useSecurityEvents({
        event_type: eventType || undefined,
        severity: severity || undefined,
        limit,
    });
    const summary = useSecurityEventsSummary();

    const events: SecurityEvent[] = data?.events ?? [];
    const canLoadMore = !!data && data.total > data.events.length && limit < MAX_LIMIT;

    const loadMore = () => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_LIMIT));

    const summaryBadges = (
        <div className="flex flex-wrap items-center gap-2">
            {summary.data && summary.data.total === 0 && (
                <Badge variant="outline" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> No events
                </Badge>
            )}
            {(['critical', 'high', 'medium', 'low'] as SecuritySeverity[]).map((sev) => {
                const count = summary.data?.by_severity[sev] ?? 0;
                if (!count) return null;
                return (
                    <Badge key={sev} variant={SEVERITY_VARIANT[sev]} className="gap-1 capitalize">
                        {sev}: {count}
                    </Badge>
                );
            })}
        </div>
    );

    const filters = (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Event type</Label>
                <Select value={eventType} onValueChange={(v) => { setEventType(v === 'all' ? '' : v); setLimit(PAGE_SIZE); }}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="All types" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {EVENT_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Severity</Label>
                <Select value={severity || 'all'} onValueChange={(v) => { setSeverity(v === 'all' ? '' : v as SecuritySeverity); setLimit(PAGE_SIZE); }}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="All severities" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All severities</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );

    const tableBody = (() => {
        if (isLoading && events.length === 0) {
            return (
                <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            );
        }
        if (error) {
            return (
                <div className="p-6 text-center text-sm text-destructive">
                    Failed to load security events.
                </div>
            );
        }
        if (events.length === 0) {
            return (
                <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                    <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="text-sm font-medium">No Security Events</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Blocked SSRF attempts and auth failures will appear here.
                    </p>
                </div>
            );
        }
        return (
            <div className="border rounded-lg overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[160px]">Time</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="w-[110px]">Severity</TableHead>
                            <TableHead className="w-[140px]">Source IP</TableHead>
                            <TableHead>Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {events.map((event) => {
                            const preview = detailPreview(event.details);
                            return (
                                <TableRow key={event.id}>
                                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap align-top">
                                        {new Date(event.created_at).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-sm align-top">
                                        {eventLabel(event.event_type)}
                                    </TableCell>
                                    <TableCell className="align-top">
                                        <Badge variant={SEVERITY_VARIANT[event.severity]} className="capitalize">
                                            {event.severity}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs font-mono align-top">
                                        {event.source_ip || '—'}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground align-top">
                                        {preview ? (
                                            <span className="font-mono" title={preview}>
                                                {preview.length > 80 ? `${preview.slice(0, 80)}…` : preview}
                                            </span>
                                        ) : '—'}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        );
    })();

    const content = (
        <div className="space-y-4">
            {summaryBadges}
            {filters}
            {tableBody}
            {canLoadMore && (
                <div className="flex justify-center">
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Load More ({data!.total - data!.events.length} remaining)
                    </Button>
                </div>
            )}
            {data && data.total > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                    Showing {data.events.length} of {data.total} event{data.total === 1 ? '' : 's'}
                </p>
            )}
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldAlert className="h-5 w-5" />
                            Security Events
                        </CardTitle>
                        <CardDescription>
                            Audit log of blocked SSRF attempts and authentication failures
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>{content}</CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="font-medium flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5" /> Security Events
                </h3>
                <p className="text-sm text-muted-foreground">
                    Audit log of blocked SSRF attempts and authentication failures
                </p>
            </div>
            {content}
        </div>
    );
};
