/**
 * AuthProviderDialog — Unified provider selection for the Users dashboard.
 *
 * Option A pattern: "Configure Auth" button → shows existing connected
 * auth-capable accounts + "Connect New" option. Single-select.
 *
 * Follows the same AccountResourcePicker UX (select existing or connect new)
 * but scoped to AUTH_CAPABLE_PROVIDERS.
 */

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Link2, Plus, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useEdgeProviders } from '@/hooks/useEdgeInfrastructure';
import {
    AUTH_CAPABLE_PROVIDERS,
    PROVIDER_CONFIGS,
    PROVIDER_ICONS,
    CAPABILITY_LABELS,
} from '@/components/dashboard/settings/shared/edgeConstants';
import type { ProviderCapability } from '@/components/dashboard/settings/shared/edgeConstants';
import { ConnectProviderDialog } from '@/components/dashboard/settings/shared/ConnectProviderDialog';

interface AuthProviderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Currently active auth provider account ID */
    currentProviderId?: string | null;
    /** Called when a provider is selected */
    onProviderSelected: (accountId: string) => void;
}

export function AuthProviderDialog({
    open,
    onOpenChange,
    currentProviderId,
    onProviderSelected,
}: AuthProviderDialogProps) {
    const { data: allProviders = [], isLoading } = useEdgeProviders();
    const queryClient = useQueryClient();
    const [connectOpen, setConnectOpen] = React.useState(false);

    // Filter to auth-capable connected accounts
    const authProviders = React.useMemo(
        () => allProviders.filter((p: any) => AUTH_CAPABLE_PROVIDERS.includes(p.provider) && p.is_active),
        [allProviders]
    );

    const handleSelect = (accountId: string) => {
        onProviderSelected(accountId);
        onOpenChange(false);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Configure Auth Provider</DialogTitle>
                        <DialogDescription>
                            Select which connected account to use for user authentication. Only one provider can be active at a time.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 py-2">
                        {isLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading connected accounts...
                            </div>
                        ) : authProviders.length === 0 ? (
                            <div className="text-center py-6 space-y-3">
                                <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/40" />
                                <p className="text-sm text-muted-foreground">
                                    No auth-capable provider connected yet.
                                </p>
                                <Button
                                    variant="outline"
                                    onClick={() => setConnectOpen(true)}
                                    className="mx-auto"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Connect Auth Provider
                                </Button>
                            </div>
                        ) : (
                            <>
                                {authProviders.map((provider: any) => {
                                    const config = PROVIDER_CONFIGS[provider.provider];
                                    const Icon = PROVIDER_ICONS[provider.provider];
                                    const isActive = provider.id === currentProviderId;
                                    const capabilities = config?.capabilities
                                        ?.map((c: string) => CAPABILITY_LABELS[c as ProviderCapability] || c)
                                        .join(' · ');

                                    return (
                                        <button
                                            key={provider.id}
                                            onClick={() => handleSelect(provider.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors hover:bg-accent/50 ${
                                                isActive
                                                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                                                    : 'border-border'
                                            }`}
                                        >
                                            {Icon && <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm truncate">{provider.name}</span>
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                                                        {config?.label || provider.provider}
                                                    </Badge>
                                                    {isActive && (
                                                        <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 flex-shrink-0">
                                                            Active
                                                        </Badge>
                                                    )}
                                                </div>
                                                {capabilities && (
                                                    <span className="text-[11px] text-muted-foreground">{capabilities}</span>
                                                )}
                                            </div>
                                            <Link2 className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                                        </button>
                                    );
                                })}

                                <button
                                    onClick={() => setConnectOpen(true)}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed text-left transition-colors hover:bg-accent/50 text-primary"
                                >
                                    <Plus className="h-5 w-5 flex-shrink-0" />
                                    <span className="text-sm font-medium">Connect New Provider</span>
                                </button>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Stacked ConnectProviderDialog for creating new accounts */}
            <ConnectProviderDialog
                open={connectOpen}
                onOpenChange={setConnectOpen}
                allowedProviders={AUTH_CAPABLE_PROVIDERS}
                onConnected={async (accountId) => {
                    await queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
                    onProviderSelected(accountId);
                    setConnectOpen(false);
                    onOpenChange(false);
                }}
            />
        </>
    );
}
