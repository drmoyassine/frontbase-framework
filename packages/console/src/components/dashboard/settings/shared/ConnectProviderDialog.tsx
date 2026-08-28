/**
 * ConnectProviderDialog — Reusable stacked modal for connecting a provider account.
 *
 * Can be used as:
 * 1. Standalone (from Accounts tab) with provider dropdown
 * 2. Scoped to a single provider (from AccountResourcePicker / Edge forms)
 *
 * Architecture:
 *   - useConnectProvider.ts    — All shared state, test-connection, generic save
 *   - SupabaseDiscovery.tsx    — Post-test project picker
 *   - NeonDiscovery.tsx        — Post-test org → project picker
 *   - Turso save flow          — Inline (find-or-create + add DB) — small enough
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle, CheckCircle2, Cloud, Loader2,
    Shield, XCircle, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { API_BASE, CAPABILITY_LABELS } from './edgeConstants';
import type { ProviderCapability } from './edgeConstants';
import { useConnectProvider } from './connect-dialog/useConnectProvider';
import { SupabaseDiscovery } from './connect-dialog/SupabaseDiscovery';
import { NeonDiscovery } from './connect-dialog/NeonDiscovery';

// ============================================================================
// Props
// ============================================================================

interface ConnectProviderDialogProps {
    provider?: string;
    allowedProviders?: string[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConnected?: (accountId: string) => void;
    hideDisplayName?: boolean;
    editProvider?: { id: string; name: string; provider: string } | null;
}

// ============================================================================
// Component
// ============================================================================

export const ConnectProviderDialog: React.FC<ConnectProviderDialogProps> = ({
    provider: lockedProvider,
    allowedProviders,
    open,
    onOpenChange,
    onConnected,
    hideDisplayName,
    editProvider,
}) => {
    const effectiveLockedProvider = editProvider?.provider || lockedProvider;
    const queryClient = useQueryClient();
    const state = useConnectProvider(effectiveLockedProvider, open, editProvider);
    const {
        providers, refetch,
        providerType, effectiveProvider, currentConfig, visibleProviders,
        handleProviderChange,
        name, setName,
        credFields, setCredFields,
        requiredFieldsFilled,
        isTesting, testResult,
        handleTestConnection,
        isConnecting, setIsConnecting,
        error, setError,
        handleGenericSave,
        resetForm,
    } = state;

    // ── Provider-specific discovery state ────────────────────────────────
    // Supabase
    const [discoveredProjects, setDiscoveredProjects] = useState<{ ref: string; name: string; region: string; status: string }[]>([]);
    const [selectedProjectRef, setSelectedProjectRef] = useState('');

    // Neon
    const [neonOrgs, setNeonOrgs] = useState<{ id: string; name: string }[]>([]);
    const [selectedNeonOrg, setSelectedNeonOrg] = useState('');
    const [selectedNeonProject, setSelectedNeonProject] = useState('');

    // Reset discovery state
    const resetDiscovery = useCallback(() => {
        setDiscoveredProjects([]);
        setSelectedProjectRef('');
        setNeonOrgs([]);
        setSelectedNeonOrg('');
        setSelectedNeonProject('');
    }, []);

    // ── Test + discover ─────────────────────────────────────────────────
    const handleTestAndDiscover = useCallback(async () => {
        resetDiscovery();
        const result = await handleTestConnection();
        if (!result?.success) return;

        // Supabase: populate project picker
        if (result.projects && result.projects.length > 0) {
            setDiscoveredProjects(result.projects);
            setSelectedProjectRef(result.projects[0].ref);
            setName(result.projects[0].name);
        }

        // Turso: auto-name from db_name
        if (effectiveProvider === 'turso' && result.db_name) {
            setName(result.db_name);
            setCredFields(prev => ({ ...prev, _db_name: result.db_name! }));
        }

        // Neon: populate org picker
        if (result.neon_orgs && result.neon_orgs.length > 0) {
            setNeonOrgs(result.neon_orgs);
            const firstOrg = result.neon_orgs[0];
            setSelectedNeonOrg(firstOrg.id);
            setName(firstOrg.name);
        }
    }, [handleTestConnection, resetDiscovery, effectiveProvider, setName, setCredFields]);

    // ── Save with provider-specific logic ────────────────────────────────
    const handleSave = useCallback(async () => {
        setIsConnecting(true);
        setError(null);
        try {
            let newAccountId: string;

            if (effectiveProvider === 'turso') {
                // Turso: find existing or create new, then add the DB entry
                const existingTurso = providers.find(p => p.provider === 'turso');
                newAccountId = existingTurso
                    ? existingTurso.id
                    : (await edgeInfrastructureApi.createProvider({
                        name,
                        provider: 'turso',
                        provider_credentials: { databases: [] },
                        is_active: true,
                    })).id;
                const dbName = credFields._db_name || credFields.db_url?.replace('libsql://', '').split('.')[0] || 'Database';
                const addRes = await fetch(`${API_BASE}/api/edge-providers/${newAccountId}/turso-databases`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: dbName,
                        url: credFields.db_url,
                        token: credFields.db_token,
                    }),
                });
                if (addRes.status === 409) {
                    const errData = await addRes.json();
                    setError(errData.detail || 'Database already exists');
                    setIsConnecting(false);
                    return;
                }
            } else {
                // Standard providers — append discovery selections
                let extraCreds: Record<string, string> = {};
                if (effectiveProvider === 'supabase' && selectedProjectRef) {
                    extraCreds = { project_ref: selectedProjectRef };
                } else if (effectiveProvider === 'neon' && selectedNeonOrg) {
                    extraCreds = { org_id: selectedNeonOrg, project_id: selectedNeonProject };
                }
                newAccountId = await handleGenericSave(extraCreds);
            }

            // Invalidate the shared cache so ALL observers (including parent
            // AccountResourcePicker) re-fetch immediately, bypassing staleTime.
            await queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
            resetForm();
            resetDiscovery();
            onOpenChange(false);
            onConnected?.(newAccountId!);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsConnecting(false);
        }
    }, [
        effectiveProvider, providers, name, credFields,
        selectedProjectRef, selectedNeonOrg, selectedNeonProject,
        handleGenericSave, refetch, resetForm, resetDiscovery,
        onOpenChange, onConnected, setIsConnecting, setError,
    ]);

    // Filter visible providers
    const filteredProviders = allowedProviders
        ? visibleProviders.filter(([key]) => allowedProviders.includes(key))
        : visibleProviders;

    // ── Render ───────────────────────────────────────────────────────────
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForm(); resetDiscovery(); } onOpenChange(o); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {editProvider
                            ? `Edit ${currentConfig.label} Account`
                            : lockedProvider
                                ? `Connect ${currentConfig.label}`
                                : 'Connect Edge Provider'}
                    </DialogTitle>
                    <DialogDescription>
                        {editProvider
                            ? `Update credentials or display name for this ${currentConfig.label} connection.`
                            : lockedProvider
                                ? `Add your ${currentConfig.label} credentials.`
                                : 'Authorize Frontbase to deploy workers on your behalf.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider selector — hidden when locked or editing */}
                    {!lockedProvider && !editProvider && (
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <Select value={providerType} onValueChange={(val) => { handleProviderChange(val); resetDiscovery(); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {filteredProviders.map(([key, cfg]) => (
                                        <SelectItem key={key} value={key}>
                                            <span className="flex items-center gap-2">
                                                <span>{cfg.label}</span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {cfg.capabilities
                                                        ?.map(c => CAPABILITY_LABELS[c as ProviderCapability] || c)
                                                        .join(' · ')}
                                                </span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {!hideDisplayName && effectiveProvider !== 'turso' && (
                        <div className="space-y-2">
                            <Label>Display Name</Label>
                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Prod Account" />
                        </div>
                    )}

                    {currentConfig.fields.map(field => (
                        <div key={field.key} className="space-y-2">
                            <Label>{field.label}{!editProvider && field.required && ' *'}</Label>
                            <Input
                                type={field.type || 'text'}
                                value={credFields[field.key] || ''}
                                onChange={e => setCredFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                                placeholder={editProvider ? `Leave blank to keep current ${field.label.toLowerCase()}` : field.placeholder}
                            />
                        </div>
                    ))}

                    {/* WordPress API mode toggle */}
                    {effectiveProvider === 'wordpress_rest' && (
                        <div className="space-y-2">
                            <Label>API Mode</Label>
                            <Select
                                value={credFields.api_mode || 'rest'}
                                onValueChange={(val) => setCredFields(prev => ({ ...prev, api_mode: val }))}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="rest">REST API</SelectItem>
                                    <SelectItem value="graphql">GraphQL (requires WPGraphQL plugin)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {currentConfig.helpText && (
                        <p className="text-xs text-muted-foreground flex items-center mt-1">
                            <Shield className="w-3 h-3 mr-1" />
                            {currentConfig.helpText}
                        </p>
                    )}
                </div>

                {/* Test result */}
                {testResult && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${testResult.success
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400'
                        }`}>
                        {testResult.success
                            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            : <XCircle className="w-4 h-4 flex-shrink-0" />
                        }
                        <span>{testResult.detail}</span>
                    </div>
                )}

                {/* ─── Discovery Slot: Supabase ─── */}
                {effectiveProvider === 'supabase' && (
                    <SupabaseDiscovery
                        testResult={testResult}
                        discoveredProjects={discoveredProjects}
                        selectedProjectRef={selectedProjectRef}
                        onProjectChange={(ref, projectName) => {
                            setSelectedProjectRef(ref);
                            if (projectName) setName(projectName);
                        }}
                    />
                )}

                {/* ─── Discovery Slot: Neon ─── */}
                {effectiveProvider === 'neon' && (
                    <NeonDiscovery
                        neonOrgs={neonOrgs}
                        credFields={credFields}
                        selectedNeonOrg={selectedNeonOrg}
                        selectedNeonProject={selectedNeonProject}
                        onOrgChange={(orgId, orgName) => {
                            setSelectedNeonOrg(orgId);
                            setSelectedNeonProject('');
                            if (orgName) setName(orgName);
                        }}
                        onProjectChange={(projectId, projectName) => {
                            setSelectedNeonProject(projectId);
                            if (projectName) setName(projectName);
                        }}
                    />
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        variant="outline"
                        onClick={handleTestAndDiscover}
                        disabled={!requiredFieldsFilled || isTesting}
                    >
                        {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                        Test Connection
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={editProvider
                            ? isConnecting
                            : (!testResult?.success || isConnecting || (effectiveProvider === 'neon' && !selectedNeonProject))}
                    >
                        {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
                        {editProvider
                            ? 'Save Changes'
                            : effectiveProvider === 'turso' ? 'Add Database' : 'Save Connection'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
