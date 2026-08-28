/**
 * EdgeCacheDialog — Create/Edit dialog for edge cache connections.
 *
 * Extracted from EdgeCachesForm.tsx for single-responsibility compliance.
 */

import React from 'react';
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
import { Plus, Loader2, Check, Zap, AlertTriangle, Server } from 'lucide-react';
import { CACHE_PROVIDER_OPTIONS } from '@/hooks/useEdgeCacheForm';
import { AccountResourcePicker, DiscoveredResource } from './AccountResourcePicker';
import { PROVIDER_ICONS } from './edgeConstants';

// Icons come from centralized PROVIDER_ICONS in edgeConstants.tsx
// Fallback to Server icon for providers without a dedicated icon

interface EdgeCacheDialogProps {
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
    /** URLs already imported — for duplicate prevention */
    existingUrls?: string[];
}

export const EdgeCacheDialog: React.FC<EdgeCacheDialogProps> = ({
    dialogOpen, setDialogOpen, editingId, error,
    selectedProvider, setSelectedProvider,
    formName, setFormName, formUrl, setFormUrl,
    formToken, setFormToken, formIsDefault, setFormIsDefault,
    isSaving, testingId, openCreate, resetForm,
    handleSave, handleTestInline,
    formAccountId, setFormAccountId,
    existingUrls = [],
}) => {
    return (
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
            <DialogTrigger asChild>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-2" /> Connect Cache
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit Cache' : 'Connect Edge Cache'}</DialogTitle>
                    <DialogDescription>
                        {editingId
                            ? 'Update your cache connection settings.'
                            : 'Add a new cache connection for your edge deployments.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider selector — derived from EDGE_CACHE_PROVIDERS registry */}
                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {CACHE_PROVIDER_OPTIONS.map(opt => {
                                const Icon = PROVIDER_ICONS[opt.value] || Server;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => { opt.active && setSelectedProvider(opt.value); if (setFormAccountId) setFormAccountId(null); setFormUrl(''); setFormToken(''); setFormName(''); }}
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
                            const prov = CACHE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider);
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
                        const prov = CACHE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider);
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
                                    const url = (resource as any).cache_url
                                        || resource.rest_url
                                        || (resource.endpoint ? `https://${resource.endpoint}` : '')
                                        || resource.db_url || resource.id || '';
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
                                    placeholder="e.g. Production Redis"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Default toggle */}
                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-cache-default-modal"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-cache-default-modal" className="text-sm cursor-pointer">
                            Set as default cache
                        </Label>
                    </div>

                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={handleTestInline}
                        disabled={!formUrl || testingId === 'inline'}
                    >
                        {testingId === 'inline' ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</>
                        ) : (
                            <><Zap className="mr-2 h-4 w-4" /> Test Connection</>
                        )}
                    </Button>
                    <Button onClick={handleSave} disabled={!formName || !formUrl || isSaving}>
                        {isSaving ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                        ) : (
                            <><Check className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Add Cache'}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
