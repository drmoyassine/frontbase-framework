/**
 * AccountResourcePicker
 * 
 * Shared component for Edge DB/Cache/Queue forms.
 * Flow: Select Connected Account (or Connect New) → Discover resources → Pick resource (or Create New)
 * 
 * No manual entry — all resources come from connected accounts.
 * Supports filtering resources by type (e.g. only 'redis' or only 'qstash')
 * and creating new resources via the management API.
 */

import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Link2, RefreshCw, Plus } from 'lucide-react';
import { useEdgeProviders } from '@/hooks/useEdgeInfrastructure';
import { ConnectProviderDialog } from './ConnectProviderDialog';

const API_BASE = '';

export interface DiscoveredResource {
    id: string;
    name: string;
    type: string;
    // Turso
    hostname?: string;
    db_url?: string;
    org?: string;
    group?: string;
    regions?: string[];
    // Upstash Redis
    endpoint?: string;
    rest_url?: string;
    rest_token?: string;
    region?: string;
    // Neon
    pg_version?: string;
    connection_uri?: string;
    // QStash
    token?: string;
    signing_key?: string;
    next_signing_key?: string;
    // WordPress
    api_url?: string;
    username?: string;
    // Google Sheets
    webAppUrl?: string;
    spreadsheetId?: string;
}

// Upstash regions available for Redis creation
const UPSTASH_REGIONS = [
    { value: 'us-east-1', label: 'US East (Virginia)' },
    { value: 'us-west-1', label: 'US West (N. California)' },
    { value: 'us-west-2', label: 'US West (Oregon)' },
    { value: 'eu-west-1', label: 'EU (Ireland)' },
    { value: 'eu-central-1', label: 'EU (Frankfurt)' },
    { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
    { value: 'sa-east-1', label: 'South America (São Paulo)' },
];

interface AccountResourcePickerProps {
    /** Provider types to filter accounts by (e.g. ['turso'], ['upstash'], ['neon']) */
    compatibleProviders: string[];
    /** Only show resources with this type (e.g. 'redis', 'qstash', 'turso_db') */
    resourceTypeFilter?: string;
    /** Type to create when user clicks "Create New" (e.g. 'redis') */
    createResourceType?: string;
    /** Called when a resource is selected — form should auto-fill from this */
    onResourceSelected: (resource: DiscoveredResource, accountId: string) => void;
    /** Called when user clears/resets the account selection */
    onClear?: () => void;
    /** Currently selected account ID (for edit mode) */
    selectedAccountId?: string | null;
    /** Label override */
    label?: string;
    /** URLs already imported — matching resources shown as "Already connected" */
    existingUrls?: string[];
    /** Auto-select single account and hide account dropdown (e.g. Turso container) */
    autoSelectSingle?: boolean;
    /** Label for the resource dropdown (e.g. 'Select Database') */
    resourceLabel?: string;
    /** Hide Display Name in the ConnectProviderDialog (e.g. Turso) */
    hideConnectDisplayName?: boolean;
}

export const AccountResourcePicker: React.FC<AccountResourcePickerProps> = ({
    compatibleProviders,
    resourceTypeFilter,
    createResourceType,
    onResourceSelected,
    onClear,
    selectedAccountId,
    label = 'Connected Account',
    existingUrls = [],
    autoSelectSingle,
    resourceLabel,
    hideConnectDisplayName,
}) => {
    const { data: allProviders = [] } = useEdgeProviders();
    const queryClient = useQueryClient();
    const [selectedAccount, setSelectedAccount] = useState<string>(selectedAccountId || '');
    const [resources, setResources] = useState<DiscoveredResource[]>([]);
    const [selectedResourceId, setSelectedResourceId] = useState<string>('');
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [discoverError, setDiscoverError] = useState<string | null>(null);

    // Create new resource dialog state
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createRegion, setCreateRegion] = useState('us-east-1');
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Stacked "Connect New Account" dialog
    const [showConnectDialog, setShowConnectDialog] = useState(false);

    // Filter providers to only compatible types
    const compatibleAccounts = allProviders.filter(
        (p: any) => compatibleProviders.includes(p.provider) && p.is_active
    );

    // Auto-select single account when autoSelectSingle is on
    useEffect(() => {
        if (autoSelectSingle && compatibleAccounts.length === 1 && !selectedAccount) {
            setSelectedAccount(compatibleAccounts[0].id);
        }
    }, [autoSelectSingle, compatibleAccounts.length]);

    // Auto-discover when account is selected
    useEffect(() => {
        if (selectedAccount) {
            discoverResources(selectedAccount);
        } else {
            setResources([]);
            setDiscoverError(null);
        }
    }, [selectedAccount]);

    const discoverResources = async (accountId: string) => {
        setIsDiscovering(true);
        setDiscoverError(null);
        setResources([]);
        try {
            const res = await fetch(`${API_BASE}/api/edge-providers/discover-by-account/${accountId}`, {
                method: 'POST',
            });

            if (!res.ok) {
                throw new Error(`Discovery failed: HTTP ${res.status}`);
            }
            const data = await res.json();
            if (data.success && data.resources) {
                // Apply type filter if specified
                const filtered = resourceTypeFilter
                    ? data.resources.filter((r: DiscoveredResource) => r.type === resourceTypeFilter)
                    : data.resources;
                setResources(filtered);
            } else {
                setDiscoverError(data.detail || 'No resources found');
            }
        } catch (e: any) {
            setDiscoverError(e.message || 'Discovery failed');
        } finally {
            setIsDiscovering(false);
        }
    };

    // Auto-select when discovery returns exactly 1 available (non-imported) resource.
    // This handles the common case where a Supabase account is scoped to a single project
    // — no need to re-pick what was already selected during account creation.
    useEffect(() => {
        if (resources.length > 0 && !selectedResourceId && !isDiscovering) {
            const available = resources.filter(r => !isAlreadyImported(r));
            if (available.length === 1) {
                setSelectedResourceId(available[0].id);
                onResourceSelected(available[0], selectedAccount);
            }
        }
    }, [resources, isDiscovering]);

    const handleAccountChange = (value: string) => {
        if (value === '__connect_new__') {
            setShowConnectDialog(true);
            return;
        }
        setSelectedAccount(value);
        setSelectedResourceId('');
    };

    /** Check if a discovered resource is already imported */
    const isAlreadyImported = (resource: DiscoveredResource): boolean => {
        if (existingUrls.length === 0) return false;
        const candidates = [
            resource.rest_url,
            resource.endpoint ? `https://${resource.endpoint}` : undefined,
            resource.endpoint,
            resource.db_url,
            resource.hostname ? `libsql://${resource.hostname}` : undefined,
            resource.type === 'qstash' ? 'https://qstash.upstash.io' : undefined,
        ].filter(Boolean) as string[];
        return candidates.some(url =>
            existingUrls.some(existing => existing.includes(url) || url.includes(existing))
        );
    };

    const handleResourceSelect = (resourceId: string) => {
        if (resourceId === '__connect_new_account__') {
            setShowConnectDialog(true);
            return;
        }
        if (resourceId === '__create_new__') {
            if (hideConnectDisplayName) {
                // Turso: open the connect modal directly (it's the DB form)
                setShowConnectDialog(true);
            } else {
                setCreateName('');
                setCreateRegion('us-east-1');
                setCreateError(null);
                setShowCreateDialog(true);
            }
            return;
        }
        const resource = resources.find(r => r.id === resourceId);
        if (resource && !isAlreadyImported(resource)) {
            setSelectedResourceId(resourceId);
            onResourceSelected(resource, selectedAccount);
        }
    };

    const handleCreateNew = async () => {
        if (!createName.trim() || !createResourceType) return;
        setIsCreating(true);
        setCreateError(null);
        try {
            const res = await fetch(`${API_BASE}/api/edge-providers/create-resource-by-account/${selectedAccount}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resource_type: createResourceType,
                    name: createName.trim(),
                    region: createRegion,
                }),
            });
            const data = await res.json();
            if (data.success && data.resource) {
                // Auto-select the newly created resource
                setSelectedResourceId(data.resource.id);
                onResourceSelected(data.resource, selectedAccount);
                setShowCreateDialog(false);
                setCreateName('');
                // Refresh discover list
                discoverResources(selectedAccount);
            } else {
                setCreateError(data.detail || 'Creation failed');
            }
        } catch (e: any) {
            setCreateError(e.message || 'Creation failed');
        } finally {
            setIsCreating(false);
        }
    };

    // No compatible accounts → show "Connect Account" button
    if (compatibleAccounts.length === 0) {
        const providerName = compatibleProviders[0]?.charAt(0).toUpperCase() + (compatibleProviders[0]?.slice(1) || '');
        const buttonLabel = autoSelectSingle
            ? `Add ${providerName} Database`
            : `Connect ${providerName} Account`;
        return (
            <div className="space-y-2">
                <Label className="text-sm">{autoSelectSingle ? (resourceLabel || label) : label}</Label>
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 text-muted-foreground"
                    onClick={() => setShowConnectDialog(true)}
                >
                    <Plus className="h-3.5 w-3.5" />
                    {buttonLabel}
                </Button>
                <ConnectProviderDialog
                    provider={compatibleProviders[0]}
                    open={showConnectDialog}
                    onOpenChange={setShowConnectDialog}
                    hideDisplayName={hideConnectDisplayName}
                    onConnected={async (newAccountId) => {
                        await queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
                        setSelectedAccount(newAccountId);
                        // Force re-discover even if account ID is the same (Turso adds DB to existing account)
                        discoverResources(newAccountId);
                    }}
                />
            </div>
        );
    }

    const createResourceLabel = createResourceType === 'redis'
        ? 'Redis Database'
        : createResourceType === 'turso_db'
            ? 'Turso Database'
            : 'Resource';

    return (
        <div className="space-y-3">
            {/* Account selector — hidden when autoSelectSingle with 1 account */}
            {!(autoSelectSingle && compatibleAccounts.length === 1) && (
                <div className="space-y-1.5">
                    <Label className="text-sm">{label}</Label>
                    <Select value={selectedAccount || undefined} onValueChange={handleAccountChange}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a connected account..." />
                        </SelectTrigger>
                        <SelectContent>
                            {compatibleAccounts.map((account: any) => (
                                <SelectItem key={account.id} value={account.id}>
                                    <span className="flex items-center gap-2">
                                        <Link2 className="h-3 w-3" />
                                        {account.name}
                                        <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                                            {account.provider}
                                        </Badge>
                                    </span>
                                </SelectItem>
                            ))}
                            <SelectItem value="__connect_new__">
                                <span className="flex items-center gap-2 text-primary">
                                    <Plus className="h-3 w-3" />
                                    Connect New Account
                                </span>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Discover results */}
            {selectedAccount && (
                <div className="space-y-2">
                    {isDiscovering ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Discovering resources...
                        </div>
                    ) : discoverError ? (
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-destructive">{discoverError}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => discoverResources(selectedAccount)}
                            >
                                <RefreshCw className="h-3 w-3 mr-1" /> Retry
                            </Button>
                        </div>
                    ) : (() => {
                        const available = resources.filter(r => !isAlreadyImported(r));
                        const autoSelected = available.length === 1 && selectedResourceId === available[0].id;

                        // Auto-select shortcut: hide dropdown when exactly 1 resource is available
                        // BUT only when creation is not possible — if createResourceType is set,
                        // always show dropdown so users can access "+ Create New".
                        if (autoSelected && !createResourceType) {
                            const r = available[0];
                            return (
                                <div className="flex items-center gap-2 py-1.5 px-3 rounded-md bg-muted/50 border text-sm">
                                    <span className="font-medium">{r.name}</span>
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                                        {r.type}
                                    </Badge>
                                    {r.region && (
                                        <span className="text-[10px] text-muted-foreground">{r.region}</span>
                                    )}
                                </div>
                            );
                        }

                        return (
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                {resourceLabel || `Select a resource`} ({resources.length} found)
                            </Label>
                            <Select value={selectedResourceId || undefined} onValueChange={handleResourceSelect}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Pick a resource..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {resources.map(r => {
                                        const imported = isAlreadyImported(r);
                                        return (
                                            <SelectItem
                                                key={r.id}
                                                value={r.id}
                                                disabled={imported}
                                            >
                                                <span className={`flex items-center gap-2 ${imported ? 'opacity-50' : ''}`}>
                                                    {r.name}
                                                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                                                        {r.type}
                                                    </Badge>
                                                    {imported && (
                                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                            Already connected
                                                        </Badge>
                                                    )}
                                                    {!imported && r.region && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {r.region}
                                                        </span>
                                                    )}
                                                </span>
                                            </SelectItem>
                                        );
                                    })}
                                    {/* Create New option inside the dropdown */}
                                    {createResourceType && (
                                        <SelectItem value="__create_new__">
                                            <span className="flex items-center gap-2 text-primary">
                                                <Plus className="h-3 w-3" />
                                                Create New {createResourceLabel}
                                            </span>
                                        </SelectItem>
                                    )}
                                    {/* Connect Another Account — always available */}
                                    <SelectItem value="__connect_new_account__">
                                        <span className="flex items-center gap-2 text-primary">
                                            <Plus className="h-3 w-3" />
                                            Connect Another Account
                                        </span>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        );
                    })()}
                </div>
            )}

            <ConnectProviderDialog
                provider={compatibleProviders[0]}
                open={showConnectDialog}
                onOpenChange={setShowConnectDialog}
                hideDisplayName={hideConnectDisplayName}
                onConnected={async (newAccountId) => {
                    await queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
                    setSelectedAccount(newAccountId);
                    // Force re-discover even if account ID is the same
                    discoverResources(newAccountId);
                }}
            />

            {/* Create New Resource dialog */}
            {createResourceType && (
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Create New {createResourceLabel}</DialogTitle>
                            <DialogDescription>
                                This will create a new {createResourceLabel.toLowerCase()} in your connected account.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 py-2">
                            <div className="space-y-1">
                                <Label className="text-sm">Name</Label>
                                <Input
                                    placeholder={`e.g. my-${createResourceType}`}
                                    value={createName}
                                    onChange={e => setCreateName(e.target.value)}
                                />
                            </div>
                            {createResourceType === 'redis' && (
                                <div className="space-y-1">
                                    <Label className="text-sm">Region</Label>
                                    <Select value={createRegion} onValueChange={setCreateRegion}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {UPSTASH_REGIONS.map(r => (
                                                <SelectItem key={r.value} value={r.value}>
                                                    {r.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            {createError && (
                                <p className="text-sm text-destructive">{createError}</p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreateNew}
                                disabled={!createName.trim() || isCreating}
                            >
                                {isCreating ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                                ) : (
                                    <><Plus className="h-4 w-4 mr-2" /> Create</>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};
