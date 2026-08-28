/**
 * EdgeQueueDialog — Create/Edit dialog for edge queue connections.
 *
 * Extracted from EdgeQueuesForm.tsx for single-responsibility compliance.
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
import { Plus, Loader2, Check, Zap, AlertTriangle } from 'lucide-react';
import { AccountResourcePicker, DiscoveredResource } from './AccountResourcePicker';
import { PROVIDER_ICONS, EDGE_QUEUE_PROVIDERS } from './edgeConstants';

const QUEUE_PROVIDER_OPTIONS = EDGE_QUEUE_PROVIDERS;

interface EdgeQueueDialogProps {
    dialogOpen: boolean;
    setDialogOpen: (open: boolean) => void;
    editingId: string | null;
    error: string | null;
    setError: (v: string | null) => void;

    // Form fields
    selectedProvider: string;
    setSelectedProvider: (v: string) => void;
    formName: string;
    setFormName: (v: string) => void;
    formUrl: string;
    setFormUrl: (v: string) => void;
    formToken: string;
    setFormToken: (v: string) => void;
    formSigningKey: string;
    setFormSigningKey: (v: string) => void;
    formNextSigningKey: string;
    setFormNextSigningKey: (v: string) => void;
    formIsDefault: boolean;
    setFormIsDefault: (v: boolean) => void;
    isSaving: boolean;
    testingId: string | null;

    // Handlers
    openCreate: () => void;
    resetForm: () => void;
    handleSave: () => void;
    handleTestInline: () => void;

    // Account link
    formAccountId: string | null;
    setFormAccountId: (v: string | null) => void;

    queues?: any[];
    trigger?: React.ReactNode;
}

export const EdgeQueueDialog: React.FC<EdgeQueueDialogProps> = ({
    dialogOpen, setDialogOpen, editingId, error, setError,
    selectedProvider, setSelectedProvider,
    formName, setFormName, formUrl, setFormUrl,
    formToken, setFormToken,
    formSigningKey, setFormSigningKey,
    formNextSigningKey, setFormNextSigningKey,
    formIsDefault, setFormIsDefault,
    isSaving, testingId,
    openCreate, resetForm, handleSave, handleTestInline,
    formAccountId, setFormAccountId,
    queues = [],
    trigger,
}) => {
    return (
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button size="sm" onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-2" /> Connect Queue
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit Queue' : 'Connect Edge Queue'}</DialogTitle>
                    <DialogDescription>
                        {editingId
                            ? 'Update your queue connection settings.'
                            : 'Add a message queue for durable workflow execution.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider selector — derived from EDGE_QUEUE_PROVIDERS registry */}
                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {QUEUE_PROVIDER_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => { opt.active && setSelectedProvider(opt.value); setFormAccountId(null); setFormUrl(''); setFormToken(''); setFormSigningKey(''); setFormNextSigningKey(''); setFormName(''); }}
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
                                        {!opt.active && (
                                            <Badge variant="outline" className="text-[10px] ml-auto px-1.5 py-0">Soon</Badge>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Account resource picker — PRIMARY for active providers */}
                    {(() => {
                        const prov = QUEUE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider);
                        if (!prov?.active || !prov.accountProvider || editingId) return null;
                        return (
                            <AccountResourcePicker
                                key={selectedProvider}
                                compatibleProviders={[prov.accountProvider]}
                                resourceTypeFilter={prov.resourceTypeFilter}
                                createResourceType={prov.createResourceType}
                                label={`Select ${prov.label}`}
                                existingUrls={queues.map((q: any) => q.queue_url).filter(Boolean)}
                                autoSelectSingle
                                hideConnectDisplayName={!prov.createResourceType}
                                onResourceSelected={(resource: DiscoveredResource, accountId: string) => {
                                    setFormAccountId(accountId);
                                    const url = (resource as any).queue_url || resource.endpoint || resource.rest_url || resource.db_url || resource.id || '';
                                    if (url) setFormUrl(url);
                                    if ((resource as any).token) setFormToken((resource as any).token);
                                    if ((resource as any).signing_key) setFormSigningKey((resource as any).signing_key);
                                    if ((resource as any).next_signing_key) setFormNextSigningKey((resource as any).next_signing_key);
                                    if (!formName) setFormName(resource.name || prov.label);
                                }}
                                onClear={() => {
                                    setFormAccountId(null);
                                    setFormUrl('');
                                    setFormToken('');
                                    setFormSigningKey('');
                                    setFormNextSigningKey('');
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
                                <p className="text-xs text-muted-foreground mt-1">URL, token, and signing keys are configured automatically.</p>
                            </div>
                            <div className="space-y-1">
                                <Label>Connection Name</Label>
                                <Input
                                    placeholder="e.g. Production QStash"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                    {/* Default toggle */}
                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-queue-default-modal"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-queue-default-modal" className="text-sm cursor-pointer">
                            Set as default queue
                        </Label>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="outline"
                        onClick={handleTestInline}
                        disabled={!(formUrl || (editingId && !formToken)) || testingId === 'inline'}
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
                            <><Check className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Add Queue'}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
