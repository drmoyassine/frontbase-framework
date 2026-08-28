import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Layers, Plus, X, Loader2, Pencil, Trash2, Check, Star, Globe, Inbox,
    ArrowUpCircle, ArrowDownCircle, RefreshCw, Bot, Cpu, Zap, PackagePlus,
    HardDrive, Sparkles, Database, Settings2
} from 'lucide-react';
import {
    adminPlansApi, Plan, LimitDef, PlanWritePayload, AddonConfig
} from '@/services/adminPlansApi';
import { adminAgentsApi, AgentProvider, AgentGlobalConfig } from '@/services/adminAgentsApi';
import { WorkspaceProfileEditor } from '@/modules/admin/components/WorkspaceProfileEditor';
import { STALE } from '@/lib/queryCache';
import { toast } from 'sonner';

const UNLIMITED = -1;

const emptyDraft = (): PlanWritePayload => ({
    slug: '', name: '', description: '', infra_mode: 'byo', price_display: '', price_period: '',
    price_cents: 0, limits: {}, features: [], is_public: false, is_active: true, is_default: false,
    highlighted: false, badge: '', sort_order: 0,
});

const CATEGORY_LABELS: Record<string, string> = {
    capacity: 'Capacity',
    operational: 'Operational (optional — ∞ = disabled)',
    agent: 'Workspace Agent credits',
    feature: 'Features',
};

export function PlansManager() {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<'plans' | 'llm' | 'addons'>('plans');
    const [isEditorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<Plan | null>(null);
    const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
    const [draft, setDraft] = useState<PlanWritePayload>(emptyDraft());

    const { data: plansData, isLoading } = useQuery({
        queryKey: ['admin-plans'],
        queryFn: () => adminPlansApi.listPlans(),
        staleTime: STALE.DEFAULT,
        retry: 1,
        refetchOnWindowFocus: false,
    });
    const { data: registryData } = useQuery({
        queryKey: ['admin-plan-limit-registry'],
        queryFn: () => adminPlansApi.getLimitRegistry(),
        staleTime: STALE.IMMUTABLE,
        retry: 1,
        refetchOnWindowFocus: false,
    });

    const { data: llmConfigData, isLoading: llmLoading } = useQuery({
        queryKey: ['admin-llm-config'],
        queryFn: () => adminAgentsApi.getConfig(),
        enabled: tab === 'llm',
        staleTime: STALE.DEFAULT,
        retry: 1,
        refetchOnWindowFocus: false,
    });
    const { data: providersData } = useQuery({
        queryKey: ['admin-llm-providers'],
        queryFn: () => adminAgentsApi.listProviders(),
        enabled: tab === 'llm',
        staleTime: STALE.STANDARD,
        retry: 1,
        refetchOnWindowFocus: false,
    });

    const plans = plansData?.plans ?? [];
    const registry = registryData?.limits ?? [];


    const invalidatePlans = () => queryClient.invalidateQueries({ queryKey: ['admin-plans'] });

    const saveMutation = useMutation({
        mutationFn: (payload: PlanWritePayload) =>
            editing ? adminPlansApi.updatePlan(editing.id, payload) : adminPlansApi.createPlan(payload),
        onSuccess: () => {
            toast.success(editing ? 'Plan updated' : 'Plan created');
            setEditorOpen(false); setEditing(null); invalidatePlans();
        },
        onError: (e: any) => {
            const detail = e.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail[0]?.msg : 'Failed to save plan'));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => adminPlansApi.deletePlan(id),
        onSuccess: (data: any) => { toast.success(data?.message || 'Plan deleted'); invalidatePlans(); setDeletingPlan(null); },
        onError: (e: any) => {
            const detail = e.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail[0]?.msg : 'Failed to delete plan'));
        },
    });



    const setDefaultProviderMutation = useMutation({
        mutationFn: (providerId: string) => adminAgentsApi.setDefaultProvider(providerId),
        onSuccess: () => {
            toast.success('Default Workspace Agent LLM provider updated');
            queryClient.invalidateQueries({ queryKey: ['admin-llm-config'] });
            queryClient.invalidateQueries({ queryKey: ['admin-llm-providers'] });
        },
        onError: (e: any) => {
            const detail = e.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail[0]?.msg : 'Failed to set default provider'));
        },
    });

    const openCreate = () => { setEditing(null); setDraft(emptyDraft()); setEditorOpen(true); };
    const openEdit = (p: Plan) => {
        setEditing(p);
        setDraft({
            slug: p.slug, name: p.name, description: p.description ?? '', infra_mode: p.infra_mode,
            price_display: p.price_display ?? '', price_period: p.price_period ?? '',
            price_cents: p.price_cents ?? 0,
            limits: { ...p.limits }, features: [...p.features], is_public: p.is_public,
            is_active: p.is_active, is_default: p.is_default, highlighted: p.highlighted,
            badge: p.badge ?? '', sort_order: p.sort_order,
        });
        setEditorOpen(true);
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Subscription Plans</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Define tiers, configure limits, and review tenant upgrade / downgrade requests.
                    </p>
                </div>
                {tab === 'plans' && (
                    <button onClick={openCreate}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-lg text-sm font-medium transition-colors">
                        <Plus className="w-4 h-4" /> New Plan
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
                {([['plans', 'Plans', Layers], ['addons', 'Add-ons', PackagePlus], ['llm', 'Workspace Agent LLM', Bot]] as const).map(([key, label, Icon]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            tab === key ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                        <Icon className="w-4 h-4" />{label}
                    </button>
                ))}
            </div>

            {tab === 'plans' && (
                isLoading ? (
                    <Centered><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></Centered>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {plans.map(p => (
                            <PlanCard key={p.id} plan={p} registry={registry}
                                onEdit={() => openEdit(p)}
                                onDelete={() => setDeletingPlan(p)} />
                        ))}
                        {plans.length === 0 && <p className="text-slate-500 text-sm">No plans yet. Create one to get started.</p>}
                    </div>
                )
            )}

            {tab === 'llm' && (
                <div className="space-y-8">
                    <WorkspaceProfileEditor providers={providersData?.providers ?? []} />
                </div>
            )}

            {tab === 'addons' && (
                <AddonsManager />
            )}

            {isEditorOpen && (
                <PlanEditor
                    draft={draft} setDraft={setDraft} registry={registry} isEdit={!!editing}
                    saving={saveMutation.isPending}
                    onClose={() => { setEditorOpen(false); setEditing(null); }}
                    onSave={() => saveMutation.mutate(draft)} />
            )}

            {deletingPlan && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="p-6 space-y-4">
                            <div className={`flex items-center gap-3 ${deletingPlan.is_active ? 'text-amber-500' : 'text-red-500'}`}>
                                <div className={`p-2 rounded-full ${deletingPlan.is_active ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-red-50 dark:bg-red-500/10'}`}>
                                    <Trash2 className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                                    {deletingPlan.is_active ? 'Deactivate Plan' : 'Permanently Delete Plan'}
                                </h3>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {deletingPlan.is_active
                                    ? <>Are you sure you want to deactivate the <span className="font-semibold text-slate-900 dark:text-white">{deletingPlan.name}</span> plan? This will hide it from new signups, but existing tenants will remain on it.</>
                                    : <>Are you sure you want to permanently delete the <span className="font-semibold text-slate-900 dark:text-white">{deletingPlan.name}</span> plan? This action cannot be undone.</>}
                            </p>
                            {!deletingPlan.is_active && (
                                <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                                    Note: You cannot permanently delete a plan if any active tenants are still assigned to it.
                                </p>
                            )}
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-950 p-5 border-t border-slate-100 dark:border-slate-850 flex justify-end gap-2">
                            <button onClick={() => setDeletingPlan(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
                            <button onClick={() => deleteMutation.mutate(deletingPlan.id)} disabled={deleteMutation.isPending}
                                className={`px-5 py-2 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50
                                    ${deletingPlan.is_active ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-500 hover:bg-red-600'}`}>
                                {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                {deletingPlan.is_active ? 'Deactivate' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Centered({ children }: { children: React.ReactNode }) {
    return <div className="flex items-center justify-center py-20">{children}</div>;
}

function Pill({ children, tone }: { children: React.ReactNode; tone: string }) {
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${tone}`}>{children}</span>;
}

function PlanCard({ plan, registry, onEdit, onDelete }: {
    plan: Plan; registry: LimitDef[]; onEdit: () => void; onDelete: () => void;
}) {
    return (
        <div className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 shadow-sm flex flex-col gap-3 ${
            plan.highlighted ? 'border-primary-500 ring-1 ring-primary-500' : 'border-slate-200 dark:border-slate-800'}`}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                        <span className="text-xs font-mono text-slate-400">{plan.slug}</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{plan.price_display}<span className="text-sm font-normal text-slate-400">{plan.price_period}</span></p>
                </div>
                <div className="flex gap-1">
                    <button onClick={onEdit} title="Edit" className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-500/10 rounded-lg"><Pencil className="w-4 h-4" /></button>
                    <button onClick={onDelete} title="Delete" className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
                <Pill tone={plan.infra_mode === 'managed' ? 'bg-violet-500/10 text-violet-500' : 'bg-slate-500/10 text-slate-400'}>
                    {plan.infra_mode === 'managed' ? 'Managed' : 'BYO infra'}
                </Pill>
                {plan.is_default && <Pill tone="bg-emerald-500/10 text-emerald-500">Default</Pill>}
                {plan.is_public ? <Pill tone="bg-blue-500/10 text-blue-500">Public</Pill> : <Pill tone="bg-slate-500/10 text-slate-400">Hidden</Pill>}
                {!plan.is_active && <Pill tone="bg-red-500/10 text-red-500">Inactive</Pill>}
                {plan.highlighted && <Pill tone="bg-primary-500/10 text-primary-500"><Star className="w-3 h-3" />{plan.badge || 'Featured'}</Pill>}
                {plan.gateway_metadata?.stripe_price_id && <Pill tone="bg-emerald-500/10 text-emerald-500">Stripe synced ✓</Pill>}
                <Pill tone="bg-slate-500/10 text-slate-400">{plan.tenant_count ?? 0} tenants</Pill>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1">
                {registry.filter(def => def.category !== 'operational').map(def => {
                    const v = plan.limits[def.key];
                    const display = def.kind === 'bool' ? (v ? 'Yes' : 'No') : (v === UNLIMITED ? 'Unlimited' : `${v ?? def.default}${def.unit || ''}`);
                    return (
                        <div key={def.key} className="flex justify-between text-xs">
                            <span className="text-slate-500">{def.label}</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{display}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function PlanEditor({ draft, setDraft, registry, isEdit, saving, onClose, onSave }: {
    draft: PlanWritePayload; setDraft: (d: PlanWritePayload) => void; registry: LimitDef[];
    isEdit: boolean; saving: boolean; onClose: () => void; onSave: () => void;
}) {
    const set = (patch: Partial<PlanWritePayload>) => setDraft({ ...draft, ...patch });
    const setLimit = (key: string, value: number | boolean) => set({ limits: { ...(draft.limits || {}), [key]: value } });
    const limits = draft.limits || {};

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="sticky top-0 bg-slate-50 dark:bg-slate-950 p-5 border-b border-slate-100 dark:border-slate-850 flex justify-between items-center">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Layers className="w-5 h-5 text-primary-500" />{isEdit ? 'Edit Plan' : 'New Plan'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Name"><input value={draft.name || ''} onChange={e => set({ name: e.target.value })} className={inputCls} placeholder="Pro" /></Field>
                        <Field label="Slug"><input value={draft.slug || ''} disabled={isEdit} onChange={e => set({ slug: e.target.value })} className={`${inputCls} font-mono disabled:opacity-50`} placeholder="pro" /></Field>
                        <Field label="Price (display)"><input value={draft.price_display || ''} onChange={e => set({ price_display: e.target.value })} className={inputCls} placeholder="$29" /></Field>
                        <Field label="Period"><input value={draft.price_period || ''} onChange={e => set({ price_period: e.target.value })} className={inputCls} placeholder="/month" /></Field>
                        <Field label="Price (cents for Stripe)"><input type="number" value={draft.price_cents ?? ''} onChange={e => set({ price_cents: e.target.value ? Math.round(Number(e.target.value)) : undefined })} className={inputCls} placeholder="199 for $1.99" /></Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Infrastructure">
                            <select value={draft.infra_mode || 'byo'} onChange={e => set({ infra_mode: e.target.value as 'managed' | 'byo' })} className={inputCls}>
                                <option value="byo">BYO — tenant's own edge</option>
                                <option value="managed">Managed — Frontbase-hosted</option>
                            </select>
                        </Field>
                        <Field label="Description"><textarea value={draft.description || ''} onChange={e => set({ description: e.target.value })} className={inputCls} rows={1} /></Field>
                    </div>

                    {/* Limits editor — generated from the registry, grouped by category */}
                    {(['capacity', 'operational', 'agent', 'feature'] as const).map(category => {
                        const defs = registry.filter(d => d.category === category);
                        if (defs.length === 0) return null;
                        return (
                            <div key={category}>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{CATEGORY_LABELS[category]}</p>
                                <div className="space-y-2">
                                    {defs.map(def => (
                                        <div key={def.key} className="flex items-center justify-between gap-3 py-1">
                                            <span className="text-sm text-slate-700 dark:text-slate-300">{def.label}</span>
                                            {def.kind === 'bool' ? (
                                                <input type="checkbox" checked={!!(limits[def.key] ?? def.default)}
                                                    onChange={e => setLimit(def.key, e.target.checked)} className="w-4 h-4 accent-primary-600" />
                                            ) : (
                                                <LimitIntInput value={(limits[def.key] as number) ?? (def.default as number)} unit={def.unit}
                                                    onChange={v => setLimit(def.key, v)} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {/* Marketing features */}
                    <Field label="Pricing-card features (one per line; blank = auto from limits)">
                        <textarea value={(draft.features || []).join('\n')} rows={3} className={inputCls}
                            onChange={e => set({ features: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                            placeholder={'Up to 10,000 executions/mo\nPrivate pages'} />
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Badge"><input value={draft.badge || ''} onChange={e => set({ badge: e.target.value })} className={inputCls} placeholder="Most popular" /></Field>
                        <Field label="Sort order"><input type="number" value={draft.sort_order ?? 0} onChange={e => set({ sort_order: Number(e.target.value) })} className={inputCls} /></Field>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <Toggle label="Public (pricing page)" checked={!!draft.is_public} onChange={v => set({ is_public: v })} />
                        <Toggle label="Active" checked={!!draft.is_active} onChange={v => set({ is_active: v })} />
                        <Toggle label="Default plan" checked={!!draft.is_default} onChange={v => set({ is_default: v })} />
                        <Toggle label="Highlighted" checked={!!draft.highlighted} onChange={v => set({ highlighted: v })} />
                    </div>
                </div>
                <div className="sticky bottom-0 bg-white dark:bg-slate-900 p-5 border-t border-slate-100 dark:border-slate-850 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                    <button onClick={onSave} disabled={saving || !draft.name || !draft.slug}
                        className="px-5 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save Plan
                    </button>
                </div>
            </div>
        </div>
    );
}

function LimitIntInput({ value, unit, onChange }: { value: number; unit: string | null; onChange: (v: number) => void }) {
    const unlimited = value === UNLIMITED;
    return (
        <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-slate-400">
                <input type="checkbox" checked={unlimited} onChange={e => onChange(e.target.checked ? UNLIMITED : 0)} className="w-3.5 h-3.5 accent-primary-600" />∞
            </label>
            <input type="number" disabled={unlimited} value={unlimited ? '' : value}
                onChange={e => onChange(Number(e.target.value))}
                className="w-28 text-sm text-right bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 disabled:opacity-40" />
            {unit && <span className="text-xs text-slate-400 w-6">{unit}</span>}
        </div>
    );
}


const inputCls = 'w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</label>
            {children}
        </div>
    );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-primary-600" />
            {label}
        </label>
    );
}

// LLMConfigurationPanel was removed because providers are now mapped per-profile.

// --- AddonsManager ---

function EditAddonModal({
    addon,
    onClose,
    onSave,
}: {
    addon: AddonConfig | null;
    onClose: () => void;
    onSave: (id: string, data: Partial<AddonConfig>) => Promise<void>;
}) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [quota, setQuota] = useState('');
    const [price, setPrice] = useState(0);
    const [isActive, setIsActive] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (addon) {
            setName(addon.name);
            setDescription(addon.description || '');
            setQuota(addon.quota_display || '');
            setPrice(addon.price_cents / 100);
            setIsActive(addon.is_active);
        }
    }, [addon]);

    if (!addon) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(addon.id, {
                name,
                description,
                quota_display: quota,
                price_cents: Math.round(price * 100),
                is_active: isActive,
            });
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">Edit Add-on: {addon.id}</h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quota Display (Badge)</label>
                            <input type="text" value={quota} onChange={e => setQuota(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Monthly Price (USD)</label>
                            <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(parseFloat(e.target.value))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                        </div>
                    </div>
                    <div>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4 accent-primary-600" />
                            Active (Available for purchase)
                        </label>
                    </div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50">
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const ADDON_META: Record<string, { icon: any, color: string }> = {
    'edge_engine': { icon: Cpu, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20 dark:bg-blue-500/5 dark:border-blue-500/10' },
    'managed_edge_db': { icon: Database, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:bg-emerald-500/5 dark:border-emerald-500/10' },
    'managed_cache': { icon: Zap, color: 'bg-amber-500/10 text-amber-500 border-amber-500/20 dark:bg-amber-500/5 dark:border-amber-500/10' },
    'managed_queue': { icon: RefreshCw, color: 'bg-purple-500/10 text-purple-500 border-purple-500/20 dark:bg-purple-500/5 dark:border-purple-500/10' },
    'managed_vector': { icon: Sparkles, color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 dark:bg-indigo-500/5 dark:border-indigo-500/10' },
    'managed_storage': { icon: HardDrive, color: 'bg-pink-500/10 text-pink-500 border-pink-500/20 dark:bg-pink-500/5 dark:border-pink-500/10' },
    'managed_domain': { icon: Globe, color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20 dark:bg-cyan-500/5 dark:border-cyan-500/10' },
};

function AddonsManager() {
    const queryClient = useQueryClient();
    const { data: addons = [], isLoading } = useQuery({
        queryKey: ['admin', 'addons'],
        queryFn: adminPlansApi.listAddons,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });

    const [editingAddon, setEditingAddon] = useState<AddonConfig | null>(null);

    const handleSave = async (id: string, data: Partial<AddonConfig>) => {
        await adminPlansApi.updateAddon(id, data);
        queryClient.invalidateQueries({ queryKey: ['admin', 'addons'] });
    };

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500">Loading add-ons...</div>;
    }

    return (
        <div className="space-y-6 relative">
            <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Managed Infrastructure Add-ons</h2>
                <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
                    Review premium managed resources available for purchase. Add-ons scale base-plan capacities on a per-tenant basis.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {addons.map((addon) => {
                    const meta = ADDON_META[addon.id] || { icon: PackagePlus, color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' };
                    const Icon = meta.icon;
                    return (
                        <div
                            key={addon.id}
                            className={`group relative flex flex-col justify-between p-6 bg-white dark:bg-slate-900 rounded-2xl border ${addon.is_active ? 'border-slate-200 dark:border-slate-800' : 'border-slate-200/50 dark:border-slate-800/50 opacity-60'} hover:border-primary-500 dark:hover:border-primary-500/50 shadow-sm hover:shadow-md transition-all duration-200`}
                        >
                            <button
                                onClick={() => setEditingAddon(addon)}
                                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-50 dark:bg-slate-800 rounded-lg"
                                title="Edit Add-on"
                            >
                                <Settings2 className="w-4 h-4" />
                            </button>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className={`p-2.5 rounded-xl border ${meta.color}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex flex-col items-end pr-8">
                                        <span className="text-lg font-bold text-slate-900 dark:text-white">${(addon.price_cents / 100).toFixed(2)}</span>
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Per Month</span>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <h3 className="font-semibold text-base text-slate-900 dark:text-white group-hover:text-primary-500 transition-colors">
                                        {addon.name} {!addon.is_active && <span className="text-xs text-red-500 font-normal ml-2">(Inactive)</span>}
                                    </h3>
                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-50 dark:bg-primary-950/30 text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-primary-900/30">
                                        {addon.quota_display}
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1 line-clamp-3">
                                        {addon.description}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                                <span>Code: <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-400">{addon.id}</code></span>
                                <span className="font-medium text-primary-500 dark:text-primary-400 group-hover:translate-x-0.5 transition-transform">Auto-provisioned</span>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <EditAddonModal 
                addon={editingAddon} 
                onClose={() => setEditingAddon(null)} 
                onSave={handleSave} 
            />
        </div>
    );
}

export default PlansManager;
