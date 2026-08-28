/**
 * WizardProviderStep — Step 1: Select provider account.
 *
 * Includes a "+ Connect New" option that opens ConnectProviderDialog
 * inline, then auto-selects the newly connected provider.
 */

import { useState, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { ConnectProviderDialog } from '../ConnectProviderDialog';
import { GPU_CAPABLE_PROVIDERS, KNOWN_EDGE_PROVIDERS } from '../edgeConstants';
import type { DeployWizardState } from './useDeployWizard';

const CONNECT_NEW_VALUE = '__connect_new__';

export function WizardProviderStep({ filteredProviders, selectedProviderId, setSelectedProviderId, computeType }: DeployWizardState) {
    const [connectOpen, setConnectOpen] = useState(false);

    // When GPU is selected, only allow connecting GPU-capable providers
    const connectAllowedProviders = useMemo(
        () => computeType === 'gpu'
            ? [...GPU_CAPABLE_PROVIDERS]
            : [...KNOWN_EDGE_PROVIDERS],
        [computeType]
    );

    const handleValueChange = useCallback((value: string) => {
        if (value === CONNECT_NEW_VALUE) {
            setConnectOpen(true);
        } else {
            setSelectedProviderId(value);
        }
    }, [setSelectedProviderId]);

    const handleProviderConnected = useCallback((accountId: string) => {
        setConnectOpen(false);
        // Auto-select the newly connected provider after react-query refetch
        setTimeout(() => setSelectedProviderId(accountId), 300);
    }, [setSelectedProviderId]);

    return (
        <div className="space-y-2">
            <Label>Provider Account</Label>
            <Select value={selectedProviderId} onValueChange={handleValueChange}>
                <SelectTrigger><SelectValue placeholder="Select a provider..." /></SelectTrigger>
                <SelectContent>
                    {filteredProviders.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                            {p.name} <span className="text-xs text-muted-foreground ml-1">({p.provider})</span>
                        </SelectItem>
                    ))}
                    {filteredProviders.length > 0 && <SelectSeparator />}
                    <SelectItem value={CONNECT_NEW_VALUE} className="text-primary font-medium">
                        <span className="flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" /> Connect New Provider
                        </span>
                    </SelectItem>
                </SelectContent>
            </Select>

            <ConnectProviderDialog
                open={connectOpen}
                onOpenChange={setConnectOpen}
                allowedProviders={connectAllowedProviders}
                onConnected={handleProviderConnected}
            />
        </div>
    );
}

