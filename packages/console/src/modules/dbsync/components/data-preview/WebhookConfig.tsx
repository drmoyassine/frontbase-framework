import React, { useState, useMemo } from 'react';
import { Zap, Plus, Globe, Settings, Activity, ChevronRight, X, Info, RefreshCw, Trash2, AlertCircle, Save } from 'lucide-react';

interface WebhookConfigProps {
    webhooks: any[];
    setWebhooks: React.Dispatch<React.SetStateAction<any[]>>;
    webhookForm: any;
    setWebhookForm: React.Dispatch<React.SetStateAction<any>>;
    editingWebhookIndex: number | null;
    setEditingWebhookIndex: React.Dispatch<React.SetStateAction<number | null>>;
    isWebhookModalOpen: boolean;
    setIsWebhookModalOpen: (isOpen: boolean) => void;
    triggerWebhookTest: (viewId: string) => Promise<any>;
    currentViewId?: string;
    onSaveView?: () => Promise<void>;
    hasUnsavedChanges?: boolean;
}

// URL validation helper
const isValidUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

export const WebhookConfig: React.FC<WebhookConfigProps> = ({
    webhooks,
    setWebhooks,
    webhookForm,
    setWebhookForm,
    editingWebhookIndex,
    setEditingWebhookIndex,
    isWebhookModalOpen,
    setIsWebhookModalOpen,
    triggerWebhookTest,
    currentViewId,
    onSaveView,
    hasUnsavedChanges
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [urlError, setUrlError] = useState<string | null>(null);

    // Validate URL when form changes
    const validateUrl = (url: string) => {
        if (!url) {
            setUrlError(null);
            return;
        }
        if (!isValidUrl(url)) {
            setUrlError('Please enter a valid URL (e.g., https://example.com/webhook)');
        } else {
            setUrlError(null);
        }
    };

    const isFormValid = useMemo(() => {
        return webhookForm.name && webhookForm.url && isValidUrl(webhookForm.url) && webhookForm.events.length > 0;
    }, [webhookForm]);

    const handleSaveWebhookAndView = async () => {
        if (!isFormValid) return;

        // Update webhooks state
        if (editingWebhookIndex !== null) {
            const newWebhooks = [...webhooks];
            newWebhooks[editingWebhookIndex] = { ...webhookForm };
            setWebhooks(newWebhooks);
        } else {
            setWebhooks(curr => [...curr, { ...webhookForm }]);
        }
        setIsWebhookModalOpen(false);

        // Auto-save view if callback provided
        if (onSaveView) {
            setIsSaving(true);
            try {
                await onSaveView();
            } catch (err) {
                console.error('Failed to save view with webhooks:', err);
            } finally {
                setIsSaving(false);
            }
        }
    };
    return (
        <>
            <div className="p-6 h-full flex flex-col bg-gray-50/10">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">External Webhooks</h4>
                        <p className="text-[10px] text-gray-400">Trigger external systems when data changes or via manual trigger logic.</p>
                    </div>
                    <button
                        onClick={() => {
                            setEditingWebhookIndex(null);
                            setWebhookForm({ name: '', url: '', events: ['insert', 'update', 'delete'], enabled: true, method: 'POST' });
                            setIsWebhookModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-xl text-xs font-bold hover:bg-primary-700 transition-all shadow-sm active:scale-95"
                    >
                        <Plus size={14} /> Register Webhook
                    </button>
                </div>

                {webhooks.length > 0 ? (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 overflow-y-auto pr-2 pb-6">
                        {webhooks.map((webhook, idx) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 rounded-2xl flex flex-col shadow-sm group hover:border-primary-500/30 transition-all overflow-hidden">
                                <div className="p-4 flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${webhook.enabled ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30' : 'bg-gray-100 text-gray-400 dark:bg-gray-700/50'} `}>
                                            <Zap size={20} className={webhook.enabled ? 'animate-pulse' : ''} />
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                {webhook.name || 'Untitled Webhook'}
                                                {!webhook.enabled && <span className="text-[9px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full text-gray-400 font-bold uppercase ring-1 ring-inset ring-gray-200 dark:ring-gray-600">Off</span>}
                                            </div>
                                            <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5 truncate max-w-[200px]">
                                                <Globe size={10} /> {webhook.url}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => {
                                                setEditingWebhookIndex(idx);
                                                setWebhookForm({ ...webhook });
                                                setIsWebhookModalOpen(true);
                                            }}
                                            className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-900 transition-colors"
                                        >
                                            <Settings size={14} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                const newWebhooks = [...webhooks];
                                                newWebhooks[idx].enabled = !newWebhooks[idx].enabled;
                                                setWebhooks(newWebhooks);
                                            }}
                                            className={`p-2 rounded-lg transition-colors ${webhook.enabled ? 'text-primary-600 hover:bg-primary-50' : 'text-gray-300 hover:bg-gray-50'} `}
                                        >
                                            <Activity size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="px-4 py-2 bg-gray-50/50 dark:bg-gray-900/30 border-y border-gray-100 dark:border-gray-700/50 flex flex-wrap gap-1.5">
                                    {webhook.events.map((e: string) => (
                                        <span key={e} className="text-[9px] font-bold px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-md text-gray-500 uppercase tracking-tighter ring-1 ring-inset ring-gray-200">
                                            {e}
                                        </span>
                                    ))}
                                </div>

                                <div className="p-4 space-y-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Trigger Reference</span>
                                            <div className="flex gap-1">
                                                <span className="text-[9px] font-mono bg-blue-50 text-blue-600 px-1 rounded uppercase font-bold">{webhook.method}</span>
                                                <span className="text-[9px] font-mono bg-green-50 text-green-600 px-1 rounded font-bold uppercase">JSON</span>
                                            </div>
                                        </div>
                                        <div className="p-2 bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 rounded-lg font-mono text-[9px] text-gray-500 overflow-x-auto whitespace-nowrap">
                                            <code>POST /api/views/{currentViewId || '{id}'}/trigger</code>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Expected Response Schema</span>
                                        <div className="p-2 bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 rounded-lg font-mono text-[9px] text-gray-500 overflow-x-auto">
                                            <pre>{JSON.stringify({
                                                "event": "insert",
                                                "timestamp": "2025-01-01T12:00:00.000Z",
                                                "data": { "key": "value" }
                                            }, null, 2)}</pre>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-4 py-3 bg-gray-50/30 dark:bg-gray-900/10 flex justify-end gap-2">
                                    <button
                                        onClick={() => {
                                            if (confirm('Delete this webhook configuration?')) {
                                                setWebhooks(prev => prev.filter((_, i) => i !== idx));
                                            }
                                        }}
                                        className="text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        Delete Configuration
                                    </button>
                                    <button
                                        onClick={() => {
                                            triggerWebhookTest(currentViewId!)
                                                .then(() => alert('Webhook triggered! Check your endpoint.'))
                                                .catch(e => alert('Failed to trigger: ' + (e instanceof Error ? e.message : String(e))));
                                        }}
                                        className="flex items-center gap-1 text-[10px] font-bold text-primary-600 hover:text-primary-700 transition-colors"
                                    >
                                        Test Execution <ChevronRight size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex-1 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-gray-800/20">
                        <div className="w-20 h-20 bg-primary-50 dark:bg-primary-900/20 rounded-[2.5rem] flex items-center justify-center text-primary-600 dark:text-primary-400 mb-6 shadow-xl shadow-primary-500/10">
                            <Zap size={40} />
                        </div>
                        <h5 className="text-base font-bold text-gray-900 dark:text-white mb-2">Build Event-Driven Workflows</h5>
                        <p className="text-[12px] text-gray-500 max-w-sm mb-8 leading-relaxed">Connect your favorite tools (n8n, Zapier, Make) to your database. Register a webhook and we'll forward transformed data every time something happens.</p>
                        <button
                            onClick={() => {
                                setEditingWebhookIndex(null);
                                setWebhookForm({ name: '', url: '', events: ['insert', 'update', 'delete'], enabled: true, method: 'POST' });
                                setIsWebhookModalOpen(true);
                            }}
                            className="px-8 py-3 bg-primary-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-primary-500/20 hover:bg-primary-700 transition-all active:scale-95"
                        >
                            Create Your First Webhook
                        </button>
                    </div>
                )}
            </div>

            {/* Webhook Management Modal */}
            {isWebhookModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700 relative">
                        <div className="p-8 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                                        {editingWebhookIndex !== null ? 'Configure Webhook' : 'New Webhook'}
                                    </h3>
                                    <p className="text-[10px] text-primary-600 font-bold uppercase tracking-widest mt-1">External Data Forwarding</p>
                                </div>
                                <button onClick={() => setIsWebhookModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl transition-all">
                                    <X size={20} className="text-gray-400" />
                                </button>
                            </div>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Friendly Name</label>
                                <div className="relative">
                                    <Info className="absolute left-4 top-3.5 size-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={webhookForm.name}
                                        onChange={(e) => setWebhookForm((curr: any) => ({ ...curr, name: e.target.value }))}
                                        placeholder="e.g. Production n8n Hook"
                                        className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all text-sm font-medium"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Callback URL</label>
                                <div className="relative">
                                    <Globe className={`absolute left-4 top-3.5 size-4 ${urlError ? 'text-red-400' : 'text-gray-400'}`} />
                                    <input
                                        type="text"
                                        value={webhookForm.url}
                                        onChange={(e) => {
                                            setWebhookForm((curr: any) => ({ ...curr, url: e.target.value }));
                                            validateUrl(e.target.value);
                                        }}
                                        onBlur={(e) => validateUrl(e.target.value)}
                                        placeholder="https://your-app.com/api/webhook"
                                        className={`w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border rounded-2xl outline-none focus:ring-4 transition-all text-sm font-medium ${urlError ? 'border-red-300 focus:ring-red-500/10 focus:border-red-500' : 'border-gray-100 dark:border-gray-700 focus:ring-primary-500/10 focus:border-primary-500'}`}
                                    />
                                </div>
                                {urlError && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-red-500 px-1">
                                        <AlertCircle size={12} />
                                        {urlError}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Subscribe to Events</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {['insert', 'update', 'delete'].map(event => {
                                        const isActive = webhookForm.events.includes(event);
                                        return (
                                            <button
                                                key={event}
                                                onClick={() => {
                                                    const newEvents = isActive
                                                        ? webhookForm.events.filter((e: string) => e !== event)
                                                        : [...webhookForm.events, event];
                                                    setWebhookForm((curr: any) => ({ ...curr, events: newEvents }));
                                                }}
                                                className={`py-3 px-2 rounded-2xl text-[10px] font-bold uppercase transition-all flex flex-col items-center gap-1.5 ring-1 ring-inset ${isActive
                                                    ? 'bg-primary-600 text-white ring-primary-600 shadow-lg shadow-primary-500/20'
                                                    : 'bg-white text-gray-400 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700 hover:ring-gray-200'
                                                    } `}
                                            >
                                                <div className={`p-1 rounded-md ${isActive ? 'bg-white/20' : 'bg-gray-50 dark:bg-gray-700'} `}>
                                                    {event === 'insert' ? <Plus size={12} /> : event === 'update' ? <RefreshCw size={12} /> : <Trash2 size={12} />}
                                                </div>
                                                {event}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-gray-50/50 dark:bg-gray-900/20 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-4">
                            {!onSaveView && (
                                <div className="flex items-center gap-2 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-xl">
                                    <AlertCircle size={12} />
                                    <span>Remember to click <strong>Save View</strong> to persist this webhook configuration.</span>
                                </div>
                            )}
                            <div className="flex gap-4">
                                <button
                                    onClick={() => {
                                        setUrlError(null);
                                        setIsWebhookModalOpen(false);
                                    }}
                                    className="flex-1 py-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-2xl text-xs font-bold hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveWebhookAndView}
                                    disabled={!isFormValid || isSaving}
                                    className="flex-1 py-4 bg-primary-600 text-white rounded-2xl text-xs font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50 disabled:shadow-none active:scale-95 flex items-center justify-center gap-2"
                                >
                                    {isSaving ? (
                                        <><RefreshCw size={14} className="animate-spin" /> Saving...</>
                                    ) : (
                                        <>{onSaveView && <Save size={14} />}{editingWebhookIndex !== null ? 'Update & Save' : 'Create & Save'}</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
