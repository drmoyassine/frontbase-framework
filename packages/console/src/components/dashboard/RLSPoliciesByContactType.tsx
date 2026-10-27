import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from '@/components/ui/collapsible';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    ChevronDown,
    ChevronRight,
    Users,
    Trash2,
    Search,
    Loader2,
    HelpCircle
} from 'lucide-react';
import { RLSPolicyCard } from './RLSPolicyCard';
import { rlsApi } from '@/services/rls-api';
import { useToast } from '@/hooks/use-toast';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import type { RLSPolicy } from '@/types/rls';

interface RLSPoliciesByContactTypeProps {
    policies: RLSPolicy[];
    onRefresh: () => void;
    onEdit: (policy: RLSPolicy) => void;
    onDelete: (tableName: string, policyName: string) => Promise<void>;
    isLoading: boolean;
}

interface GroupedByContactType {
    contactType: string;
    label: string;
    policies: Array<RLSPolicy & { tableName: string; policyName: string }>;
}

/**
 * Categorize a policy by extracting contact_type from:
 * 1. Frontbase metadata (most accurate)
 * 2. SQL expression parsing
 * 3. Policy name pattern matching
 */
function categorizePolicy(
    policy: RLSPolicy,
    metadata: any | null,
    contactTypes: string[]
): string | null {
    // 1. Try Frontbase metadata first
    if (metadata?.formData?.actorConditionGroup?.conditions) {
        for (const cond of metadata.formData.actorConditionGroup.conditions) {
            if ('column' in cond && cond.column?.includes('contact_type') && cond.literalValue) {
                return cond.literalValue;
            }
        }
    }

    // 2. Parse SQL expression for contact_type references
    const usingExpr = policy.using_expression || '';
    for (const ct of contactTypes) {
        // Match patterns like: contact_type = 'Internal' or c.contact_type = 'External'
        const regex = new RegExp(`contact_type\\s*=\\s*['"]${ct}['"]`, 'i');
        if (regex.test(usingExpr)) {
            return ct;
        }
    }

    // 3. Try policy name pattern matching
    const policyName = policy.policy_name.toLowerCase();
    for (const ct of contactTypes) {
        if (policyName.includes(ct.toLowerCase())) {
            return ct;
        }
    }

    return null;
}

export function RLSPoliciesByContactType({
    policies,
    onRefresh,
    onEdit,
    onDelete,
    isLoading
}: RLSPoliciesByContactTypeProps) {
    const { toast } = useToast();
    const { config } = useUserContactConfig();

    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [metadataMap, setMetadataMap] = useState<Map<string, any>>(new Map());
    const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        contactType: string;
        policies: Array<{ tableName: string; policyName: string }>;
    } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Get contact types from config
    const contactTypes = useMemo(() => {
        if (!config?.contactTypes) return [];
        return Object.keys(config.contactTypes);
    }, [config?.contactTypes]);

    const contactTypeLabels = useMemo(() => {
        if (!config?.contactTypes) return {};
        return config.contactTypes;
    }, [config?.contactTypes]);

    // Load all metadata on mount
    useEffect(() => {
        const loadMetadata = async () => {
            setIsLoadingMetadata(true);
            try {
                const result = await rlsApi.getAllMetadata();
                if (result.success) {
                    const map = new Map<string, any>();
                    result.data.forEach((m: any) => {
                        const key = `${m.tableName}:${m.policyName}`;
                        map.set(key, m);
                    });
                    setMetadataMap(map);
                }
            } catch (e) {
                console.error('Failed to load metadata:', e);
            } finally {
                setIsLoadingMetadata(false);
            }
        };
        loadMetadata();
    }, []);

    // Group policies by contact_type
    const groupedByContactType = useMemo(() => {
        const groups = new Map<string, GroupedByContactType>();

        // Initialize groups for known contact types
        contactTypes.forEach(ct => {
            groups.set(ct, {
                contactType: ct,
                label: contactTypeLabels[ct] || ct,
                policies: []
            });
        });

        // Add uncategorized group
        groups.set('_uncategorized_', {
            contactType: '_uncategorized_',
            label: 'Uncategorized',
            policies: []
        });

        // Categorize each policy
        policies.forEach(policy => {
            const key = `${policy.table_name}:${policy.policy_name}`;
            const metadata = metadataMap.get(key);
            const contactType = categorizePolicy(policy, metadata, contactTypes);

            const group = contactType && groups.has(contactType)
                ? groups.get(contactType)!
                : groups.get('_uncategorized_')!;

            group.policies.push({
                ...policy,
                tableName: policy.table_name,
                policyName: policy.policy_name
            });
        });

        // Convert to array, filter empty groups, sort
        return Array.from(groups.values())
            .filter(g => g.policies.length > 0)
            .sort((a, b) => {
                if (a.contactType === '_uncategorized_') return 1;
                if (b.contactType === '_uncategorized_') return -1;
                return a.label.localeCompare(b.label);
            });
    }, [policies, metadataMap, contactTypes, contactTypeLabels]);

    // Filter by search
    const filteredGroups = useMemo(() => {
        if (!searchQuery) return groupedByContactType;

        return groupedByContactType
            .map(group => ({
                ...group,
                policies: group.policies.filter(p =>
                    p.policy_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    p.table_name.toLowerCase().includes(searchQuery.toLowerCase())
                )
            }))
            .filter(g => g.policies.length > 0);
    }, [groupedByContactType, searchQuery]);

    const toggleGroup = (contactType: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(contactType)) {
                next.delete(contactType);
            } else {
                next.add(contactType);
            }
            return next;
        });
    };

    const handleBulkDelete = async () => {
        if (!deleteConfirm) return;

        setIsDeleting(true);
        try {
            const result = await rlsApi.bulkDeletePolicies(deleteConfirm.policies);

            if (result.success) {
                toast({
                    title: 'Policies Deleted',
                    description: result.message
                });
            } else {
                toast({
                    title: 'Partial Deletion',
                    description: result.message,
                    variant: 'destructive'
                });
            }

            onRefresh();
        } catch (e: any) {
            toast({
                title: 'Delete Failed',
                description: e.message || 'Failed to delete policies',
                variant: 'destructive'
            });
        } finally {
            setIsDeleting(false);
            setDeleteConfirm(null);
        }
    };

    const totalPolicies = policies.length;

    return (
        <div className="space-y-4">
            {/* Search */}
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
                <div className="text-sm text-muted-foreground">
                    {totalPolicies} {totalPolicies === 1 ? 'policy' : 'policies'}
                </div>
            </div>

            <Separator />

            {/* Loading */}
            {(isLoading || isLoadingMetadata) && (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">
                        {isLoadingMetadata ? 'Loading metadata...' : 'Loading policies...'}
                    </span>
                </div>
            )}

            {/* Groups */}
            {!isLoading && !isLoadingMetadata && (
                <div className="space-y-3">
                    {filteredGroups.map(group => (
                        <Collapsible
                            key={group.contactType}
                            open={expandedGroups.has(group.contactType)}
                            onOpenChange={() => toggleGroup(group.contactType)}
                        >
                            <div className="flex items-center justify-between">
                                <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left py-2 hover:bg-slate-50 rounded-lg px-2 -ml-2 transition-colors">
                                    {expandedGroups.has(group.contactType) ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    {group.contactType === '_uncategorized_' ? (
                                        <HelpCircle className="h-4 w-4 text-amber-500" />
                                    ) : (
                                        <Users className="h-4 w-4 text-blue-500" />
                                    )}
                                    <span className="font-medium">{group.label}</span>
                                    <Badge variant="secondary" className="ml-2">
                                        {group.policies.length} {group.policies.length === 1 ? 'policy' : 'policies'}
                                    </Badge>
                                </CollapsibleTrigger>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirm({
                                            contactType: group.label,
                                            policies: group.policies.map(p => ({
                                                tableName: p.tableName,
                                                policyName: p.policyName
                                            }))
                                        });
                                    }}
                                >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete All
                                </Button>
                            </div>

                            <CollapsibleContent>
                                {/* Use same 2-column grid layout as By Table view */}
                                <div className="border-t mt-2 p-4 grid gap-3 md:grid-cols-2">
                                    {group.policies.map(policy => (
                                        <RLSPolicyCard
                                            key={`${policy.table_name}-${policy.policy_name}`}
                                            policy={policy}
                                            onEdit={onEdit}
                                            onDelete={onDelete}
                                        />
                                    ))}
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    ))}

                    {filteredGroups.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            No policies found
                        </div>
                    )}
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 className="h-5 w-5" />
                            Delete All {deleteConfirm?.contactType} Policies?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete {deleteConfirm?.policies.length} policies from Supabase.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBulkDelete}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                'Delete All'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
