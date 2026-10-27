/**
 * EdgeDatabaseDialog — Create/Edit dialog for edge database connections.
 *
 * Extracted from EdgeDatabasesForm.tsx for single-responsibility compliance.
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
import { Plus, Loader2, Check, Zap, AlertTriangle, Layers } from 'lucide-react';
import { AccountResourcePicker, DiscoveredResource } from './AccountResourcePicker';
import { PROVIDER_ICONS, DB_PROVIDER_OPTIONS } from './edgeConstants';

interface EdgeDatabaseDialogProps {
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
    formIsDefault: boolean;
    setFormIsDefault: (v: boolean) => void;
    isSaving: boolean;
    testingId: string | null;

    // PG schema fields
    formSchemaName: string | null;
    setFormSchemaName: (v: string | null) => void;
    discoveredSchemas: any[];
    setDiscoveredSchemas: (v: any[]) => void;
    isDiscoveringSchemas: boolean;
    setIsDiscoveringSchemas: (v: boolean) => void;
    schemaDiscoverError: string | null;
    setSchemaDiscoverError: (v: string | null) => void;
    showCreateSchema: boolean;
    setShowCreateSchema: (v: boolean) => void;
    createSchemaSuffix: string;
    setCreateSchemaSuffix: (v: string) => void;
    isCreatingSchema: boolean;
    setIsCreatingSchema: (v: boolean) => void;
    formRoleName: string | null;
    setFormRoleName: (v: string | null) => void;
    formRolePassword: string | null;
    setFormRolePassword: (v: string | null) => void;

    // Handlers
    openCreate: () => void;
    resetForm: () => void;
    handleSave: () => void;
    handleTestInline: () => void;
    
    // Account link
    formAccountId: string | null;
    setFormAccountId: (v: string | null) => void;
    
    databases?: any[];
    trigger?: React.ReactNode;
}

export const EdgeDatabaseDialog: React.FC<EdgeDatabaseDialogProps> = ({
    dialogOpen, setDialogOpen, editingId, error, setError,
    selectedProvider, setSelectedProvider,
    formName, setFormName, formUrl, setFormUrl,
    formToken, setFormToken, formIsDefault, setFormIsDefault,
    isSaving, testingId,
    formSchemaName, setFormSchemaName,
    discoveredSchemas, setDiscoveredSchemas,
    isDiscoveringSchemas, setIsDiscoveringSchemas,
    schemaDiscoverError, setSchemaDiscoverError,
    showCreateSchema, setShowCreateSchema,
    createSchemaSuffix, setCreateSchemaSuffix,
    isCreatingSchema, setIsCreatingSchema,
    formRoleName, setFormRoleName,
    formRolePassword, setFormRolePassword,
    openCreate, resetForm, handleSave, handleTestInline,
    formAccountId, setFormAccountId,
    databases = [],
    trigger,
}) => {
    const API_BASE = '';
    
    return (
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button size="sm" onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-2" /> Connect Database
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit Database' : 'Connect Edge Database'}</DialogTitle>
                    <DialogDescription>
                        {editingId
                            ? 'Update your database connection settings.'
                            : 'Add a database connection for your edge deployments.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider buttons — derived from EDGE_DATABASE_PROVIDERS registry */}
                    {!editingId && (
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {DB_PROVIDER_OPTIONS.map(opt => {
                                    const Icon = opt.icon;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            disabled={!opt.active}
                                            onClick={() => { opt.active && setSelectedProvider(opt.value); setFormAccountId(null); setFormUrl(''); setFormToken(''); setFormName(''); }}
                                            className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors text-left
                                                ${!opt.active
                                                    ? 'border-border opacity-50 cursor-not-allowed'
                                                    : selectedProvider === opt.value
                                                        ? 'border-primary bg-primary/5 text-primary'
                                                        : 'border-border hover:bg-accent'
                                                }`}
                                        >
                                            <Icon className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{opt.label}</span>
                                            {!opt.active && (
                                                <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Soon</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Account resource picker — PRIMARY for active providers */}
                    {(() => {
                        const prov = DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider);
                        if (!prov?.active || !prov.accountProvider || editingId) return null;
                        return (
                            <AccountResourcePicker
                                key={selectedProvider}
                                compatibleProviders={[prov.accountProvider]}
                                resourceTypeFilter={prov.resourceTypeFilter}
                                label={`Select ${prov.label} Database`}
                                existingUrls={
                                    ['supabase', 'neon', 'postgres'].includes(selectedProvider)
                                        ? []
                                        : databases.map((d: any) => d.db_url).filter(Boolean)
                                }
                                autoSelectSingle
                                resourceLabel="Select Database"
                                hideConnectDisplayName={!prov.createResourceType}
                                createResourceType={prov.createResourceType}
                                onResourceSelected={(resource: DiscoveredResource, accountId: string) => {
                                    setFormAccountId(accountId);
                                    const url = resource.connection_uri || resource.db_url
                                        || (resource.hostname ? `libsql://${resource.hostname}` : '')
                                        || resource.id || '';
                                    if (url) setFormUrl(url);
                                    if ((resource as any).token) setFormToken((resource as any).token);
                                    if (!formName) setFormName(resource.name || '');
                                    
                                    if (['supabase', 'neon', 'postgres'].includes(selectedProvider) && url) {
                                        setIsDiscoveringSchemas(true);
                                        setSchemaDiscoverError(null);
                                        fetch(`${API_BASE}/api/edge-databases/discover-schemas`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ db_url: url, provider: selectedProvider, provider_account_id: accountId }),
                                        })
                                            .then(r => r.json())
                                            .then(data => {
                                                if (data.schemas) {
                                                    setDiscoveredSchemas(data.schemas);
                                                } else {
                                                    setSchemaDiscoverError(data.detail || 'Could not discover schemas');
                                                }
                                            })
                                            .catch(e => setSchemaDiscoverError(e.message))
                                            .finally(() => setIsDiscoveringSchemas(false));
                                    }
                                }}
                                onClear={() => {
                                    setFormAccountId(null);
                                    setFormUrl('');
                                    setFormToken('');
                                }}
                            />
                        );
                    })()}

                    {/* PG Schema Picker — shown for PG-based providers after resource is picked */}
                    {formAccountId && ['supabase', 'neon', 'postgres'].includes(selectedProvider) && !editingId && (
                        <div className="space-y-2">
                            <Label className="text-sm flex items-center gap-1.5">
                                <Layers className="h-3.5 w-3.5" />
                                State Schema
                            </Label>
                            {isDiscoveringSchemas ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Discovering schemas...
                                </div>
                            ) : (
                                <>
                                    <select
                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={formSchemaName || ''}
                                        onChange={(e) => {
                                            if (e.target.value === '__create_new__') {
                                                setShowCreateSchema(true);
                                                setCreateSchemaSuffix('');
                                            } else {
                                                setFormSchemaName(e.target.value || null);
                                                if (e.target.value && selectedProvider === 'supabase' && formAccountId) {
                                                    (async () => {
                                                        try {
                                                            const res = await fetch(`${API_BASE}/api/edge-databases/reset-role-password`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ db_url: formUrl, schema_name: e.target.value, provider_account_id: formAccountId }),
                                                            });
                                                            const data = await res.json();
                                                            if (res.ok && data.role_name) {
                                                                setFormRoleName(data.role_name);
                                                                setFormRolePassword(data.role_password);
                                                            }
                                                        } catch { /* non-blocking */ }
                                                    })();
                                                } else {
                                                    setFormRoleName(null);
                                                    setFormRolePassword(null);
                                                }
                                                setShowCreateSchema(false);
                                            }
                                        }}
                                    >
                                        <option value="">Default (frontbase_edge)</option>
                                        {discoveredSchemas.map(s => (
                                            <option key={s.id} value={s.name}>{s.name}</option>
                                        ))}
                                        <option value="__create_new__">+ Create New Schema</option>
                                    </select>

                                    {showCreateSchema && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground whitespace-nowrap">frontbase_edge_</span>
                                            <Input
                                                placeholder="staging"
                                                value={createSchemaSuffix}
                                                onChange={e => setCreateSchemaSuffix(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                                className="flex-1"
                                            />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={!createSchemaSuffix || isCreatingSchema}
                                                onClick={async () => {
                                                    setIsCreatingSchema(true);
                                                    try {
                                                        const res = await fetch(`${API_BASE}/api/edge-databases/create-schema`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ db_url: formUrl, suffix: createSchemaSuffix, provider: selectedProvider, provider_account_id: formAccountId }),
                                                        });
                                                        const data = await res.json();
                                                        if (res.ok && data.schema_name) {
                                                            setFormSchemaName(data.schema_name);
                                                            if (data.role_name) setFormRoleName(data.role_name);
                                                            if (data.role_password) setFormRolePassword(data.role_password);
                                                            setDiscoveredSchemas(prev => [...prev, { id: data.schema_name, name: data.schema_name, has_role: !!data.role_name }]);
                                                            setShowCreateSchema(false);
                                                            setCreateSchemaSuffix('');
                                                        } else {
                                                            setError(data.detail || 'Failed to create schema');
                                                        }
                                                    } catch (e: any) {
                                                        setError(e.message);
                                                    } finally {
                                                        setIsCreatingSchema(false);
                                                    }
                                                }}
                                            >
                                                {isCreatingSchema ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create'}
                                            </Button>
                                        </div>
                                    )}

                                    {formSchemaName && (
                                        <p className="text-xs text-muted-foreground">
                                            All edge state will be stored in the <code>{formSchemaName}</code> PostgreSQL schema.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Auto-discovered summary — show when resource picked from account */}
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
                                    placeholder={`e.g. Production ${selectedProvider?.charAt(0).toUpperCase()}${selectedProvider?.slice(1) || ''}`}
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Manual fields — only for inactive providers or edit mode */}
                    {(!DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.active || editingId) && !formAccountId && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label>Name</Label>
                                    <Input
                                        placeholder={`e.g. Production ${selectedProvider?.charAt(0).toUpperCase()}${selectedProvider?.slice(1) || ''}`}
                                        value={formName}
                                        onChange={e => setFormName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Database URL</Label>
                                    <Input
                                        placeholder={DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.placeholder}
                                        value={formUrl}
                                        onChange={e => setFormUrl(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label>Auth Token</Label>
                                <Input
                                    type="password"
                                    placeholder={editingId ? '(leave blank to keep existing)' : 'Database auth token'}
                                    value={formToken}
                                    onChange={e => setFormToken(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-db-default"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-db-default" className="text-sm cursor-pointer">
                            Set as default database
                        </Label>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="outline"
                        onClick={handleTestInline}
                        disabled={(!formUrl && !formAccountId) || testingId === 'inline'}
                    >
                        {testingId === 'inline' ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</>
                        ) : (
                            <><Zap className="mr-2 h-4 w-4" /> Test Connection</>
                        )}
                    </Button>
                    <Button onClick={handleSave} disabled={!formName || (!formUrl && !formAccountId) || isSaving}>
                        {isSaving ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                        ) : (
                            <><Check className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Add Database'}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
