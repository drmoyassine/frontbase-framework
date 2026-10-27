/**
 * useEdgeQueueForm — Form state & CRUD handlers for edge queue create/edit.
 *
 * Extracted from EdgeQueuesForm.tsx for single-responsibility compliance and reusability.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEdgeQueues, EdgeQueue } from '@/hooks/useEdgeInfrastructure';
import { toast } from 'sonner';
import { showTestToast, TestResult } from '@/components/dashboard/settings/shared/edgeTestToast';
import { EDGE_QUEUE_PROVIDERS } from '@/components/dashboard/settings/shared/edgeConstants';

const API_BASE = '';
const QUEUE_PROVIDER_OPTIONS = EDGE_QUEUE_PROVIDERS;

interface UseEdgeQueueFormOptions {
    onSaveSuccess?: (queue: EdgeQueue) => void;
}

export function useEdgeQueueForm(options?: UseEdgeQueueFormOptions) {
    const queryClient = useQueryClient();
    const { data: queues = [], isLoading } = useEdgeQueues();
    const [error, setError] = useState<string | null>(null);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form fields
    const [selectedProvider, setSelectedProvider] = useState<string>('qstash');
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formSigningKey, setFormSigningKey] = useState('');
    const [formNextSigningKey, setFormNextSigningKey] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formAccountId, setFormAccountId] = useState<string | null>(null);

    // Test connection & Delete
    const [testingId, setTestingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const refetchQueues = () => queryClient.invalidateQueries({ queryKey: ['edge-queues'] });

    const resetForm = () => {
        setEditingId(null);
        setSelectedProvider('qstash');
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormSigningKey('');
        setFormNextSigningKey('');
        setFormIsDefault(false);
        setFormAccountId(null);
        setError(null);
    };

    const openCreate = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEdit = (queue: EdgeQueue) => {
        resetForm();
        setEditingId(queue.id);
        setSelectedProvider(queue.provider);
        setFormName(queue.name);
        setFormUrl(queue.queue_url);
        setFormIsDefault(queue.is_default);
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const payload: any = {
                name: formName,
                provider: selectedProvider,
                queue_url: formUrl,
                is_default: formIsDefault,
            };
            if (formToken) payload.queue_token = formToken;
            if (formSigningKey) payload.signing_key = formSigningKey;
            if (formNextSigningKey) payload.next_signing_key = formNextSigningKey;
            if (formAccountId) payload.provider_account_id = formAccountId;

            const url = editingId
                ? `${API_BASE}/api/edge-queues/${editingId}`
                : `${API_BASE}/api/edge-queues/`;
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
            refetchQueues();
            if (data.warning) {
                toast.warning(data.warning);
            }
            if (options?.onSaveSuccess) {
                options.onSaveSuccess(data);
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
                ? `${API_BASE}/api/edge-queues/${id}?delete_remote=true`
                : `${API_BASE}/api/edge-queues/${id}`;
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            refetchQueues();
        } catch (e: any) { setError(e.message); }
        finally { setDeletingId(null); }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-queues/${id}/test/`, { method: 'POST' });
            const data: TestResult = await res.json();
            const queue = queues.find(q => q.id === id);
            const label = QUEUE_PROVIDER_OPTIONS.find(p => p.value === queue?.provider)?.label || 'Queue';
            showTestToast(data, label);
        } catch (e: any) {
            toast.error('Test failed', { description: e.message });
        } finally { setTestingId(null); }
    };

    const handleTestInline = async () => {
        setTestingId('inline');
        try {
            const providerLabel = QUEUE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.label || 'Queue';

            if (editingId && !formToken) {
                const res = await fetch(`${API_BASE}/api/edge-queues/${editingId}/test/`, { method: 'POST' });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            } else {
                const res = await fetch(`${API_BASE}/api/edge-queues/test-connection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: selectedProvider,
                        queue_url: formUrl,
                        queue_token: formToken || null,
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
        queues,
        isLoading,
        error,
        setError,
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
        formSigningKey,
        setFormSigningKey,
        formNextSigningKey,
        setFormNextSigningKey,
        formIsDefault,
        setFormIsDefault,
        isSaving,
        setIsSaving,
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
