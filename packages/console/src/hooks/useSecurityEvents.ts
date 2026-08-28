/**
 * useSecurityEvents — read-only audit surface over the backend security_events
 * table (blocked SSRF attempts, upstream auth failures, credential-resolution
 * failures). Tenant-scoped server-side; the list/summary calls filter to the
 * caller's tenant automatically.
 */

import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';

// Use relative URL to avoid mixed content errors (http on https)
// The reverse proxy handles routing to the correct backend service
const API_BASE = '';

// ============================================================================
// Types
// ============================================================================

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
    id: string;
    event_type: string;
    severity: SecuritySeverity;
    tenant_id: string | null;
    project_id: string | null;
    user_id: string | null;
    source_ip: string | null;
    details: Record<string, any> | null;
    created_at: string;
}

export interface SecurityEventsResponse {
    events: SecurityEvent[];
    total: number;
    limit: number;
    offset: number;
}

export interface SecurityEventsSummary {
    total: number;
    by_severity: Record<SecuritySeverity, number>;
}

export interface SecurityEventFilters {
    event_type?: string;
    severity?: SecuritySeverity | '';
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
}

// ============================================================================
// API
// ============================================================================

export const securityEventsApi = {
    list: async (filters: SecurityEventFilters = {}): Promise<SecurityEventsResponse> => {
        const params = new URLSearchParams();
        if (filters.event_type) params.set('event_type', filters.event_type);
        if (filters.severity) params.set('severity', filters.severity);
        if (filters.start_date) params.set('start_date', filters.start_date);
        if (filters.end_date) params.set('end_date', filters.end_date);
        params.set('limit', String(filters.limit ?? 100));
        params.set('offset', String(filters.offset ?? 0));
        const res = await fetch(`${API_BASE}/api/security-events/?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch security events');
        return res.json();
    },
    summary: async (): Promise<SecurityEventsSummary> => {
        const res = await fetch(`${API_BASE}/api/security-events/summary`);
        if (!res.ok) throw new Error('Failed to fetch security events summary');
        return res.json();
    },
};

// ============================================================================
// Hooks
// ============================================================================

export function useSecurityEvents(filters: SecurityEventFilters = {}) {
    return useQuery({
        queryKey: ['security-events', filters],
        queryFn: () => securityEventsApi.list(filters),
        staleTime: STALE.DEFAULT,
        refetchInterval: 60_000, // poll every minute — events are time-sensitive
    });
}

export function useSecurityEventsSummary() {
    return useQuery({
        queryKey: ['security-events-summary'],
        queryFn: () => securityEventsApi.summary(),
        staleTime: STALE.DEFAULT,
        refetchInterval: 60_000,
    });
}
