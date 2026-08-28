import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import { Bot, Plus, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConnectProviderDialog } from '../dashboard/settings/shared/ConnectProviderDialog';
import { GPU_CAPABLE_PROVIDERS } from '../dashboard/settings/shared/edgeConstants';

const CONNECT_NEW_VALUE = '__connect_new__';

interface WorkspaceAgentSetupProps {
    onSetupComplete: () => void;
}

export function WorkspaceAgentSetup({ onSetupComplete }: WorkspaceAgentSetupProps) {
    const queryClient = useQueryClient();
    const [connectOpen, setConnectOpen] = useState(false);
    const [selectedProviderId, setSelectedProviderId] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);

    // Fetch existing providers
    const { data: providers = [], isLoading } = useQuery({
        queryKey: ['edge-providers'],
        queryFn: async () => {
            const res = await fetch('/api/edge-providers/');
            if (!res.ok) throw new Error('Network error');
            return res.json();
        },
        staleTime: STALE.STANDARD,
    });

    const gpuProviders = providers.filter((p: any) => GPU_CAPABLE_PROVIDERS.has(p.provider));

    const handleValueChange = (value: string) => {
        if (value === CONNECT_NEW_VALUE) {
            setConnectOpen(true);
        } else {
            setSelectedProviderId(value);
        }
    };

    const handleProviderConnected = (accountId: string) => {
        setConnectOpen(false);
        queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
        setTimeout(() => setSelectedProviderId(accountId), 300);
    };

    // Save choice to backend
    const handleSave = async () => {
        if (!selectedProviderId) return;
        setIsSaving(true);
        try {
            await fetch('/api/edge-providers/workspace-agent-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider_id: selectedProviderId })
            });
            // Invalidate the token query to trigger chat re-hydration
            queryClient.invalidateQueries({ queryKey: ['workspace-agent-token'] });
            onSetupComplete();
        } catch (error) {
            console.error('Failed to save LLM settings', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <Bot className="w-8 h-8 text-primary" />
            </div>
            
            <h3 className="text-lg font-semibold tracking-tight text-foreground mb-2">
                Configure Workspace LLM
            </h3>
            
            <p className="text-sm text-muted-foreground mb-8 max-w-sm">
                Your Workspace Agent needs an AI provider connection to operate. Select an existing one or connect a new key.
            </p>

            <div className="w-full max-w-sm space-y-4">
                <div className="text-left space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        AI Provider
                    </label>
                    <Select value={selectedProviderId} onValueChange={handleValueChange}>
                        <SelectTrigger className="w-full bg-background border-border">
                            <SelectValue placeholder={isLoading ? "Loading..." : "Select a provider..."} />
                        </SelectTrigger>
                        <SelectContent>
                            {gpuProviders.map((p: any) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name} <span className="text-xs text-muted-foreground ml-1">({p.provider})</span>
                                </SelectItem>
                            ))}
                            {gpuProviders.length > 0 && (
                                <div className="h-px bg-border my-1" />
                            )}
                            <SelectItem value={CONNECT_NEW_VALUE} className="text-primary font-medium focus:text-primary">
                                <span className="flex items-center gap-1">
                                    <Plus className="w-3.5 h-3.5" /> Connect New Provider
                                </span>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button 
                    className="w-full shadow-sm gap-2" 
                    disabled={!selectedProviderId || isLoading || isSaving}
                    onClick={handleSave}
                >
                    {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <>Complete Setup <ArrowRight className="w-4 h-4" /></>
                    )}
                </Button>
            </div>

            <ConnectProviderDialog
                open={connectOpen}
                onOpenChange={setConnectOpen}
                allowedProviders={Array.from(GPU_CAPABLE_PROVIDERS)}
                onConnected={handleProviderConnected}
            />
        </div>
    );
}
