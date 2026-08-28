/**
 * useEdgeCacheForm — Form state & CRUD handlers for edge cache create/edit.
 *
 * Extracted from EdgeCachesForm.tsx for single-responsibility compliance.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEdgeCaches, EdgeCache } from '@/hooks/useEdgeInfrastructure';
import { toast } from 'sonner';
import { showTestToast, TestResult } from '@/components/dashboard/settings/shared/edgeTestToast';

import { EDGE_CACHE_PROVIDERS } from '@/components/dashboard/settings/shared/edgeConstants';

const API_BASE = '';

/** Re-export from centralized registry for backward compatibility */
export const CACHE_PROVIDER_OPTIONS = EDGE_CACHE_PROVIDERS;

export function useEdgeCacheForm(options?: { onSaveSuccess?: (cache: any) => void }) {
    const queryClient = useQueryClient();
    const { data: caches = [], isLoading } = useEdgeCaches();
    const [error, setError] = useState<string | null>(null);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form fields
    const [selectedProvider, setSelectedProvider] = useState<string>('upstash');
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formAccountId, setFormAccountId] = useState<string | null>(null);

    // Test connection & Delete
    const [testingId, setTestingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const refetchCaches = () => queryClient.invalidateQueries({ queryKey: ['edge-caches'] });

    const resetForm = () => {
        setEditingId(null);
        setSelectedProvider('upstash');
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormIsDefault(false);
        setFormAccountId(null);
        setError(null);
    };

    const openCreate = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEdit = (cache: EdgeCache) => {
        resetForm();
        setEditingId(cache.id);
        setSelectedProvider(cache.provider);
        setFormName(cache.name);
        setFormUrl(cache.cache_url);
        setFormIsDefault(cache.is_default);
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const payload: any = {
                name: formName,
                provider: selectedProvider,
                cache_url: formUrl,
                is_default: formIsDefault,
            };
            if (formToken) payload.cache_token = formToken;
            if (formAccountId) payload.provider_account_id = formAccountId;

            const url = editingId
                ? `${API_BASE}/api/edge-caches/${editingId}`
                : `${API_BASE}/api/edge-caches/`;
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            setDialogOpen(false);
            resetForm();
            refetchCaches();
            if (options?.onSaveSuccess) {
                options.onSaveSuccess(data);
            }
            if (data.warning) {
                toast.warning(data.warning);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string, deleteRemote: boolean = false) => {
        setDeletingId(id);
        try {
            const url = deleteRemote
                ? `${API_BASE}/api/edge-caches/${id}?delete_remote=true`
                : `${API_BASE}/api/edge-caches/${id}`;
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            const result = await res.json();
            if (result.remote_deleted) {
                toast.success('Deleted remotely', { description: result.message });
            }
            refetchCaches();
        } catch (e: any) { setError(e.message); }
        finally { setDeletingId(null); }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-caches/${id}/test`, { method: 'POST' });
            const data: TestResult = await res.json();
            const cache = caches.find(c => c.id === id);
            const label = CACHE_PROVIDER_OPTIONS.find(p => p.value === cache?.provider)?.label || 'Cache';
            showTestToast(data, label);
        } catch (e: any) {
            toast.error('Test failed', { description: e.message });
        } finally { setTestingId(null); }
    };

    const handleTestInline = async () => {
        setTestingId('inline');
        try {
            const providerLabel = CACHE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.label || 'Cache';

            if (editingId && !formToken) {
                const res = await fetch(`${API_BASE}/api/edge-caches/${editingId}/test`, { method: 'POST' });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            } else {
                const res = await fetch(`${API_BASE}/api/edge-caches/test-connection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formName || 'Test',
                        provider: selectedProvider,
                        cache_url: formUrl,
                        cache_token: formToken || null,
                        provider_account_id: formAccountId || null,
                    }),
                });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            }
        } catch (e: any) {
            toast.error('Test failed', { description: e.message });
        } finally { setTestingId(null); }
    };

    return {
        // Data
        caches,
        isLoading,
        error,
        // Dialog state
        dialogOpen,
        setDialogOpen,
        editingId,
        // Form fields
        selectedProvider,
        setSelectedProvider,
        formName,
        setFormName,
        formUrl,
        setFormUrl,
        formToken,
        setFormToken,
        formIsDefault,
        setFormIsDefault,
        isSaving,
        // Actions
        openCreate,
        openEdit,
        resetForm,
        handleSave,
        handleDelete,
        handleTest,
        handleTestInline,
        // Loading states
        testingId,
        deletingId,
        // Account link
        formAccountId,
        setFormAccountId,
    };
}
