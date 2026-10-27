import React from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEdgeProviders } from '@/hooks/useEdgeInfrastructure';
import {
  AUTH_CAPABLE_PROVIDERS,
  PROVIDER_CONFIGS,
  PROVIDER_ICONS,
} from '@/components/dashboard/settings/shared/edgeConstants';

interface AuthProviderSelectorProps {
    value?: string; // provider account ID
    onValueChange: (accountId: string | null) => void;
}

/**
 * AuthProviderSelector — Read-only display of the currently active auth provider.
 *
 * Selection is handled by AuthProviderDialog (Option A pattern).
 * This component just shows which provider is active.
 */
export function AuthProviderSelector({ value }: AuthProviderSelectorProps) {
    const { data: allProviders = [], isLoading } = useEdgeProviders();

    // Find the selected provider
    const selectedProvider = React.useMemo(
        () => allProviders.find((p: any) => p.id === value),
        [allProviders, value]
    );

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading auth provider...
            </div>
        );
    }

    if (!value || !selectedProvider) {
        return (
            <div className="space-y-2">
                <Label className="text-sm font-medium">Auth Provider</Label>
                <Alert className="py-2 bg-slate-50">
                    <AlertCircle className="h-4 w-4 text-slate-500" />
                    <AlertDescription className="text-xs text-slate-600">
                        No auth provider configured. Use the <strong>Configure Auth</strong> button above to select one.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    const config = PROVIDER_CONFIGS[selectedProvider.provider];
    const Icon = PROVIDER_ICONS[selectedProvider.provider];

    return (
        <div className="space-y-2">
            <Label className="text-sm font-medium">Auth Provider</Label>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                {Icon && <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium text-sm truncate">{selectedProvider.name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                        {config?.label || selectedProvider.provider}
                    </Badge>
                </div>
                <Badge variant="outline" className="text-[10px] h-5 bg-green-50 text-green-700 border-green-200 gap-1 font-normal flex-shrink-0">
                    <ShieldCheck className="h-3 w-3" />
                    Connected
                </Badge>
            </div>
        </div>
    );
}
