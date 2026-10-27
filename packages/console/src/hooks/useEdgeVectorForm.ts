/**
 * useEdgeVectorForm — Form state & CRUD handlers for edge vector store create/edit.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEdgeVectors, EdgeVector, edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { toast } from 'sonner';
import { showTestToast, TestResult } from '@/components/dashboard/settings/shared/edgeTestToast';

import { EDGE_VECTOR_PROVIDERS } from '@/components/dashboard/settings/shared/edgeConstants';
export { EDGE_VECTOR_PROVIDERS };

const API_BASE = '';

export function useEdgeVectorForm() {
    const queryClient = useQueryClient();
    const { data: vectors = [], isLoading } = useEdgeVectors();
    const [error, setError] = useState<string | null>(null);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form fields
    const [selectedProvider, setSelectedProvider] = useState<string>('pgvector');
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formAccountId, setFormAccountId] = useState<string | null>(null);
    // Provider-specific, non-secret config (dimensions, metric, table name, …).
    const [formProviderConfig, setFormProviderConfig] = useState<Record<string, any>>({});

    // Test connection & Delete
    const [testingId, setTestingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const refetchVectors = () => queryClient.invalidateQueries({ queryKey: ['edge-vectors'] });

    const resetForm = () => {
        setEditingId(null);
        setSelectedProvider('pgvector');
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormIsDefault(false);
        setFormAccountId(null);
        setFormProviderConfig({});
        setError(null);
    };

    const openCreate = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEdit = (vector: EdgeVector) => {
        resetForm();
        setEditingId(vector.id);
        setSelectedProvider(vector.provider);
        setFormName(vector.name);
        setFormUrl(vector.vector_url);
        setFormIsDefault(vector.is_default);
        setFormProviderConfig(vector.provider_config ? { ...vector.provider_config } : {});
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const payload: any = {
                name: formName,
                provider: selectedProvider,
                vector_url: formUrl,
                is_default: formIsDefault,
            };
            if (formToken) payload.vector_token = formToken;
            if (formAccountId) payload.provider_account_id = formAccountId;
            // Provider-specific config. Backend cleans empties on create and
            // merges (preserving server-side keys) on update.
            payload.provider_config = { ...formProviderConfig };

            const url = editingId
                ? `${API_BASE}/api/edge-vectors/${editingId}`
                : `${API_BASE}/api/edge-vectors/`;
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
            refetchVectors();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string, deleteRemote = false) => {
        setDeletingId(id);
        try {
            const qs = deleteRemote ? '?delete_remote=true' : '';
            const url = `${API_BASE}/api/edge-vectors/${id}${qs}`;
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            const data = await res.json().catch(() => ({}));
            toast.success(data.message || 'Vector store connection deleted');
            refetchVectors();
        } catch (e: any) {
            toast.error(e.message || 'Delete failed');
        } finally {
            setDeletingId(null);
        }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const data = await edgeInfrastructureApi.testEdgeVector(id);
            const vector = vectors.find(v => v.id === id);
            const label = EDGE_VECTOR_PROVIDERS.find(p => p.value === vector?.provider)?.label || 'Vector Store';
            showTestToast(data as any, label);
        } catch (e: any) {
            toast.error('Test failed', { description: e.message });
        } finally {
            setTestingId(null);
        }
    };

    const handleTestInline = async () => {
        setTestingId('inline');
        try {
            const providerLabel = EDGE_VECTOR_PROVIDERS.find(p => p.value === selectedProvider)?.label || 'Vector Store';

            if (editingId && !formToken) {
                const data = await edgeInfrastructureApi.testEdgeVector(editingId);
                showTestToast(data as any, providerLabel);
            } else {
                const data = await edgeInfrastructureApi.testEdgeVectorInline({
                    provider: selectedProvider,
                    vector_url: formUrl,
                    vector_token: formToken || undefined,
                });
                showTestToast(data as any, providerLabel);
            }
        } catch (e: any) {
            toast.error('Test failed', { description: e.message });
        } finally {
            setTestingId(null);
        }
    };

    return {
        // Data
        vectors,
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
        // Provider-specific config
        formProviderConfig,
        setFormProviderConfig,
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
