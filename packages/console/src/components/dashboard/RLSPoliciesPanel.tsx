import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from '@/components/ui/collapsible';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    Shield,
    Plus,
    RefreshCw,
    ChevronDown,
    ChevronRight,
    Table,
    ShieldCheck,
    ShieldOff,
    Search,
    AlertCircle,
    Loader2,
    Layers,
    Users,
    Table as TableIcon
} from 'lucide-react';
import { useRLSPolicies } from '@/hooks/data/useRLSPolicies';
import { RLSPolicyCard } from './RLSPolicyCard';
import { RLSPolicyBuilder } from './RLSPolicyBuilder';
import { RLSBatchPolicyBuilder } from './RLSBatchPolicyBuilder';
import { RLSPoliciesByContactType } from './RLSPoliciesByContactType';
import { rlsApi } from '@/services/rls-api';
import { useToast } from '@/hooks/use-toast';
import type { RLSPolicy, RLSPolicyFormData, RLSTableStatus, RLSPolicyBatchFormData, RLSOperation } from '@/types/rls';

// Type for metadata verification result
interface VerifiedMetadata {
    hasMetadata: boolean;
    isVerified: boolean;
    reason: 'match' | 'modified_externally' | 'no_metadata';
    formData: RLSPolicyFormData | null;
}

export function RLSPoliciesPanel() {
    const { toast } = useToast();
    const {
        policies,
        tablesStatus,
        isLoading,
        isLoadingTables,
        error,
        refresh,
        createPolicy,
        updatePolicy,
        deletePolicy,
        toggleTableRLS
    } = useRLSPolicies();

    // UI state
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<RLSPolicy | null>(null);
    const [verifiedMetadata, setVerifiedMetadata] = useState<VerifiedMetadata | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTable, setFilterTable] = useState<string>('_all_');
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<'byTable' | 'byContactType'>('byTable');

    // Group policies by table
    const groupedPolicies = useMemo(() => {
        const groups = new Map<string, RLSPolicy[]>();

        policies.forEach(policy => {
            const tableName = policy.table_name;
            if (!groups.has(tableName)) {
                groups.set(tableName, []);
            }
            groups.get(tableName)!.push(policy);
        });

        return groups;
    }, [policies]);

    // Get unique table names for filter
    const tableNames = useMemo(() => {
        return Array.from(new Set(policies.map(p => p.table_name))).sort();
    }, [policies]);

    // Filter policies based on search and table filter
    const filteredGroupedPolicies = useMemo(() => {
        const filtered = new Map<string, RLSPolicy[]>();

        groupedPolicies.forEach((tablePolicies, tableName) => {
            // Filter by table
            if (filterTable !== '_all_' && tableName !== filterTable) return;

            // Filter by search
            const matchingPolicies = tablePolicies.filter(p =>
                p.policy_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.table_name.toLowerCase().includes(searchQuery.toLowerCase())
            );

            if (matchingPolicies.length > 0) {
                filtered.set(tableName, matchingPolicies);
            }
        });

        return filtered;
    }, [groupedPolicies, filterTable, searchQuery]);

    // Get table RLS status
    const getTableRLSStatus = (tableName: string): RLSTableStatus | undefined => {
        return tablesStatus.find(t => t.table_name === tableName);
    };

    // Toggle table expansion
    const toggleTableExpanded = (tableName: string) => {
        setExpandedTables(prev => {
            const next = new Set(prev);
            if (next.has(tableName)) {
                next.delete(tableName);
            } else {
                next.add(tableName);
            }
            return next;
        });
    };

    // Handle edit - verify metadata before opening dialog
    const handleEditPolicy = async (policy: RLSPolicy) => {
        const { rlsApi } = await import('@/services/rls-api');
        const result = await rlsApi.verifyMetadata(
            policy.table_name,
            policy.policy_name,
            policy.using_expression
        );

        if (result.success && result.data) {
            setVerifiedMetadata(result.data as VerifiedMetadata);
        } else {
            // No metadata or verification failed - fallback to raw mode
            setVerifiedMetadata({
                hasMetadata: false,
                isVerified: false,
                reason: 'no_metadata',
                formData: null
            });
        }

        setEditingPolicy(policy);
    };

    // Handle policy creation
    const handleCreatePolicy = async (
        formData: RLSPolicyFormData,
        sql: { using: string; check: string },
        propagationTargets?: import('@/types/rls').RLSPropagationTarget[]
    ) => {
        const result = await createPolicy({
            tableName: formData.tableName,
            policyName: formData.policyName,
            operation: formData.operation,
            usingExpression: sql.using,
            checkExpression: sql.check || undefined,
            roles: formData.roles,
            permissive: formData.permissive,
            propagateTo: propagationTargets
        });

        if (result.success) {
            // Save metadata for visual editing later
            const { rlsApi } = await import('@/services/rls-api');
            await rlsApi.saveMetadata(
                formData.tableName,
                formData.policyName,
                { ...formData, propagationTargets }, // Save propagation targets for restoration
                sql.using,
                sql.check
            );

            toast({
                title: 'Policy Created',
                description: `Successfully created policy "${formData.policyName}" on table "${formData.tableName}"`
            });
            setIsCreateDialogOpen(false);
        } else {
            toast({
                title: 'Failed to Create Policy',
                description: result.error || 'An error occurred',
                variant: 'destructive'
            });
        }
    };

    // Handle batch policy creation
    const handleBatchCreatePolicies = async (
        formData: RLSPolicyBatchFormData,
        tableRulesWithSQL: Array<{
            tableName: string;
            operation: RLSOperation;
            usingExpression: string;
            checkExpression?: string;
        }>
    ) => {
        try {
            const result = await rlsApi.createBatchPolicies({
                policyBaseName: formData.policyBaseName,
                tableRules: tableRulesWithSQL,
                roles: formData.roles,
                permissive: formData.permissive
            });

            if (result.success) {
                toast({
                    title: 'Policies Created',
                    description: result.message
                });
                setIsBatchDialogOpen(false);
                refresh(); // Refresh the policies list
            } else {
                toast({
                    title: 'Batch Creation Partial Failure',
                    description: `${result.successCount} succeeded, ${result.errorCount} failed`,
                    variant: 'destructive'
                });
                // Still close dialog and refresh to show what was created
                setIsBatchDialogOpen(false);
                refresh();
            }
        } catch (error: any) {
            toast({
                title: 'Failed to Create Policies',
                description: error.message || 'An error occurred',
                variant: 'destructive'
            });
        }
    };

    // Handle policy update
    const handleUpdatePolicy = async (
        formData: RLSPolicyFormData,
        sql: { using: string; check: string }
    ) => {
        if (!editingPolicy) return;

        const result = await updatePolicy(
            editingPolicy.table_name,
            editingPolicy.policy_name,
            {
                newPolicyName: formData.policyName !== editingPolicy.policy_name ? formData.policyName : undefined,
                operation: formData.operation,
                usingExpression: sql.using,
                checkExpression: sql.check || undefined,
                roles: formData.roles,
                permissive: formData.permissive
            }
        );

        if (result.success) {
            // Update metadata
            const { rlsApi } = await import('@/services/rls-api');
            await rlsApi.updateMetadata(
                editingPolicy.table_name,
                editingPolicy.policy_name,
                formData.policyName !== editingPolicy.policy_name ? formData.policyName : undefined,
                formData,
                sql.using,
                sql.check
            );

            toast({
                title: 'Policy Updated',
                description: `Successfully updated policy "${formData.policyName}"`
            });
            setEditingPolicy(null);
        } else {
            toast({
                title: 'Failed to Update Policy',
                description: result.error || 'An error occurred',
                variant: 'destructive'
            });
        }
    };

    // Handle policy deletion
    const handleDeletePolicy = async (tableName: string, policyName: string) => {
        const result = await deletePolicy(tableName, policyName);

        if (result.success) {
            // Delete metadata
            const { rlsApi } = await import('@/services/rls-api');
            await rlsApi.deleteMetadata(tableName, policyName);

            toast({
                title: 'Policy Deleted',
                description: `Successfully deleted policy "${policyName}"`
            });
        } else {
            toast({
                title: 'Failed to Delete Policy',
                description: result.error || 'An error occurred',
                variant: 'destructive'
            });
        }
    };

    // Handle table RLS toggle
    const handleToggleTableRLS = async (tableName: string, enable: boolean) => {
        const result = await toggleTableRLS(tableName, enable);

        if (result.success) {
            toast({
                title: enable ? 'RLS Enabled' : 'RLS Disabled',
                description: result.message
            });
        } else {
            toast({
                title: 'Failed to Toggle RLS',
                description: result.error || 'An error occurred',
                variant: 'destructive'
            });
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5" />
                            Row Level Security Policies
                        </CardTitle>
                        <CardDescription>
                            Create and manage RLS policies to control data access based on user roles and permissions
                        </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={refresh}
                            disabled={isLoading}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setIsBatchDialogOpen(true)}>
                            <Layers className="h-4 w-4 mr-2" />
                            Batch Create
                        </Button>
                        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Policy
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Error state */}
                {error && (
                    <div className="flex items-center gap-2 p-4 bg-red-50 text-red-800 rounded-lg">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        <div>
                            <p className="font-medium">Failed to load policies</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    </div>
                )}

                {/* View Mode Tabs */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                    <button
                        onClick={() => setViewMode('byTable')}
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'byTable'
                            ? 'bg-white text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <TableIcon className="h-4 w-4" />
                        By Table
                    </button>
                    <button
                        onClick={() => setViewMode('byContactType')}
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'byContactType'
                            ? 'bg-white text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <Users className="h-4 w-4" />
                        By User Group
                    </button>
                </div>

                {/* By Contact Type View */}
                {viewMode === 'byContactType' && (
                    <RLSPoliciesByContactType
                        policies={policies}
                        onRefresh={refresh}
                        onEdit={handleEditPolicy}
                        onDelete={handleDeletePolicy}
                        isLoading={isLoading}
                    />
                )}

                {/* By Table View (existing) */}
                {viewMode === 'byTable' && (
                    <>
                        {/* Filters */}
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1 max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search policies..."
                                    className="pl-9"
                                />
                            </div>

                            <Select value={filterTable} onValueChange={setFilterTable}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="All tables" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="_all_">All tables</SelectItem>
                                    {tableNames.map((name: string) => (
                                        <SelectItem key={name} value={name}>{name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <div className="text-sm text-muted-foreground">
                                {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
                            </div>
                        </div>

                        <Separator />

                        {/* Loading state */}
                        {isLoading && policies.length === 0 && (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        )}

                        {/* Empty state */}
                        {!isLoading && policies.length === 0 && (
                            <div className="text-center py-12">
                                <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                                <h3 className="font-medium text-lg mb-1">No RLS Policies</h3>
                                <p className="text-muted-foreground text-sm mb-4">
                                    Create your first Row Level Security policy to control data access
                                </p>
                                <Button onClick={() => setIsCreateDialogOpen(true)}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create Policy
                                </Button>
                            </div>
                        )}

                        {/* Policies grouped by table */}
                        <div className="space-y-3">
                            {Array.from(filteredGroupedPolicies.entries()).map(([tableName, tablePolicies]) => {
                                const tableStatus = getTableRLSStatus(tableName);
                                const isExpanded = expandedTables.has(tableName);

                                return (
                                    <Collapsible
                                        key={tableName}
                                        open={isExpanded}
                                        onOpenChange={() => toggleTableExpanded(tableName)}
                                    >
                                        <div className="rounded-lg border">
                                            <CollapsibleTrigger className="w-full">
                                                <div className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        {isExpanded ? (
                                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                        <Table className="h-4 w-4 text-muted-foreground" />
                                                        <span className="font-medium">{tableName}</span>
                                                        <Badge variant="secondary" className="text-xs">
                                                            {tablePolicies.length} {tablePolicies.length === 1 ? 'policy' : 'policies'}
                                                        </Badge>
                                                    </div>

                                                    <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                                                        {tableStatus && (
                                                            <div className="flex items-center gap-2">
                                                                {tableStatus.rls_enabled ? (
                                                                    <ShieldCheck className="h-4 w-4 text-green-600" />
                                                                ) : (
                                                                    <ShieldOff className="h-4 w-4 text-amber-600" />
                                                                )}
                                                                <span className="text-xs text-muted-foreground">
                                                                    RLS {tableStatus.rls_enabled ? 'enabled' : 'disabled'}
                                                                </span>
                                                                <Switch
                                                                    checked={!!tableStatus.rls_enabled}
                                                                    onCheckedChange={(checked) => handleToggleTableRLS(tableName, checked)}
                                                                    disabled={isLoadingTables}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </CollapsibleTrigger>

                                            <CollapsibleContent>
                                                <div className="border-t p-4 grid gap-3 md:grid-cols-2">
                                                    {tablePolicies.map(policy => (
                                                        <RLSPolicyCard
                                                            key={policy.policy_name}
                                                            policy={policy}
                                                            onEdit={handleEditPolicy}
                                                            onDelete={handleDeletePolicy}
                                                        />
                                                    ))}
                                                </div>
                                            </CollapsibleContent>
                                        </div>
                                    </Collapsible>
                                );
                            })}
                        </div>
                    </>
                )}
            </CardContent>

            {/* Create Policy Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Create RLS Policy</DialogTitle>
                        <DialogDescription>
                            Build a new Row Level Security policy to control data access
                        </DialogDescription>
                    </DialogHeader>
                    <RLSPolicyBuilder
                        onSubmit={handleCreatePolicy}
                        onCancel={() => setIsCreateDialogOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* Batch Create Policies Dialog */}
            <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Layers className="h-5 w-5" />
                            Batch Create RLS Policies
                        </DialogTitle>
                        <DialogDescription>
                            Create policies for multiple tables at once with shared access rules
                        </DialogDescription>
                    </DialogHeader>
                    <RLSBatchPolicyBuilder
                        onSubmit={handleBatchCreatePolicies}
                        onCancel={() => setIsBatchDialogOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* Edit Policy Dialog */}
            <Dialog open={!!editingPolicy} onOpenChange={(open) => {
                if (!open) {
                    setEditingPolicy(null);
                    setVerifiedMetadata(null);
                }
            }}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit RLS Policy</DialogTitle>
                        <DialogDescription>
                            {verifiedMetadata?.isVerified
                                ? 'Modify the Row Level Security policy using the Visual Builder'
                                : verifiedMetadata?.reason === 'modified_externally'
                                    ? '⚠️ This policy was modified outside Frontbase. Only Raw SQL editing is available.'
                                    : 'Modify the Row Level Security policy'}
                        </DialogDescription>
                    </DialogHeader>
                    {editingPolicy && (
                        <RLSPolicyBuilder
                            initialData={
                                verifiedMetadata?.isVerified && verifiedMetadata.formData
                                    ? verifiedMetadata.formData
                                    : {
                                        policyName: editingPolicy.policy_name,
                                        tableName: editingPolicy.table_name,
                                        operation: editingPolicy.operation,
                                        roles: editingPolicy.roles || ['authenticated'],
                                        permissive: editingPolicy.is_permissive
                                    }
                            }
                            existingExpressions={{
                                using: editingPolicy.using_expression || '',
                                check: editingPolicy.check_expression || ''
                            }}
                            forceRawMode={!verifiedMetadata?.isVerified}
                            onSubmit={handleUpdatePolicy}
                            onCancel={() => {
                                setEditingPolicy(null);
                                setVerifiedMetadata(null);
                            }}
                            isEditing
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
