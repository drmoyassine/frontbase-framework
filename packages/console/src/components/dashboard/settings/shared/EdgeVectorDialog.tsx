/**
 * EdgeVectorDialog — Create/Edit dialog for edge vector stores.
 */

import React, { useState, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Loader2, Check, Zap, AlertTriangle, Database } from 'lucide-react';
import { EDGE_VECTOR_PROVIDERS } from '@/components/dashboard/settings/shared/edgeConstants';
import { AccountResourcePicker, DiscoveredResource } from './AccountResourcePicker';
import { PROVIDER_ICONS } from './edgeConstants';

interface EdgeVectorDialogProps {
    dialogOpen: boolean;
    setDialogOpen: (open: boolean) => void;
    editingId: string | null;
    error: string | null;
    // Form fields
    selectedProvider: string;
    setSelectedProvider: (v: string) => void;
    formName: string;
    setFormName: (v: string) => void;
    formUrl: string;
    setFormUrl: (v: string) => void;
    formToken: string;
    setFormToken: (v: string) => void;
    formIsDefault: boolean;
    setFormIsDefault: (v: boolean) => void;
    isSaving: boolean;
    testingId: string | null;
    // Handlers
    openCreate: () => void;
    resetForm: () => void;
    handleSave: () => void;
    handleTestInline: () => void;
    // Account link (optional)
    formAccountId?: string | null;
    setFormAccountId?: (v: string | null) => void;
    /** Provider-specific, non-secret config (dimensions, metric, table name, …) */
    formProviderConfig?: Record<string, any>;
    setFormProviderConfig?: (v: Record<string, any>) => void;
    /** URLs already imported — for duplicate prevention */
    existingUrls?: string[];
}

export const EdgeVectorDialog: React.FC<EdgeVectorDialogProps> = ({
    dialogOpen, setDialogOpen, editingId, error,
    selectedProvider, setSelectedProvider,
    formName, setFormName, formUrl, setFormUrl,
    formToken, setFormToken, formIsDefault, setFormIsDefault,
    isSaving, testingId, openCreate, resetForm,
    handleSave, handleTestInline,
    formAccountId, setFormAccountId,
    formProviderConfig = {},
    setFormProviderConfig,
    existingUrls = [],
}) => {
    // State for provider switch confirmation
    const [pendingProvider, setPendingProvider] = useState<string | null>(null);
    const [showConfirmSwitch, setShowConfirmSwitch] = useState(false);

    // Check if form has unsaved content
    const hasUnsavedContent = useCallback(() => {
        return !editingId && (formName.trim() !== '' || formUrl.trim() !== '' || formToken.trim() !== '');
    }, [editingId, formName, formUrl, formToken]);

    // Handle provider selection with confirmation if needed
    const handleProviderSelect = useCallback((provider: string) => {
        const providerConfig = EDGE_VECTOR_PROVIDERS.find(p => p.value === provider);
        if (!providerConfig?.active) return;

        // Check if we need confirmation
        if (hasUnsavedContent() && !editingId) {
            setPendingProvider(provider);
            setShowConfirmSwitch(true);
        } else {
            // Safe to proceed - form is empty or we're editing
            setSelectedProvider(provider);
            if (setFormAccountId) setFormAccountId(null);
            if (setFormProviderConfig) setFormProviderConfig({});
            setFormUrl('');
            setFormToken('');
            setFormName('');
        }
    }, [hasUnsavedContent, editingId, setSelectedProvider, setFormAccountId, setFormProviderConfig]);

    // Confirm provider switch
    const confirmProviderSwitch = useCallback(() => {
        if (pendingProvider) {
            setSelectedProvider(pendingProvider);
            if (setFormAccountId) setFormAccountId(null);
            if (setFormProviderConfig) setFormProviderConfig({});
            setFormUrl('');
            setFormToken('');
            setFormName('');
        }
        setPendingProvider(null);
        setShowConfirmSwitch(false);
    }, [pendingProvider, setSelectedProvider, setFormAccountId, setFormProviderConfig]);

    // Cancel provider switch
    const cancelProviderSwitch = useCallback(() => {
        setPendingProvider(null);
        setShowConfirmSwitch(false);
    }, []);

    return (
        <>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
            <DialogTrigger asChild>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-2" /> Connect Vector DB
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit Vector Store' : 'Connect Edge Vector DB'}</DialogTitle>
                    <DialogDescription>
                        {editingId
                            ? 'Update your vector database connection settings.'
                            : 'Add a new vector database connection for your edge deployments.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider selector — derived from EDGE_VECTOR_PROVIDERS registry.
                        System/auto-provisioned providers (e.g. embedded_lancedb) are
                        hidden from the connect modal — they're seeded by the backend,
                        so users never pick them manually. */}
                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {EDGE_VECTOR_PROVIDERS.filter(opt => !opt.hiddenFromConnectModal).map(opt => {
                                const Icon = opt.icon || Database;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => handleProviderSelect(opt.value)}
                                        disabled={!opt.active}
                                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors text-left relative
                                            ${selectedProvider === opt.value
                                                ? 'border-primary bg-primary/5 text-primary'
                                                : opt.active
                                                    ? 'border-border hover:bg-accent'
                                                    : 'border-border opacity-50 cursor-not-allowed'
                                            }`}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{opt.label}</span>
                                        {opt.platformLock && (
                                            <Badge variant="outline" className="text-[10px] ml-auto px-1.5 py-0 border-amber-400 text-amber-500">{opt.platformLock} only</Badge>
                                        )}
                                        {!opt.active && (
                                            <Badge variant="outline" className="text-[10px] ml-auto px-1.5 py-0">Soon</Badge>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Platform-lock compatibility warning */}
                        {(() => {
                            const prov = EDGE_VECTOR_PROVIDERS.find(p => p.value === selectedProvider);
                            if (!prov?.platformLock || !prov.compatHint) return null;
                            return (
                                <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                    <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                                        {prov.compatHint}
                                    </AlertDescription>
                                </Alert>
                            );
                        })()}
                    </div>

                    {/* Account resource picker — PRIMARY for active providers */}
                    {(() => {
                        const prov = EDGE_VECTOR_PROVIDERS.find(p => p.value === selectedProvider);
                        if (!prov?.active || !prov.accountProvider || editingId || !setFormAccountId) return null;
                        return (
                            <AccountResourcePicker
                                key={selectedProvider}
                                compatibleProviders={[prov.accountProvider]}
                                resourceTypeFilter={prov.resourceTypeFilter}
                                createResourceType={prov.createResourceType}
                                label={`Select ${prov.label}`}
                                existingUrls={existingUrls}
                                autoSelectSingle
                                hideConnectDisplayName={!prov.createResourceType}
                                onResourceSelected={(resource: DiscoveredResource, accountId: string) => {
                                    setFormAccountId(accountId);
                                    
                                    // For vectorize, URL isn't natively returned from discovery except as the ID
                                    const url = (resource as any).url
                                        || resource.db_url
                                        || (resource.endpoint ? `https://${resource.endpoint}` : '')
                                        || resource.id || '';
                                        
                                    if (url) setFormUrl(url);
                                    if (resource.rest_token) setFormToken(resource.rest_token);
                                    else if ((resource as any).token) setFormToken((resource as any).token);
                                    
                                    if (!formName) setFormName(resource.name || '');
                                }}
                                onClear={() => {
                                    setFormAccountId(null);
                                    setFormUrl('');
                                    setFormToken('');
                                }}
                            />
                        );
                    })()}

                    {/* Auto-discovered summary — show when account picked */}
                    {formAccountId && (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
                                <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                                    <Check className="h-4 w-4" />
                                    Credentials auto-filled from connected account
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">URL and auth token are configured automatically.</p>
                            </div>
                            <div className="space-y-1">
                                <Label>Connection Name</Label>
                                <Input
                                    placeholder="e.g. Production pgvector"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                    
                    {/* Manual Form (Hidden if auto-discovered and account picked) */}
                    {(!formAccountId || editingId) && (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label>Connection Name</Label>
                                <Input
                                    placeholder="e.g. Production Vector Store"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                />
                            </div>

                            <div className="space-y-1">
                                <Label>{
                                    selectedProvider === 'pgvector' ? 'Postgres DSN (Connection String)' :
                                    selectedProvider === 'cloudflare_vectorize' ? 'Vectorize Index Name' :
                                    selectedProvider === 'embedded_lancedb' ? 'Data Directory' :
                                    'Connection URL'
                                }</Label>
                                <Input
                                    placeholder={
                                        selectedProvider === 'pgvector' ? 'postgresql://user:pass@host:5432/db' : 
                                        selectedProvider === 'cloudflare_vectorize' ? 'my-vector-index' :
                                        selectedProvider === 'embedded_lancedb' ? '/app/data/lancedb' :
                                        'https://vector-db.example.com'
                                    }
                                    value={formUrl}
                                    onChange={e => setFormUrl(e.target.value)}
                                />
                            </div>

                            {selectedProvider !== 'pgvector' && selectedProvider !== 'embedded_lancedb' && (
                                <div className="space-y-1">
                                    <Label>Auth Token / Key (Optional)</Label>
                                    <Input
                                        type="password"
                                        placeholder="Enter authorization credentials"
                                        value={formToken}
                                        onChange={e => setFormToken(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Provider-specific configuration (dimensions, metric, table name) */}
                    {(() => {
                        if (!setFormProviderConfig) return null;
                        const prov = EDGE_VECTOR_PROVIDERS.find(p => p.value === selectedProvider);
                        const cfg = formProviderConfig || {};
                        const setKey = (k: string, v: string) => setFormProviderConfig({ ...cfg, [k]: v });

                        if (prov?.value === 'cloudflare_vectorize') {
                            return (
                                <div className="space-y-3 p-3 rounded-lg border bg-muted/40">
                                    <Label className="text-sm font-semibold">Vectorize Configuration</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Dimensions (optional)</Label>
                                            <Input
                                                type="number"
                                                placeholder="Auto-detected"
                                                value={cfg.dimensions != null ? String(cfg.dimensions) : ''}
                                                onChange={e => setKey('dimensions', e.target.value)}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Metric (optional)</Label>
                                            <select
                                                value={cfg.metric != null ? String(cfg.metric) : ''}
                                                onChange={e => setKey('metric', e.target.value)}
                                                className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                            >
                                                <option value="">Auto-detected</option>
                                                <option value="cosine">Cosine</option>
                                                <option value="euclidean">Euclidean</option>
                                                <option value="dotproduct">Dot Product</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        if (prov?.value === 'pgvector') {
                            return (
                                <div className="space-y-2 p-3 rounded-lg border bg-muted/40">
                                    <Label className="text-sm font-semibold">pgvector Configuration</Label>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Table name (optional)</Label>
                                        <Input
                                            placeholder="documents"
                                            value={cfg.table_name != null ? String(cfg.table_name) : ''}
                                            onChange={e => setKey('table_name', e.target.value)}
                                            className="h-8"
                                        />
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    {/* Default toggle */}
                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-vector-default-modal"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-vector-default-modal" className="cursor-pointer text-sm">
                            Set as default vector store
                        </Label>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestInline}
                        disabled={testingId === 'inline' || !formUrl}
                        className="gap-2"
                    >
                        {testingId === 'inline' ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Testing...
                            </>
                        ) : (
                            <>
                                <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
                                Test Connection
                            </>
                        )}
                    </Button>

                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || !formName || !formUrl}
                        className="gap-2"
                    >
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {editingId ? 'Save Changes' : 'Connect Store'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Provider Switch Confirmation Dialog */}
        <AlertDialog open={showConfirmSwitch} onOpenChange={setShowConfirmSwitch}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Clear unsaved changes?</AlertDialogTitle>
                    <AlertDialogDescription>
                        You have unsaved changes in this form. Switching providers will clear all entered data. Do you want to continue?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={cancelProviderSwitch}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmProviderSwitch}>
                        Switch & Clear
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
};
