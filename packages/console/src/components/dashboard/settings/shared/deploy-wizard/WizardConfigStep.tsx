/**
 * WizardConfigStep — Step 3: Engine configuration form.
 *
 * Handles both CPU and GPU flows, including:
 * - GPU: New vs Existing toggle + engine picker
 * - Resource name (provider-aware label from PROVIDER_RESOURCE_LABELS)
 * - Edge DB / Cache / Queue selectors with "Connect New" option
 *
 * This is the main customization point for per-provider features.
 * NOTE: Engine type selection (Lite/Full) was removed 2026-03-24 — always deploys full.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROVIDER_RESOURCE_LABELS } from '../edgeConstants';
import { useEdgeDatabaseForm } from '@/hooks/useEdgeDatabaseForm';
import { useEdgeCacheForm } from '@/hooks/useEdgeCacheForm';
import { useEdgeQueueForm } from '@/hooks/useEdgeQueueForm';
import { EdgeDatabaseDialog } from '../EdgeDatabaseDialog';
import { EdgeCacheDialog } from '../EdgeCacheDialog';
import { EdgeQueueDialog } from '../EdgeQueueDialog';
import type { DeployWizardState } from './useDeployWizard';

const CONNECT_NEW_VALUE = '__connect_new__';

export function WizardConfigStep({
    computeType,
    workerName, setWorkerName,
    selectedProviderType,
    selectedDbId, setSelectedDbId,
    selectedCacheId, setSelectedCacheId,
    selectedQueueId, setSelectedQueueId,
    edgeDbs, edgeCaches, edgeQueues,
}: DeployWizardState) {
    const queryClient = useQueryClient();

    // Database hook
    const dbForm = useEdgeDatabaseForm({
        onSaveSuccess: (db) => {
            setSelectedDbId(db.id);
            queryClient.invalidateQueries({ queryKey: ['edge-databases'] });
        }
    });

    // Cache hook
    const cacheForm = useEdgeCacheForm({
        onSaveSuccess: (cache) => {
            setSelectedCacheId(cache.id);
            queryClient.invalidateQueries({ queryKey: ['edge-caches'] });
        }
    });

    // Queue hook
    const queueForm = useEdgeQueueForm({
        onSaveSuccess: (queue) => {
            setSelectedQueueId(queue.id);
            queryClient.invalidateQueries({ queryKey: ['edge-queues'] });
        }
    });

    // Filter out local/system resources — cloud engines can't reach localhost
    const cloudDbs = edgeDbs.filter((db: any) => !db.is_system);
    const cloudCaches = edgeCaches.filter((c: any) => !c.is_system);
    const cloudQueues = edgeQueues.filter((q: any) => !q.is_system);

    // System default label — only show if default is a non-local resource
    const defaultDb = cloudDbs.find((db: any) => db.is_default);
    const defaultDbLabel = defaultDb ? `System Default (${defaultDb.name})` : null;

    return (
        <div className="space-y-4">

            {/* Resource Name — provider-aware label */}
            <div className="space-y-2">
                <Label>
                    {PROVIDER_RESOURCE_LABELS[selectedProviderType]?.inputLabel || 'Worker Name'}
                </Label>
                <div className="flex gap-2 items-center">
                    <Input
                        value={workerName}
                        onChange={e => {
                            // Sanitize: lowercase, replace underscores/spaces with hyphens,
                            // strip non-alphanumeric/hyphen chars, collapse consecutive hyphens
                            const sanitized = e.target.value
                                .toLowerCase()
                                .replace(/[_\s]+/g, '-')
                                .replace(/[^a-z0-9-]/g, '')
                                .replace(/-{2,}/g, '-');
                            setWorkerName(sanitized);
                        }}
                        placeholder="my-edge-worker"
                    />
                    {PROVIDER_RESOURCE_LABELS[selectedProviderType]?.urlSuffix && (
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {PROVIDER_RESOURCE_LABELS[selectedProviderType].urlSuffix}
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    Only lowercase letters, numbers, and hyphens. This becomes part of the deployment URL.
                </p>
            </div>

            {/* Edge Database */}
            <div className="space-y-2">
                <Label>Edge Database</Label>
                <Select value={selectedDbId} onValueChange={v => {
                    if (v === CONNECT_NEW_VALUE) { dbForm.openCreate(); return; }
                    setSelectedDbId(v);
                }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {defaultDbLabel && <SelectItem value="default">{defaultDbLabel}</SelectItem>}
                        {cloudDbs.map((db: any) => (
                            <SelectItem key={db.id} value={db.id}>{db.name} ({db.provider})</SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={CONNECT_NEW_VALUE} className="text-primary">
                            <span className="flex items-center gap-1.5"><Plus className="w-3 h-3" /> Connect New Database</span>
                        </SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Persistent edge database for published pages and state.</p>
            </div>

            {/* Edge Cache */}
            <div className="space-y-2">
                <Label>Edge Cache</Label>
                <Select value={selectedCacheId} onValueChange={v => {
                    if (v === CONNECT_NEW_VALUE) { cacheForm.openCreate(); return; }
                    setSelectedCacheId(v);
                }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {cloudCaches.map(cache => (
                            <SelectItem key={cache.id} value={cache.id}>{cache.name} ({cache.provider})</SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={CONNECT_NEW_VALUE} className="text-primary">
                            <span className="flex items-center gap-1.5"><Plus className="w-3 h-3" /> Connect New Cache</span>
                        </SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Optional caching layer (Upstash, Redis) for faster page loads.</p>
            </div>

            {/* Edge Queue */}
            <div className="space-y-2">
                <Label>Edge Queue</Label>
                <Select value={selectedQueueId} onValueChange={v => {
                    if (v === CONNECT_NEW_VALUE) { queueForm.openCreate(); return; }
                    setSelectedQueueId(v);
                }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {cloudQueues.map(queue => (
                            <SelectItem key={queue.id} value={queue.id}>{queue.name} ({queue.provider})</SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={CONNECT_NEW_VALUE} className="text-primary">
                            <span className="flex items-center gap-1.5"><Plus className="w-3 h-3" /> Connect New Queue</span>
                        </SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Optional message queue (QStash) for durable workflow execution.</p>
            </div>

            {/* Edge resource connection modals */}
            <EdgeDatabaseDialog {...dbForm} databases={edgeDbs} trigger={<span className="hidden" />} />
            <EdgeCacheDialog {...cacheForm} caches={edgeCaches} trigger={<span className="hidden" />} />
            <EdgeQueueDialog {...queueForm} queues={edgeQueues} trigger={<span className="hidden" />} />
        </div>
    );
}
