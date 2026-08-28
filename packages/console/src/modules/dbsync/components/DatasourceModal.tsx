import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { datasourcesApi } from '../api';
import { Datasource } from '../types';
import { track } from '@/lib/analytics';
import { AccountResourcePicker, DiscoveredResource } from '@/components/dashboard/settings/shared/AccountResourcePicker';
import { PROVIDER_CONFIGS } from '@/components/dashboard/settings/shared/edgeConstants';
import { Database, TestTube, CheckCircle, XCircle, Loader2, Table, Copy, Zap } from 'lucide-react';

/** Providers with 'database' or 'cms' capability — drives the Database Type selector. */
const DATABASE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.capabilities?.includes('database') || c.capabilities?.includes('cms'))
    .map(([key, c]) => ({ key, label: c.label }));

/** Maps datasource types to their compatible connected account provider types. */
const DATASOURCE_PROVIDER_MAP: Record<string, string[]> = Object.fromEntries(
    DATABASE_PROVIDERS.map(p => [p.key, [p.key]])
);

interface DatasourceModalProps {
    datasource?: Datasource | null;
    onClose: () => void;
    /** Called with the newly created datasource ID after successful creation */
    onCreated?: (datasourceId: string) => void;
}

export function DatasourceModal({ datasource, onClose, onCreated }: DatasourceModalProps) {
    const queryClient = useQueryClient();
    const isEditing = !!datasource;

    const [formData, setFormData] = useState({
        name: datasource?.name || '',
        type: datasource?.type || 'wordpress_rest',
        host: datasource?.host || '',
        port: datasource?.port || (datasource?.type === 'mysql' ? 3306 : 5432),
        database: datasource?.database || '',
        username: datasource?.username || '',
        password: '',
        connection_uri: '',
        api_url: datasource?.api_url || '',
        anon_key: '',
        api_key: '',
        provider_account_id: (datasource as any)?.provider_account_id || '',
        // WordPress Plugin specific fields (mapped to api_url/password by backend)
        base_url: datasource?.api_url || '',  // api_url from datasource is base_url for WP Plugin
        app_password: '',
        // Google Sheets specific config in extra_config
        extra_config: (() => {
            const cfg = (datasource as any)?.extra_config;
            if (typeof cfg === 'string') {
                try {
                    return JSON.parse(cfg);
                } catch {
                    return {};
                }
            }
            return cfg || { spreadsheetId: '', webAppUrl: '', webAppSecret: '' };
        })(),
    });

    const mutation = useMutation({
        mutationFn: (data: typeof formData) =>
            isEditing
                ? datasourcesApi.update(datasource.id, data)
                : datasourcesApi.create(data),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['datasources'] });
            if (!isEditing) {
                track('datasource_connected', { datasource_id: result?.data?.id });
                if (onCreated && result?.data?.id) {
                    onCreated(result.data.id);
                }
            }
            onClose();
        },
    });

    const testRawMutation = useMutation({
        mutationFn: (data: typeof formData) =>
            isEditing
                ? datasourcesApi.testUpdate(datasource.id, data)
                : datasourcesApi.testRaw(data),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            {isEditing ? `Edit ${datasource.name}` : 'Add Data Source'}
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">Configure your database connection credentials</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-400">
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Display Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                placeholder="My Production DB"
                                required
                            />
                        </div>

                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Database Type</label>
                            <select
                                value={formData.type}
                                onChange={(e) => {
                                    const newType = e.target.value as any;
                                    setFormData({
                                        ...formData,
                                        type: newType,
                                        port: newType === 'mysql' ? 3306 : 5432
                                    });
                                }}
                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
                                disabled={isEditing}
                            >
                                {DATABASE_PROVIDERS.map(p => (
                                    <option key={p.key} value={p.key}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Connected Account Picker — WordPress + Google Sheets + all DB types */}
                        {formData.type.startsWith('wordpress_') ||
                         formData.type === 'google_sheets' ||
                         formData.type === 'postgres' ||
                         formData.type === 'mysql' ||
                         formData.type === 'supabase' ||
                         formData.type === 'neon' ||
                         formData.type === 'turso' ? (
                            <div className="space-y-3">
                                <AccountResourcePicker
                                    compatibleProviders={DATASOURCE_PROVIDER_MAP[formData.type] || [formData.type]}
                                    label="Connected Account (recommended)"
                                    autoSelectSingle
                                    selectedAccountId={formData.provider_account_id || undefined}
                                    onResourceSelected={(resource: DiscoveredResource, accountId: string) => {
                                        setFormData({
                                            ...formData,
                                            provider_account_id: accountId,
                                            name: formData.name || resource.name || '',
                                            // Auto-fill WordPress fields from resource metadata
                                            ...(formData.type.startsWith('wordpress_') && {
                                                // Store the site URL under api_url (the column the backend
                                                // adapter reads) AND base_url (legacy alias) so the datasource
                                                // row is self-describing without relying solely on the
                                                // Connected Account at read time.
                                                api_url: resource.api_url || formData.api_url,
                                                base_url: resource.api_url || formData.base_url,
                                                username: resource.username || formData.username,
                                            }),
                                        });
                                    }}
                                    onClear={() => {
                                        setFormData({ ...formData, provider_account_id: '' });
                                    }}
                                />

                                {formData.provider_account_id && (
                                    <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 p-3">
                                        <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4" />
                                            <span>Credentials will be resolved from this Connected Account. No need to enter credentials manually.</span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : null /* No other types need manual config */}
                    </div>

                    {testRawMutation.data && (
                        <div className={`p-4 rounded-2xl text-sm flex items-start gap-3 animate-in slide-in-from-top-2 duration-300 border ${testRawMutation.data.data.success
                            ? 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/50'
                            : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/50'
                            }`}>
                            <div className={`mt-0.5 p-1 rounded-full ${testRawMutation.data.data.success ? 'bg-green-100 dark:bg-green-800/50' : 'bg-red-100 dark:bg-red-800/50'}`}>
                                {testRawMutation.data.data.success ? (
                                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                ) : (
                                    <XCircle className="w-4 h-4 flex-shrink-0" />
                                )}
                            </div>
                            <div className="flex-1">
                                <p className="font-bold mb-1">{testRawMutation.data.data.message}</p>
                                {testRawMutation.data.data.error && (
                                    <p className="opacity-90 font-mono text-[10px] break-all bg-black/5 dark:bg-white/5 p-2 rounded-lg mt-2 leading-relaxed">
                                        {testRawMutation.data.data.error}
                                    </p>
                                )}
                                {testRawMutation.data.data.suggestion && (
                                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-[11px] text-amber-900 dark:text-amber-200 leading-normal flex gap-2">
                                        <div className="mt-0.5">💡</div>
                                        <div>
                                            <span className="font-bold">Suggestion:</span> {testRawMutation.data.data.suggestion}
                                        </div>
                                    </div>
                                )}
                                {testRawMutation.data.data.tables && (
                                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium">
                                        <Database className="w-3.5 h-3.5" />
                                        Successfully listed {testRawMutation.data.data.tables.length} tables.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {mutation.isError && (
                        <div className="p-4 rounded-2xl bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/50 text-sm flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
                            <div className="mt-0.5 p-1 rounded-full bg-red-100 dark:bg-red-800/50">
                                <XCircle className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="font-bold">Failed to save data source</p>
                                <p className="opacity-90 mt-1">
                                    {(mutation.error as any)?.response?.data?.detail || mutation.error.message}
                                </p>
                            </div>
                        </div>
                    )}
                </form>

                <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex flex-col sm:flex-row gap-3">
                    <button
                        type="button"
                        onClick={() => testRawMutation.mutate(formData)}
                        disabled={testRawMutation.isPending || mutation.isPending}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold border-2 border-primary-600 text-primary-600 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all disabled:opacity-50"
                    >
                        {testRawMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <TestTube className="w-4 h-4" />
                        )}
                        Test Connection
                    </button>
                    <div className="flex gap-3 flex-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 text-sm font-bold border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={mutation.isPending || testRawMutation.isPending}
                            className="flex-1 px-4 py-3 text-sm font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 shadow-lg shadow-primary-500/20"
                        >
                            {mutation.isPending ? (isEditing ? 'Saving...' : 'Adding...') : (isEditing ? 'Save Changes' : 'Add Data Source')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
