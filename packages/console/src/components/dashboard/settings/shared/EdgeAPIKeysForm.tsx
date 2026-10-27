/**
 * EdgeAPIKeysForm
 * 
 * CRUD management for tenant-facing API keys that secure /v1/* endpoints.
 * Follows the same UX pattern as EdgeCachesForm / EdgeQueuesForm.
 * Keys can be revealed anytime via Fernet decryption.
 */

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEdgeAPIKeys, useEdgeEngines, EdgeAPIKey } from '@/hooks/useEdgeInfrastructure';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
    Plus, Trash2, Loader2, Check, Key, Copy, Eye, EyeOff,
} from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const API_BASE = '';

interface EdgeAPIKeysFormProps {
    withCard?: boolean;
    /** If provided, pre-scope to this engine and filter list accordingly */
    engineId?: string;
}

export const EdgeAPIKeysForm: React.FC<EdgeAPIKeysFormProps> = ({ withCard = false, engineId }) => {
    const queryClient = useQueryClient();
    const { data: keys = [], isLoading } = useEdgeAPIKeys(engineId);
    const { data: engines = [] } = useEdgeEngines();

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [engineSel, setEngineSel] = useState<string>(engineId || 'all');

    // Created key reveal state
    const [revealedKey, setRevealedKey] = useState<string | null>(null);
    const [revealCopied, setRevealCopied] = useState(false);
    const [showKey, setShowKey] = useState(true);

    // Deleting state
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Per-row reveal state: { keyId: fullKeyString }
    const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
    const [revealingId, setRevealingId] = useState<string | null>(null);

    const resetForm = () => {
        setName('');
        setEngineSel(engineId || 'all');
        setRevealedKey(null);
        setRevealCopied(false);
        setShowKey(true);
    };

    const handleCreate = async () => {
        if (!name.trim()) return;
        setCreating(true);
        try {
            const res = await fetch(`${API_BASE}/api/edge-api-keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    edge_engine_id: engineSel === 'all' ? null : engineSel,
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to create API key');
            }
            const data = await res.json();
            setRevealedKey(data.key);
            queryClient.invalidateQueries({ queryKey: ['edge-api-keys'] });
            // Also invalidate engine-scoped query if applicable
            if (engineId) queryClient.invalidateQueries({ queryKey: ['edge-api-keys', engineId] });
            toast.success('API key created');
        } catch (err: any) {
            toast.error(err.message || 'Failed to create API key');
        } finally {
            setCreating(false);
        }
    };

    const handleToggleActive = async (key: EdgeAPIKey) => {
        try {
            const res = await fetch(`${API_BASE}/api/edge-api-keys/${key.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !key.is_active }),
            });
            if (!res.ok) throw new Error('Failed to update');
            queryClient.invalidateQueries({ queryKey: ['edge-api-keys'] });
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-api-keys/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            queryClient.invalidateQueries({ queryKey: ['edge-api-keys'] });
            toast.success('API key revoked');
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setDeletingId(null);
        }
    };

    const handleCopyKey = () => {
        if (revealedKey) {
            navigator.clipboard.writeText(revealedKey);
            setRevealCopied(true);
            setTimeout(() => setRevealCopied(false), 2000);
            toast.success('Copied to clipboard');
        }
    };

    const handleRevealKey = async (keyId: string) => {
        // Toggle off if already revealed
        if (revealedKeys[keyId]) {
            setRevealedKeys(prev => {
                const next = { ...prev };
                delete next[keyId];
                return next;
            });
            return;
        }
        setRevealingId(keyId);
        try {
            const res = await fetch(`${API_BASE}/api/edge-api-keys/${keyId}/reveal`);
            if (res.status === 410) {
                toast.error('Legacy key — cannot be revealed');
                return;
            }
            if (!res.ok) throw new Error('Failed to reveal key');
            const data = await res.json();
            setRevealedKeys(prev => ({ ...prev, [keyId]: data.key }));
        } catch (err: any) {
            toast.error(err.message || 'Failed to reveal key');
        } finally {
            setRevealingId(null);
        }
    };

    const handleCopyRevealedKey = (keyId: string) => {
        const fullKey = revealedKeys[keyId];
        if (fullKey) {
            navigator.clipboard.writeText(fullKey);
            toast.success('Copied to clipboard');
        }
    };

    const createKeyDialog = (
        <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
        }}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Create Key
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create API Key</DialogTitle>
                    <DialogDescription>
                        {revealedKey
                            ? 'Copy your API key now. You can also reveal it later from the key list.'
                            : 'Create a new API key for authenticating AI endpoint requests.'
                        }
                    </DialogDescription>
                </DialogHeader>

                {revealedKey ? (
                    /* Key reveal view */
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Your API Key</Label>
                            <div className="relative">
                                <Input
                                    readOnly
                                    value={showKey ? revealedKey : '•'.repeat(revealedKey.length)}
                                    className="pr-20 font-mono text-xs"
                                />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                                    <Button
                                        variant="ghost" size="icon" className="h-7 w-7"
                                        onClick={() => setShowKey(!showKey)}
                                    >
                                        {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button
                                        variant="ghost" size="icon" className="h-7 w-7"
                                        onClick={handleCopyKey}
                                    >
                                        {revealCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                💡 You can also reveal this key later from the key list.
                            </p>
                        </div>
                        <DialogFooter>
                            <Button onClick={() => { setDialogOpen(false); resetForm(); }}>
                                Done
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    /* Create form */
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Key Name</Label>
                            <Input
                                placeholder="e.g. Production, CI/CD, Development"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Assign to Engine</Label>
                            <Select value={engineSel} onValueChange={setEngineSel} disabled={!!engineId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Engines" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Engines</SelectItem>
                                    {engines.map((e: any) => (
                                        <SelectItem key={e.id} value={e.id}>
                                            {e.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Restrict this key to a specific engine, or allow it on all engines.
                            </p>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
                                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Create Key
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );

    const content = (
        <div className="space-y-4">

            {/* Keys list */}
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : keys.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                    No API keys created yet. AI endpoints are currently open (dev mode).
                </div>
            ) : (
                <div className="space-y-2">
                    {keys.map((key) => (
                        <div
                            key={key.id}
                            className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/30 transition-colors"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <Key className={`h-4 w-4 shrink-0 ${key.is_active ? 'text-amber-500' : 'text-muted-foreground'}`} />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate">{key.name}</span>
                                        {!key.is_active && (
                                            <Badge variant="secondary" className="text-[10px] bg-red-500/10 text-red-400 shrink-0">
                                                Disabled
                                            </Badge>
                                        )}
                                        {key.expires_at && new Date(key.expires_at) < new Date() && (
                                            <Badge variant="secondary" className="text-[10px] bg-orange-500/10 text-orange-400 shrink-0">
                                                Expired
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-muted-foreground font-mono">
                                            {revealedKeys[key.id] || key.prefix}
                                        </p>
                                        {key.engine_name ? (
                                            <Badge variant="outline" className="text-[10px] shrink-0">→ {key.engine_name}</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">All Engines</Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {key.can_reveal && (
                                    <>
                                        <Button
                                            variant="ghost" size="icon" className="h-7 w-7"
                                            onClick={() => handleRevealKey(key.id)}
                                            disabled={revealingId === key.id}
                                            title={revealedKeys[key.id] ? 'Hide key' : 'Reveal key'}
                                        >
                                            {revealingId === key.id
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : revealedKeys[key.id]
                                                    ? <EyeOff className="h-3.5 w-3.5" />
                                                    : <Eye className="h-3.5 w-3.5" />}
                                        </Button>
                                        {revealedKeys[key.id] && (
                                            <Button
                                                variant="ghost" size="icon" className="h-7 w-7"
                                                onClick={() => handleCopyRevealedKey(key.id)}
                                                title="Copy key"
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </>
                                )}
                                <Switch
                                    checked={key.is_active}
                                    onCheckedChange={() => handleToggleActive(key)}
                                    className="scale-75"
                                />
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently revoke <strong>{key.name}</strong> ({key.prefix}).
                                                Any requests using this key will be rejected immediately.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() => handleDelete(key.id)}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            >
                                                {deletingId === key.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                                Revoke Key
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Key className="h-4 w-4 text-amber-500" />
                            API Keys
                        </CardTitle>
                        <CardDescription>
                            Manage API keys for authenticating requests to AI endpoints.
                        </CardDescription>
                    </div>
                    {createKeyDialog}
                </CardHeader>
                <CardContent>{content}</CardContent>
            </Card>
        );
    }

    return <>{createKeyDialog}{content}</>;
};
