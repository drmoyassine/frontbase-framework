/**
 * useEdgeEngineActions — Handler functions for EdgeEnginesSection.
 * 
 * Extracted from EdgeEnginesSection.tsx for single-responsibility compliance.
 * Contains toggle, delete, bulk operations, AI model delete, and time formatting.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    edgeInfrastructureApi,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';
import { API_BASE } from '@/components/dashboard/settings/shared/edgeConstants';
import { toast } from 'sonner';

interface UseEdgeEngineActionsParams {
    providers: any[];
    refetchEngines: () => Promise<any>;
}

export function useEdgeEngineActions({ providers, refetchEngines }: UseEdgeEngineActionsParams) {
    const queryClient = useQueryClient();
    const [error, setError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [redeployingIds, setRedeployingIds] = useState<Set<string>>(new Set());
    const [deletingAIId, setDeletingAIId] = useState<string | null>(null);

    // ── Selection ────────────────────────────────────────────────────────

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = (selectableEngines: EdgeEngine[]) => {
        const allSelected = selectableEngines.length > 0 && selectableEngines.every(e => selectedIds.has(e.id));
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(selectableEngines.map(e => e.id)));
        }
    };

    // ── Single Engine Actions ────────────────────────────────────────────

    const handleToggle = async (engine: EdgeEngine) => {
        try {
            await edgeInfrastructureApi.updateEngine({
                id: engine.id,
                data: { is_active: !engine.is_active }
            });
            await refetchEngines();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleDelete = async (engine: EdgeEngine, alsoDeleteRemote: boolean) => {
        try {
            await edgeInfrastructureApi.deleteEngine(engine.id, alsoDeleteRemote);
            await refetchEngines();
            // Invalidate resource queries so target counts refresh
            queryClient.invalidateQueries({ queryKey: ['edge-databases'] });
            queryClient.invalidateQueries({ queryKey: ['edge-caches'] });
            queryClient.invalidateQueries({ queryKey: ['edge-queues'] });
        } catch (e: any) {
            alert(e.message);
        }
    };

    // ── Bulk Actions ────────────────────────────────────────────────────

    const handleBulkDelete = async (deleteRemote: boolean) => {
        setBulkLoading(true);
        try {
            const result = await edgeInfrastructureApi.batchDelete([...selectedIds], deleteRemote);
            if (result.failed.length > 0) {
                setError(`${result.success.length} deleted, ${result.failed.length} failed: ${result.failed.map((f: any) => f.error).join(', ')}`);
            }
            setSelectedIds(new Set());
            await refetchEngines();
            // Invalidate resource queries so target counts refresh
            queryClient.invalidateQueries({ queryKey: ['edge-databases'] });
            queryClient.invalidateQueries({ queryKey: ['edge-caches'] });
            queryClient.invalidateQueries({ queryKey: ['edge-queues'] });
        } catch (e: any) { setError(e.message); } finally { setBulkLoading(false); }
    };

    const handleBulkToggle = async (activate: boolean) => {
        setBulkLoading(true);
        try {
            await edgeInfrastructureApi.batchToggle([...selectedIds], activate);
            setSelectedIds(new Set());
            await refetchEngines();
        } catch (e: any) { alert(e.message); } finally { setBulkLoading(false); }
    };

    const handleBulkSyncCheck = async () => {
        setBulkLoading(true);
        try {
            const result = await edgeInfrastructureApi.batchSyncCheck([...selectedIds]);
            if (result.failed.length > 0) {
                alert(`${result.success.length} reachable, ${result.failed.length} unreachable:\n${result.failed.map((f: any) => `${f.id}: ${f.error}`).join('\n')}`);
            }
            await refetchEngines();
        } catch (e: any) { alert(e.message); } finally { setBulkLoading(false); }
    };

    const handleBulkRedeploy = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;

        // Mark all selected engines as redeploying — their individual buttons show spinners
        setRedeployingIds(prev => {
            const next = new Set(prev);
            ids.forEach(id => next.add(id));
            return next;
        });
        setBulkLoading(true);

        // Fire individual redeploys concurrently so each engine's button
        // clears its spinner independently as it completes
        const results = await Promise.allSettled(
            ids.map(async (id) => {
                try {
                    await edgeInfrastructureApi.redeployEngine(id);
                    return { id, status: 'success' as const };
                } catch (e: any) {
                    return { id, status: 'failed' as const, error: e.message };
                } finally {
                    // Clear this engine's spinner immediately on completion
                    setRedeployingIds(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                    // Invalidate so the synced badge updates for this engine
                    queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
                }
            })
        );

        // Summarize results
        const settled = results.map(r => r.status === 'fulfilled' ? r.value : { id: '', status: 'failed' as const, error: 'Unknown error' });
        const succeeded = settled.filter(r => r.status === 'success');
        const failed = settled.filter(r => r.status === 'failed');

        if (failed.length > 0) {
            alert(`${succeeded.length} deployed, ${failed.length} failed:\n${failed.map(f => `${f.id}: ${f.error}`).join('\n')}`);
        } else {
            toast.success('Bulk Redeploy Completed', { description: `Redeployed ${succeeded.length} engines.` });
        }

        setSelectedIds(new Set());
        setBulkLoading(false);
    };

    // ── AI Model Delete ────────────────────────────────────────────────

    const handleAIDelete = async (modelId: string) => {
        setDeletingAIId(modelId);
        try {
            const res = await fetch(`${API_BASE}/api/edge-gpu/${modelId}`, { method: 'DELETE' });
            const result = await res.json();
            if (!res.ok) throw new Error(result.detail || 'Delete failed');
            const redeployMsg = result.redeployed ? ' · Engine redeployed ✓' : '';
            toast.success('AI Model Removed', { description: `Deleted${redeployMsg}` });
            queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
            await refetchEngines();
        } catch (err: any) {
            toast.error('Delete Failed', { description: err.message });
        } finally {
            setDeletingAIId(null);
        }
    };

    return {
        // State
        error, setError,
        selectedIds, setSelectedIds,
        bulkLoading,
        bulkDeleteOpen, setBulkDeleteOpen,
        redeployingIds, setRedeployingIds,
        deletingAIId,

        // Selection
        toggleSelect,
        toggleSelectAll,

        // Actions
        handleToggle,
        handleDelete,
        handleBulkDelete,
        handleBulkToggle,
        handleBulkSyncCheck,
        handleBulkRedeploy,
        handleAIDelete,
    };
}


// ── Utilities ──────────────────────────────────────────────────────────

export function parseSafeDate(dateInput: string | Date | null | undefined): Date | null {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;
    if (typeof dateInput === 'string') {
        let cleaned = dateInput.trim();
        // Replace space with T to satisfy W3C/Safari parsing
        if (cleaned.includes(' ') && !cleaned.includes('T')) {
            cleaned = cleaned.replace(' ', 'T');
        }
        // Heal the legacy "+00:00Z" / "Z+00:00" double suffix — an offset
        // followed by a Z marker is not parseable by Date; strip the offset.
        cleaned = cleaned.replace(/([+-]\d{2}:\d{2})Z$/, 'Z').replace(/Z([+-]\d{2}:\d{2})$/, 'Z');
        // Append Z if no timezone offset is present but time part exists
        if (!cleaned.includes('Z') && !cleaned.includes('+') && !cleaned.includes('-') && cleaned.includes('T')) {
            cleaned = cleaned + 'Z';
        }
        const d = new Date(cleaned);
        if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
}

export function formatSafeDate(dateInput: string | Date | null | undefined): string {
    const d = parseSafeDate(dateInput);
    if (!d) return 'Invalid Date';
    return d.toLocaleDateString();
}

export function timeAgo(iso: string | null | undefined): string {
    if (!iso) return 'Never';
    const date = parseSafeDate(iso);
    if (!date) return 'Never';
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
