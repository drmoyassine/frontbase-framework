/**
 * useEdgeDatabaseForm — Form state & CRUD handlers for edge database create/edit.
 *
 * Extracted from EdgeDatabasesForm.tsx for single-responsibility compliance and reusability.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEdgeDatabases, EdgeDatabase } from '@/hooks/useEdgeInfrastructure';
import { toast } from 'sonner';
import { showTestToast, TestResult } from '@/components/dashboard/settings/shared/edgeTestToast';
import { DB_PROVIDER_OPTIONS } from '@/components/dashboard/settings/shared/edgeConstants';

const API_BASE = '';

interface UseEdgeDatabaseFormOptions {
    onSaveSuccess?: (db: EdgeDatabase) => void;
}

export function useEdgeDatabaseForm(options?: UseEdgeDatabaseFormOptions) {
    const queryClient = useQueryClient();
    const { data: databases = [], isLoading } = useEdgeDatabases();
    const [error, setError] = useState<string | null>(null);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form fields
    const [selectedProvider, setSelectedProvider] = useState<string>('turso');
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formAccountId, setFormAccountId] = useState<string | null>(null);

    // PG schema isolation
    const [formSchemaName, setFormSchemaName] = useState<string | null>(null);
    const [discoveredSchemas, setDiscoveredSchemas] = useState<{id: string; name: string; has_role?: boolean}[]>([]);
    const [isDiscoveringSchemas, setIsDiscoveringSchemas] = useState(false);
    const [schemaDiscoverError, setSchemaDiscoverError] = useState<string | null>(null);
    const [showCreateSchema, setShowCreateSchema] = useState(false);
    const [createSchemaSuffix, setCreateSchemaSuffix] = useState('');
    const [isCreatingSchema, setIsCreatingSchema] = useState(false);

    // Scoped PG role credentials
    const [formRoleName, setFormRoleName] = useState<string | null>(null);
    const [formRolePassword, setFormRolePassword] = useState<string | null>(null);

    // Test connection & Delete
    const [testingId, setTestingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const refetchDatabases = () => queryClient.invalidateQueries({ queryKey: ['edge-databases'] });

    const resetForm = () => {
        setEditingId(null);
        setSelectedProvider('turso');
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormIsDefault(false);
        setFormAccountId(null);
        setFormSchemaName(null);
        setDiscoveredSchemas([]);
        setSchemaDiscoverError(null);
        setShowCreateSchema(false);
        setCreateSchemaSuffix('');
        setFormRoleName(null);
        setFormRolePassword(null);
        setError(null);
    };

    const openCreate = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEdit = (db: EdgeDatabase) => {
        resetForm();
        setEditingId(db.id);
        setSelectedProvider(db.provider);
        setFormName(db.name);
        setFormUrl(db.db_url);
        setFormToken('');
        setFormIsDefault(db.is_default);
        setFormAccountId(db.provider_account_id || null);
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const payload: any = {
                name: formName,
                provider: selectedProvider,
                db_url: formUrl,
                is_default: formIsDefault,
            };
            if (formToken) payload.db_token = formToken;
            if (formAccountId) payload.provider_account_id = formAccountId;
            if (formSchemaName) payload.schema_name = formSchemaName;
            if (formRoleName) payload.role_name = formRoleName;
            if (formRolePassword) payload.role_password = formRolePassword;

            const url = editingId
                ? `${API_BASE}/api/edge-databases/${editingId}`
                : `${API_BASE}/api/edge-databases/`;
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
            refetchDatabases();
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
                ? `${API_BASE}/api/edge-databases/${id}?delete_remote=true`
                : `${API_BASE}/api/edge-databases/${id}`;
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            refetchDatabases();
        } catch (e: any) { setError(e.message); }
        finally { setDeletingId(null); }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-databases/${id}/test`, { method: 'POST' });
            const data: TestResult = await res.json();
            const db = databases.find(d => d.id === id);
            const label = DB_PROVIDER_OPTIONS.find(p => p.value === db?.provider)?.label || 'Database';
            showTestToast(data, label);
        } catch (e: any) {
            showTestToast({ success: false, message: e.message }, 'Database');
        } finally { setTestingId(null); }
    };

    const handleTestInline = async () => {
        setTestingId('inline');
        try {
            const providerLabel = DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.label || 'Database';

            if (editingId && !formToken) {
                const res = await fetch(`${API_BASE}/api/edge-databases/${editingId}/test`, { method: 'POST' });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            } else {
                const res = await fetch(`${API_BASE}/api/edge-databases/test-connection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formName || 'Test',
                        provider: selectedProvider,
                        db_url: formUrl,
                        db_token: formToken || null,
                        provider_account_id: formAccountId || null,
                    }),
                });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            }
        } catch (e: any) {
            showTestToast({ success: false, message: e.message }, 'Database');
        } finally { setTestingId(null); }
    };

    return {
        // Data
        databases,
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
        formIsDefault,
        setFormIsDefault,
        isSaving,
        setIsSaving,
        // PG schema fields
        formSchemaName,
        setFormSchemaName,
        discoveredSchemas,
        setDiscoveredSchemas,
        isDiscoveringSchemas,
        setIsDiscoveringSchemas,
        schemaDiscoverError,
        setSchemaDiscoverError,
        showCreateSchema,
        setShowCreateSchema,
        createSchemaSuffix,
        setCreateSchemaSuffix,
        isCreatingSchema,
        setIsCreatingSchema,
        formRoleName,
        setFormRoleName,
        formRolePassword,
        setFormRolePassword,
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
