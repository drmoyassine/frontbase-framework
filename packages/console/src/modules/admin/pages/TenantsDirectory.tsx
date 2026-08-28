import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Users,
    Plus,
    Search,
    ExternalLink,
    ShieldAlert,
    Sliders,
    CheckCircle,
    AlertTriangle,
    RefreshCw,
    Copy,
    Trash2,
    Loader2,
    Shield,
    UserPlus,
    Lock,
    Eye,
    Globe,
    Check,
    Mail,
    FileText,
    Settings,
    Activity,
    Layers,
    Server,
    Clock,
    X,
    FolderGit2,
    Bot,
    Zap,
    ChevronDown,
    ChevronUp,
    Gift,
    TrendingUp
} from 'lucide-react';
import { tenantAdminApi, TenantAdminResponse } from '@/services/tenantAdminApi';
import { adminPlansApi } from '@/services/adminPlansApi';
import { adminAgentsApi, type AgentAnalytics, type AgentBalanceRow } from '@/services/adminAgentsApi';
import { useAuthStore } from '@/stores/auth';
import { isCloud } from '@/lib/edition';
import { STALE } from '@/lib/queryCache';
import { toast } from 'sonner';

// Format relative time helper
function formatRelativeTime(dateStr?: string | null): string {
    if (!dateStr) return 'Never';
    try {
        // If the date string doesn't specify a timezone offset, treat it as UTC by appending 'Z'
        let formattedDateStr = dateStr;
        if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-')) {
            formattedDateStr = dateStr + 'Z';
        }
        const date = new Date(formattedDateStr);
        if (isNaN(date.getTime())) return 'Never';
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 30) return `${diffDays}d ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return 'Never';
    }
}

export function TenantsDirectory() {
    const queryClient = useQueryClient();
    const { setImpersonation, isImpersonating, clearImpersonation } = useAuthStore();

    // Filters and Search States
    const [searchQuery, setSearchQuery] = useState('');
    const [planFilter, setPlanFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    // Expanded rows for credit management
    const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);

    // Modal States
    const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedTenant, setSelectedTenant] = useState<TenantAdminResponse | null>(null);

    // Form inputs for Tenant Provision
    const [newTenantSlug, setNewTenantSlug] = useState('');
    const [newTenantName, setNewTenantName] = useState('');
    const [newTenantPlan, setNewTenantPlan] = useState('free');

    // Form inputs for Tenant User Provision
    const [newUserId, setNewUserId] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPass, setNewUserPass] = useState('');
    const [newUserRole, setNewUserRole] = useState('owner');

    // Form inputs for Edit Plan/Status
    const [editPlan, setEditPlan] = useState('free');
    const [editStatus, setEditStatus] = useState('active');

    // Fetch Tenants List
    const { data, isLoading, isRefetching, refetch, error } = useQuery({
        queryKey: ['admin-tenants'],
        queryFn: () => tenantAdminApi.listTenants(),
        staleTime: 60 * 1000, // custom TTL (not a STALE tier)
    });

    const tenantsList = data?.tenants || [];

    // Plan options sourced from the admin-configurable plans catalog (no hardcoded tiers)
    const { data: plansData } = useQuery({
        queryKey: ['admin-plans'],
        queryFn: () => adminPlansApi.listPlans(),
        staleTime: 60 * 1000, // custom TTL (not a STALE tier)
    });
    const planOptions = plansData?.plans ?? [];

    // Copy To Clipboard utility
    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} copied to clipboard`);
    };

    // Mutations
    const createTenantMutation = useMutation({
        mutationFn: (payload: { slug: string; name: string; plan: string }) =>
            tenantAdminApi.createTenant(payload),
        onSuccess: () => {
            toast.success('Workspace tenant provisioned successfully');
            setIsProvisionModalOpen(false);
            setNewTenantSlug('');
            setNewTenantName('');
            setNewTenantPlan('free');
            queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.detail || 'Failed to provision tenant');
        }
    });

    const createTenantUserMutation = useMutation({
        mutationFn: (payload: { tenantId: string; body: { email: string; password?: string; role?: string } }) =>
            tenantAdminApi.createTenantUser(payload.tenantId, payload.body),
        onSuccess: () => {
            toast.success('User registered inside tenant successfully');
            setIsUserModalOpen(false);
            setNewUserId('');
            setNewUserEmail('');
            setNewUserPass('');
            setNewUserRole('owner');
            queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.detail || 'Failed to create tenant user');
        }
    });

    const updateTenantMutation = useMutation({
        mutationFn: (payload: { tenantId: string; body: { plan?: string; status?: string } }) =>
            tenantAdminApi.updateTenant(payload.tenantId, payload.body),
        onSuccess: () => {
            toast.success('Tenant settings updated successfully');
            setIsEditModalOpen(false);
            setSelectedTenant(null);
            queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.detail || 'Failed to update tenant');
        }
    });

    const suspendTenantMutation = useMutation({
        mutationFn: (tenantId: string) => tenantAdminApi.deleteTenant(tenantId),
        onSuccess: (_, tenantId) => {
            toast.success('Tenant status updated to Suspended');
            queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.detail || 'Failed to suspend tenant');
        }
    });

    // Form handlers
    const handleCreateTenant = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTenantSlug.trim() || !newTenantName.trim()) {
            toast.error('Slug and Name are required');
            return;
        }
        createTenantMutation.mutate({
            slug: newTenantSlug.trim(),
            name: newTenantName.trim(),
            plan: newTenantPlan
        });
    };

    const handleCreateTenantUser = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUserEmail.trim() || !newUserPass.trim()) {
            toast.error('Email and Password are required');
            return;
        }
        createTenantUserMutation.mutate({
            tenantId: newUserId,
            body: {
                email: newUserEmail.trim(),
                password: newUserPass,
                role: newUserRole
            }
        });
    };

    const handleUpdateTenant = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTenant) return;
        updateTenantMutation.mutate({
            tenantId: selectedTenant.id,
            body: {
                plan: editPlan,
                status: editStatus
            }
        });
    };

    // Derived Statistics
    const totalTenantsCount = tenantsList.length;
    const proOrEnterpriseCount = tenantsList.filter(t => t.plan === 'pro' || t.plan === 'enterprise').length;
    const totalMembersCount = tenantsList.reduce((acc, t) => acc + t.member_count, 0);
    const totalProjectsCount = tenantsList.reduce((acc, t) => acc + t.project_count, 0);

    // Filter logic
    const filteredTenants = tenantsList.filter(t => {
        const matchesSearch =
            t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.owner_email && t.owner_email.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesPlan = planFilter === 'all' || t.plan === planFilter;
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

        return matchesSearch && matchesPlan && matchesStatus;
    });

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header section matching Dashboard style */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Tenants Directory</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Global administrative console for client organizations, user provisioning, and resource mapping.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refetch()}
                        disabled={isLoading || isRefetching}
                        className="p-2 text-gray-550 hover:text-gray-750 bg-white dark:bg-gray-800 dark:text-gray-400 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                        title="Reload Tenants"
                    >
                        <RefreshCw className={`w-4 h-4 ${(isLoading || isRefetching) ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => setIsProvisionModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Provision Tenant
                    </button>
                </div>
            </div>

            {/* Quick Statistics Summary Grid - Simple Dashboard Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-lg shrink-0">
                        <Globe className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{totalTenantsCount}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Total Tenants</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-purple-500/10 rounded-lg shrink-0">
                        <Layers className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{proOrEnterpriseCount}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Pro / Enterprise</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-orange-500/10 rounded-lg shrink-0">
                        <Users className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{totalMembersCount}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Global Members</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-lg shrink-0">
                        <FolderGit2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{totalProjectsCount}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Total Projects</p>
                    </div>
                </div>
            </div>

            {/* Workspace Agent Analytics (cloud mode only) */}
            {isCloud() && <WorkspaceAgentAnalytics />}

            {/* Filter and Search Bar */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-850 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-450 dark:text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search by workspace, subdomain, owner..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <select
                        value={planFilter}
                        onChange={(e) => setPlanFilter(e.target.value)}
                        className="text-sm bg-slate-55 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer w-full md:w-40"
                    >
                        <option value="all">All Plans</option>
                        {planOptions.map(p => (
                            <option key={p.id} value={p.slug}>{p.name}</option>
                        ))}
                    </select>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="text-sm bg-slate-55 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer w-full md:w-40"
                    >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                    </select>
                </div>
            </div>

            {/* Error or Empty State or Loading Table */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-850 shadow-sm space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
                    <p className="text-slate-500 font-medium">Fetching global tenants data...</p>
                </div>
            ) : error ? (
                <div className="p-8 bg-red-500/10 border border-red-900/30 rounded-2xl text-center space-y-4">
                    <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
                    <h3 className="text-lg font-bold text-red-650 dark:text-red-400">Failed to Load Tenants</h3>
                    <p className="text-slate-400 text-sm">{(error as any)?.response?.data?.detail || 'You do not have access to master admin resources.'}</p>
                </div>
            ) : filteredTenants.length === 0 ? (
                <div className="p-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-850 text-center space-y-4">
                    <Globe className="w-16 h-16 text-slate-350 dark:text-slate-600 mx-auto" />
                    <h3 className="text-xl font-bold">No Tenants Found</h3>
                    <p className="text-slate-500 max-w-sm mx-auto">No workspaces match your query or have been provisioned in the cloud database.</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-850 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-900/50">
                                    <th className="px-6 py-4">Workspace / Tenant</th>
                                    <th className="px-6 py-4">Subdomain / Slug</th>
                                    <th className="px-6 py-4">Primary Owner</th>
                                    <th className="px-6 py-4 text-center">Projects</th>
                                    <th className="px-6 py-4">Active Resources</th>
                                    <th className="px-6 py-4">Usage Stats</th>
                                    <th className="px-6 py-4">Tier Plan</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Owner Last Login</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                                {filteredTenants.map((tenant) => (
                                    <>
                                    <tr key={tenant.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/40 transition-colors">
                                        {/* Workspace Name & UUID */}
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300">
                                                    {tenant.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-slate-900 dark:text-white">{tenant.name}</div>
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono mt-0.5">
                                                        <span>{tenant.id.substring(0, 8)}...</span>
                                                        <button
                                                            onClick={() => copyToClipboard(tenant.id, 'Tenant ID')}
                                                            className="hover:text-slate-700 dark:hover:text-white"
                                                            title="Copy Tenant ID"
                                                        >
                                                            <Copy className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Subdomain slug */}
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-300">
                                                {tenant.slug}
                                                <ExternalLink className="w-3 h-3 text-slate-400" />
                                            </span>
                                        </td>

                                        {/* Primary Owner Email */}
                                        <td className="px-6 py-4">
                                            {tenant.owner_email ? (
                                                <div className="flex items-center gap-2">
                                                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                                                    <span className="truncate max-w-[180px] font-medium text-slate-700 dark:text-slate-300">
                                                        {tenant.owner_email}
                                                    </span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setNewUserId(tenant.id);
                                                        setIsUserModalOpen(true);
                                                    }}
                                                    className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-medium transition-colors"
                                                >
                                                    <UserPlus className="w-3.5 h-3.5" />
                                                    Add Owner
                                                </button>
                                            )}
                                        </td>

                                        {/* Projects badge counts */}
                                        <td className="px-6 py-4 text-center">
                                            <span className="inline-flex items-center justify-center w-7 h-7 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/25">
                                                {tenant.project_count}
                                            </span>
                                        </td>

                                        {/* Active Resources */}
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                                    <FileText className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                                    <span>Pages:</span>
                                                    <span className="font-bold text-slate-900 dark:text-white">{tenant.active_resources?.pages ?? 0}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                                    <Activity className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                                    <span>Workflows:</span>
                                                    <span className="font-bold text-slate-900 dark:text-white">{tenant.active_resources?.workflows ?? 0}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                                    <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                                    <span>App Users:</span>
                                                    <span className="font-bold text-slate-900 dark:text-white">{tenant.active_resources?.app_users ?? 0}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Usage Stats */}
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const usage = tenant.usage_stats || { executions_current: 0, executions_limit: 1000, executions_percentage: 0 };
                                                return (
                                                    <div className="space-y-1.5 w-32">
                                                        <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                                                            <span className="font-bold text-slate-900 dark:text-white">{usage.executions_current.toLocaleString()}</span>
                                                            <span className="text-slate-450 dark:text-slate-500">/ {usage.executions_limit < 0 ? '∞' : usage.executions_limit.toLocaleString()}</span>
                                                        </div>
                                                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                                                            <div 
                                                                className={`h-full rounded-full transition-all duration-300 ${
                                                                    usage.executions_percentage > 90 
                                                                        ? 'bg-red-500' 
                                                                        : usage.executions_percentage > 70 
                                                                            ? 'bg-amber-500' 
                                                                            : 'bg-emerald-500'
                                                                }`}
                                                                style={{ width: `${Math.min(usage.executions_percentage, 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </td>

                                        {/* Tier Plan */}
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider
                                                ${tenant.plan === 'enterprise'
                                                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                                                    : tenant.plan === 'pro'
                                                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                                        : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                                                }`}
                                            >
                                                {tenant.plan}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                                                ${tenant.status === 'active'
                                                    ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                                                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                                                }`}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full ${tenant.status === 'active' ? 'bg-green-400' : 'bg-red-400'}`} />
                                                {tenant.status}
                                            </span>
                                        </td>

                                        {/* Last Login relative date */}
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium">
                                            <div className="flex items-center gap-2 text-xs">
                                                <Clock className="w-3.5 h-3.5 text-slate-450" />
                                                <span>{formatRelativeTime(tenant.owner_last_login_at)}</span>
                                            </div>
                                        </td>

                                        {/* Quick Actions popover/buttons */}
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {/* Impersonate button */}
                                                <button
                                                    onClick={() => {
                                                        setImpersonation(tenant.plan, 'owner');
                                                        toast.success(`Spoofing active for Plan: ${tenant.plan.toUpperCase()}`);
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all"
                                                    title="Spoof Tenant UI"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>

                                                {/* Edit Plan / Status button */}
                                                <button
                                                    onClick={() => {
                                                        setSelectedTenant(tenant);
                                                        setEditPlan(tenant.plan);
                                                        setEditStatus(tenant.status);
                                                        setIsEditModalOpen(true);
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-500/10 rounded-lg transition-all"
                                                    title="Manage Plan & Status"
                                                >
                                                    <Sliders className="w-4 h-4" />
                                                </button>

                                                {/* Credits expand button (cloud only) */}
                                                {isCloud() && (
                                                    <button
                                                        onClick={() => setExpandedTenantId(expandedTenantId === tenant.id ? null : tenant.id)}
                                                        className="p-1.5 text-slate-400 hover:text-purple-500 hover:bg-purple-500/10 rounded-lg transition-all"
                                                        title="Manage Agent Credits"
                                                    >
                                                        {expandedTenantId === tenant.id ? <ChevronUp className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                                    </button>
                                                )}

                                                {/* Suspend or Unsuspend toggle */}
                                                {tenant.status === 'active' ? (
                                                    <button
                                                        onClick={() => {
                                                            if (confirm(`Are you sure you want to suspend tenant '${tenant.name}'?`)) {
                                                                suspendTenantMutation.mutate(tenant.id);
                                                            }
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                        title="Suspend Tenant"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            updateTenantMutation.mutate({
                                                                tenantId: tenant.id,
                                                                body: { status: 'active' }
                                                            });
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-all"
                                                        title="Reactivate Tenant"
                                                    >
                                                        <CheckCircle className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Expanded row: Agent Credits (cloud only) */}
                                    {isCloud() && expandedTenantId === tenant.id && (
                                        <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                                            <td colSpan={10} className="px-6 py-4">
                                                <TenantCreditDrawer tenantId={tenant.id} tenantName={tenant.name} />
                                            </td>
                                        </tr>
                                    )}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal: Provision Tenant */}
            {isProvisionModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-155">
                        <div className="bg-slate-50 dark:bg-slate-950 p-5 border-b border-slate-100 dark:border-slate-850 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                <Globe className="w-5 h-5 text-primary-500" />
                                Provision New Tenant
                            </h3>
                            <button
                                onClick={() => setIsProvisionModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleCreateTenant} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                    Workspace Name
                                </label>
                                <input
                                    type="text"
                                    placeholder="Acme Corporation"
                                    value={newTenantName}
                                    onChange={(e) => setNewTenantName(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4.5 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                    Subdomain Slug
                                </label>
                                <input
                                    type="text"
                                    placeholder="acme"
                                    value={newTenantSlug}
                                    onChange={(e) => setNewTenantSlug(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4.5 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-mono"
                                    required
                                />
                                <p className="text-[11px] text-slate-450 dark:text-slate-500 mt-1">
                                    Lowercase alphanumeric characters and hyphens only. E.g. acme.frontbase.dev
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                    Plan Tier
                                </label>
                                <select
                                    value={newTenantPlan}
                                    onChange={(e) => setNewTenantPlan(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4.5 py-3 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                >
                                    {planOptions.map(p => (
                                        <option key={p.id} value={p.slug}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-850 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsProvisionModalOpen(false)}
                                    className="px-4 py-2 text-sm text-slate-650 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-slate-800 rounded-lg transition-colors font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={createTenantMutation.isPending}
                                    className="px-5 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
                                >
                                    {createTenantMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Provision Workspace
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Provision Tenant User / Owner */}
            {isUserModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-155">
                        <div className="bg-slate-50 dark:bg-slate-950 p-5 border-b border-slate-100 dark:border-slate-850 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-primary-500" />
                                Add User to Workspace
                            </h3>
                            <button
                                onClick={() => setIsUserModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleCreateTenantUser} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    placeholder="owner@clientdomain.com"
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4.5 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                    Secure Password
                                </label>
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    value={newUserPass}
                                    onChange={(e) => setNewUserPass(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4.5 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                    required
                                    minLength={8}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                    Role Assignment
                                </label>
                                <select
                                    value={newUserRole}
                                    onChange={(e) => setNewUserRole(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4.5 py-3 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                >
                                    <option value="owner">Owner (Full Admin Overrides)</option>
                                    <option value="admin">Admin (Collaborator Manager)</option>
                                    <option value="editor">Editor (Pages / Data Studio Access)</option>
                                    <option value="viewer">Viewer (Read Only Canvas)</option>
                                </select>
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-850 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsUserModalOpen(false)}
                                    className="px-4 py-2 text-sm text-slate-650 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-slate-800 rounded-lg transition-colors font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={createTenantUserMutation.isPending}
                                    className="px-5 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
                                >
                                    {createTenantUserMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Create User Account
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Edit Plan & Status */}
            {isEditModalOpen && selectedTenant && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-155">
                        <div className="bg-slate-50 dark:bg-slate-950 p-5 border-b border-slate-100 dark:border-slate-850 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                <Sliders className="w-5 h-5 text-primary-500" />
                                Manage Workspace Quota & Plan
                            </h3>
                            <button
                                onClick={() => {
                                    setIsEditModalOpen(false);
                                    setSelectedTenant(null);
                                }}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateTenant} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-wider mb-1">
                                    Workspace
                                </label>
                                <div className="text-sm font-bold bg-slate-50 dark:bg-slate-950 px-4.5 py-3 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200">
                                    {selectedTenant.name} ({selectedTenant.slug})
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-wider mb-1">
                                    Subscription Plan Tier
                                </label>
                                <select
                                    value={editPlan}
                                    onChange={(e) => setEditPlan(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4.5 py-3 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                >
                                    {planOptions.map(p => (
                                        <option key={p.id} value={p.slug}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-wider mb-1">
                                    Workspace Access Status
                                </label>
                                <select
                                    value={editStatus}
                                    onChange={(e) => setEditStatus(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4.5 py-3 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                >
                                    <option value="active">Active (Access allowed)</option>
                                    <option value="suspended">Suspended (Access blocked)</option>
                                </select>
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-850 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsEditModalOpen(false);
                                        setSelectedTenant(null);
                                    }}
                                    className="px-4 py-2 text-sm text-slate-650 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-slate-800 rounded-lg transition-colors font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={updateTenantMutation.isPending}
                                    className="px-5 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
                                >
                                    {updateTenantMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save Configurations
                                </button>
                            </div>
                        </form>

                        <TenantAddonsManager tenantId={selectedTenant.id} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default TenantsDirectory;


/* ============================================================================
 * Tenant Credit Drawer — per-tenant credit management (cloud mode)
 *============================================================================ */

function TenantCreditDrawer({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
    const queryClient = useQueryClient();
    const [grantDaily, setGrantDaily] = useState('');
    const [grantMonthly, setGrantMonthly] = useState('');

    const { data: balance, isLoading } = useQuery({
        queryKey: ['admin-agent-balance', tenantId],
        queryFn: () => adminAgentsApi.listBalances(),
        enabled: !!tenantId,
        select: (data) => data.balances.find((b: AgentBalanceRow) => b.tenant_id === tenantId),
        staleTime: STALE.DEFAULT,
    });

    const grantMutation = useMutation({
        mutationFn: () => adminAgentsApi.grantCredits(tenantId, parseInt(grantDaily) || 0, parseInt(grantMonthly) || 0),
        onSuccess: () => {
            toast.success('Credits granted');
            setGrantDaily('');
            setGrantMonthly('');
            queryClient.invalidateQueries({ queryKey: ['admin-agent-balance', tenantId] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to grant credits'),
    });

    const resetMutation = useMutation({
        mutationFn: () => adminAgentsApi.resetTenantDaily(tenantId),
        onSuccess: () => {
            toast.success('Daily credits reset');
            queryClient.invalidateQueries({ queryKey: ['admin-agent-balance', tenantId] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to reset'),
    });

    const UNL = -1;
    const bal = balance;
    const dailyUnlimited = bal?.daily_remaining === UNL || bal?.daily_limit === UNL;
    const monthlyUnlimited = bal?.monthly_remaining === UNL || bal?.monthly_limit === UNL;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-500" />
                    <span className="font-semibold text-slate-900 dark:text-white">Workspace Agent Credits</span>
                    <span className="text-xs text-slate-500">— {tenantName}</span>
                </div>
                {bal && (
                    <span className="text-xs text-slate-500">
                        Total consumed: <span className="font-bold text-slate-700">{bal.total_consumed.toLocaleString()}</span>
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className="py-4 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
            ) : !bal ? (
                <p className="text-sm text-slate-500">No credit data available. The tenant may not have used the Workspace Agent yet.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Daily pool */}
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-500 uppercase">Daily</span>
                            {bal.bonus_daily > 0 && <span className="text-xs text-purple-500">+{bal.bonus_daily} bonus</span>}
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-slate-900 dark:text-white">
                                {dailyUnlimited ? '∞' : bal.daily_remaining.toLocaleString()}
                            </span>
                            <span className="text-sm text-slate-500">/ {dailyUnlimited ? '∞' : bal.daily_limit?.toLocaleString()}</span>
                        </div>
                        <button
                            onClick={() => resetMutation.mutate()}
                            disabled={resetMutation.isPending}
                            className="mt-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50 flex items-center gap-1"
                        >
                            {resetMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                            Reset now
                        </button>
                    </div>

                    {/* Monthly pool */}
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-500 uppercase">Monthly</span>
                            {bal.bonus_monthly > 0 && <span className="text-xs text-purple-500">+{bal.bonus_monthly} bonus</span>}
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-slate-900 dark:text-white">
                                {monthlyUnlimited ? '∞' : bal.monthly_remaining?.toLocaleString()}
                            </span>
                            <span className="text-sm text-slate-500">/ {monthlyUnlimited ? '∞' : bal.monthly_limit?.toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Resets on the 1st of each month (UTC)</p>
                    </div>
                </div>
            )}

            {/* Grant credits */}
            <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Grant Bonus Credits</p>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        placeholder="Daily"
                        value={grantDaily}
                        onChange={(e) => setGrantDaily(e.target.value)}
                        className="w-20 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                    />
                    <span className="text-slate-500">+</span>
                    <input
                        type="number"
                        placeholder="Monthly"
                        value={grantMonthly}
                        onChange={(e) => setGrantMonthly(e.target.value)}
                        className="w-20 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                    />
                    <button
                        onClick={() => grantMutation.mutate()}
                        disabled={grantMutation.isPending || (!grantDaily && !grantMonthly)}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                    >
                        {grantMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                        Grant
                    </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Bonus credits persist across resets and stack on top of plan limits.</p>
            </div>
        </div>
    );
}


/* ============================================================================
 * Workspace Agent Analytics (cloud mode only)
 *============================================================================ */

function WorkspaceAgentAnalytics() {
    const queryClient = useQueryClient();
    const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

    const { data: config, isLoading: cfgLoading } = useQuery({
        queryKey: ['admin-agent-config'],
        queryFn: adminAgentsApi.getConfig,
        staleTime: STALE.DEFAULT,
    });
    const { data: analytics, isLoading: analyticsLoading } = useQuery({
        queryKey: ['admin-agent-analytics', period],
        queryFn: () => adminAgentsApi.getAnalytics(period),
        staleTime: 60_000, // 1 minute
    });

    const resetAllMutation = useMutation({
        mutationFn: () => adminAgentsApi.resetAllDaily(),
        onSuccess: (data) => {
            toast.success(`Reset ${data.reset_count} tenant daily pools`);
            queryClient.invalidateQueries({ queryKey: ['admin-agent-analytics'] });
            queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to reset'),
    });

    const cfg = config;
    const stats = analytics;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-purple-500/10 rounded-lg">
                        <Bot className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">Workspace Agent Analytics</h3>
                        <p className="text-xs text-slate-500">Credit usage across all tenants</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
                        {(['7d', '30d', '90d'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                    period === p
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                    {cfg && (
                        <div className="flex items-center gap-2 text-xs">
                            <span className={`px-2 py-1 rounded-full ${cfg.enabled ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                {cfg.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <button
                                onClick={() => resetAllMutation.mutate()}
                                disabled={resetAllMutation.isPending}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {resetAllMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                                Reset Daily
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {analyticsLoading ? (
                <div className="p-12 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
            ) : !stats ? (
                <div className="p-12 text-center text-slate-400 text-sm">No analytics data available</div>
            ) : (
                <div className="p-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                            <p className="text-xs text-slate-500 mb-1">Total Credits Consumed</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total_consumed.toLocaleString()}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                            <p className="text-xs text-slate-500 mb-1">Quota Exhausted</p>
                            <p className="text-2xl font-bold text-amber-500">{stats.quota_exhausted.toLocaleString()}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                            <p className="text-xs text-slate-500 mb-1">Active Tenants</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.active_tenants}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                            <p className="text-xs text-slate-500 mb-1">Avg Credits/Tenant</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.avg_credits_per_tenant}</p>
                        </div>
                    </div>

                    {/* Top tenants */}
                    {stats.top_tenants && stats.top_tenants.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Top Consumers</p>
                            <div className="space-y-2">
                                {stats.top_tenants.slice(0, 5).map((t) => (
                                    <div key={t.tenant_id} className="flex items-center justify-between text-sm p-2 bg-slate-50 dark:bg-slate-950 rounded-lg">
                                        <span className="font-medium text-slate-700 dark:text-slate-300">{t.tenant_name}</span>
                                        <span className="text-slate-500">{t.consumed} credits</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


/** Managed add-ons grant/revoke for a tenant (admin, inside the edit modal). */
const ADDON_TYPES: { value: string; label: string }[] = [
    { value: 'managed_edge_db', label: 'Managed edge + state DB' },
    { value: 'managed_cache', label: 'Managed cache' },
    { value: 'managed_queue', label: 'Managed queue' },
    { value: 'managed_domain', label: 'Managed custom domain' },
];

function TenantAddonsManager({ tenantId }: { tenantId: string }) {
    const queryClient = useQueryClient();
    const [addonType, setAddonType] = useState('managed_cache');
    const { data, isLoading } = useQuery({
        queryKey: ['admin-tenant-addons', tenantId],
        queryFn: () => adminPlansApi.listTenantAddons(tenantId),
        enabled: !!tenantId,
        staleTime: STALE.DEFAULT,
    });
    const grantMutation = useMutation({
        mutationFn: () => adminPlansApi.grantTenantAddon(tenantId, addonType, 1),
        onSuccess: () => { toast.success('Add-on granted'); queryClient.invalidateQueries({ queryKey: ['admin-tenant-addons', tenantId] }); },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to grant add-on'),
    });
    const revokeMutation = useMutation({
        mutationFn: (id: string) => adminPlansApi.revokeTenantAddon(id),
        onSuccess: () => { toast.success('Add-on revoked'); queryClient.invalidateQueries({ queryKey: ['admin-tenant-addons', tenantId] }); },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to revoke add-on'),
    });
    const active = (data?.addons ?? []).filter((a) => a.status === 'active');

    return (
        <div className="p-6 pt-4 border-t border-slate-100 dark:border-slate-850 space-y-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Managed add-ons</p>
            {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            ) : active.length === 0 ? (
                <p className="text-sm text-slate-500">No active add-ons.</p>
            ) : (
                <ul className="space-y-1.5">
                    {active.map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-sm">
                            <span>{a.addon_type.replace(/^managed_/, '').replace(/_/g, ' ')} <span className="text-slate-400">×{a.quantity}</span></span>
                            <button type="button" onClick={() => revokeMutation.mutate(a.id)} disabled={revokeMutation.isPending}
                                className="text-xs text-red-500 hover:underline disabled:opacity-50">Revoke</button>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex gap-2">
                <select value={addonType} onChange={(e) => setAddonType(e.target.value)}
                    className="flex-1 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
                    {ADDON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button type="button" onClick={() => grantMutation.mutate()} disabled={grantMutation.isPending}
                    className="px-3 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
                    {grantMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Grant
                </button>
            </div>
        </div>
    );
}
