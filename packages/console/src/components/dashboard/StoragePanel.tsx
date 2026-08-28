import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { HardDrive, Plus, Trash2, AlertTriangle, Zap, Loader2 } from 'lucide-react';
import { FileBrowser } from './FileBrowser';
import { toast } from 'sonner';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  STORAGE_CAPABLE_PROVIDERS,
  PROVIDER_CONFIGS,
  PROVIDER_ICONS,
  EDGE_STORAGE_PROVIDERS,
} from '@/components/dashboard/settings/shared/edgeConstants';
import { showTestToast } from '@/components/dashboard/settings/shared/edgeTestToast';
import { ConnectProviderDialog } from '@/components/dashboard/settings/shared/ConnectProviderDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEdgeProviders } from '@/hooks/useEdgeInfrastructure';
import api from '@/services/api-service';
import { Bucket } from './FileBrowser/types';
import { fetchBuckets, FetchBucketsResult } from './FileBrowser/api';

// ── API ───────────────────────────────────────────────────────────────

interface StorageProviderRecord {
  id: string;
  name: string;
  provider: string;
  provider_account_id: string;
  account_name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string | null;
}

const storageProvidersApi = {
  list: async (): Promise<StorageProviderRecord[]> => {
    const res = await api.get('/api/storage/providers/');
    return res.data;
  },
  create: async (data: { provider_account_id: string; name?: string; config?: Record<string, string> }): Promise<StorageProviderRecord> => {
    const res = await api.post('/api/storage/providers/', data);
    return res.data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/storage/providers/${id}`);
  },
};

// ── Hook ──────────────────────────────────────────────────────────────

function useStorageProviders() {
  return useQuery({
    queryKey: ['storage-providers'],
    queryFn: storageProvidersApi.list,
    staleTime: STALE.STANDARD,
  });
}

// ── Add-Storage Dialog — Unified with provider tabs ───────────────────

const STORAGE_PROVIDER_OPTIONS = EDGE_STORAGE_PROVIDERS;

function AddStorageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: allAccounts = [] } = useEdgeProviders();
  const { data: existingProviders = [] } = useStorageProviders();
  const [selectedProvider, setSelectedProvider] = React.useState<string>('cloudflare');
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>('');
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>('');
  const [creatingNewSite, setCreatingNewSite] = React.useState(false);
  const [newSiteName, setNewSiteName] = React.useState('');
  const [connectOpen, setConnectOpen] = React.useState(false);

  // ── Netlify site picker ─────────────────────────────────────────────
  const isNetlify = selectedProvider === 'netlify';
  const { data: netlifySites = [], isLoading: sitesLoading } = useQuery<{ id: string; name: string; url: string }[]>({
    queryKey: ['netlify-sites', selectedAccountId],
    queryFn: async () => {
      const res = await api.get(`/api/storage/netlify-sites?account_id=${selectedAccountId}`);
      return res.data;
    },
    enabled: isNetlify && !!selectedAccountId,
    staleTime: STALE.STANDARD,
  });

  // Reset site selection when account changes
  React.useEffect(() => {
    setSelectedSiteId('');
    setCreatingNewSite(false);
    setNewSiteName('');
  }, [selectedAccountId, selectedProvider]);

  // Create Netlify site mutation
  const createSiteMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/api/storage/netlify-sites', {
        account_id: selectedAccountId,
        name,
      });
      return res.data as { id: string; name: string; url: string };
    },
    onSuccess: (newSite) => {
      queryClient.invalidateQueries({ queryKey: ['netlify-sites', selectedAccountId] });
      setSelectedSiteId(newSite.id);
      setCreatingNewSite(false);
      setNewSiteName('');
      toast.success(`Site "${newSite.name}" created`);
    },
    onError: () => toast.error('Failed to create Netlify site'),
  });

  // Filter accounts by selected provider
  const availableAccounts = React.useMemo(() => {
    const prov = STORAGE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider);
    if (!prov?.accountProvider) return [];
    const existingIds = new Set(existingProviders.map(p => p.provider_account_id));
    return allAccounts.filter(
      a => a.provider === prov.accountProvider && !existingIds.has(a.id)
    );
  }, [allAccounts, existingProviders, selectedProvider]);

  const createMutation = useMutation({
    mutationFn: storageProvidersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-providers'] });
      toast.success('Storage provider added');
      setSelectedAccountId('');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to add storage provider'),
  });

  const handleAdd = () => {
    if (!selectedAccountId) return;
    if (isNetlify && !selectedSiteId) return;
    const payload: { provider_account_id: string; name?: string; config?: Record<string, string> } = {
      provider_account_id: selectedAccountId,
    };
    if (isNetlify && selectedSiteId) {
      const site = netlifySites.find(s => s.id === selectedSiteId);
      payload.config = { site_id: selectedSiteId };
      if (site?.name) {
        payload.name = `Netlify – ${site.name}`;
      }
    }
    createMutation.mutate(payload);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Storage Provider</DialogTitle>
            <DialogDescription>
              Select a provider and connect an account for file storage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Provider tabs — 3 col grid matching DB/Cache/Queue */}
            <div className="space-y-2">
              <Label>Provider</Label>
              <div className="grid grid-cols-3 gap-2">
                {STORAGE_PROVIDER_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { opt.active && setSelectedProvider(opt.value); setSelectedAccountId(''); }}
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

            {/* Account picker — scoped to selected provider */}
            {(() => {
              const prov = STORAGE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider);
              if (!prov?.active || !prov.accountProvider) return null;

              return availableAccounts.length > 0 ? (
                <div className="space-y-3">
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAccounts.map(a => {
                        const config = PROVIDER_CONFIGS[a.provider];
                        const AcctIcon = PROVIDER_ICONS[a.provider];
                        return (
                          <SelectItem key={a.id} value={a.id}>
                            <div className="flex items-center gap-2">
                              {AcctIcon && <AcctIcon className="h-4 w-4" />}
                              <span>{a.name}</span>
                              <span className="text-xs text-muted-foreground">({config?.label || a.provider})</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  {/* Netlify site picker — shown after account selection */}
                  {isNetlify && selectedAccountId && (
                    <div className="space-y-2">
                      <Label>Netlify Site</Label>
                      {sitesLoading ? (
                        <p className="text-sm text-muted-foreground py-2">Loading sites…</p>
                      ) : creatingNewSite ? (
                        /* ── Create New Site inline form ──────────── */
                        <div className="space-y-2">
                          <Input
                            placeholder="my-storage-site"
                            value={newSiteName}
                            onChange={e => setNewSiteName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && newSiteName.trim()) {
                                createSiteMutation.mutate(newSiteName.trim());
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!newSiteName.trim() || createSiteMutation.isPending}
                              onClick={() => createSiteMutation.mutate(newSiteName.trim())}
                            >
                              {createSiteMutation.isPending ? 'Creating…' : 'Create Site'}
                            </Button>
                            {netlifySites.length > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setCreatingNewSite(false)}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : netlifySites.length > 0 ? (
                        /* ── Existing sites dropdown ──────────────── */
                        <div className="space-y-2">
                          <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a site to scope storage…" />
                            </SelectTrigger>
                            <SelectContent>
                              {netlifySites.map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                  <div className="flex items-center gap-2">
                                    <span>{s.name}</span>
                                    {s.url && (
                                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                        {s.url.replace(/^https?:\/\//, '')}
                                      </span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                            onClick={() => setCreatingNewSite(true)}
                          >
                            <Plus className="h-3 w-3" /> Create New Site
                          </button>
                        </div>
                      ) : (
                        /* ── No sites — default to create ────────── */
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            No sites found. Create one to get started:
                          </p>
                          <Input
                            placeholder="my-storage-site"
                            value={newSiteName}
                            onChange={e => setNewSiteName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && newSiteName.trim()) {
                                createSiteMutation.mutate(newSiteName.trim());
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            disabled={!newSiteName.trim() || createSiteMutation.isPending}
                            onClick={() => createSiteMutation.mutate(newSiteName.trim())}
                          >
                            {createSiteMutation.isPending ? 'Creating…' : 'Create Site'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center space-y-3 py-4">
                  <p className="text-sm text-muted-foreground">
                    No {prov.label} accounts available. Connect one first.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setConnectOpen(true)}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Connect {PROVIDER_CONFIGS[prov.accountProvider]?.label || prov.label} Account
                  </Button>
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConnectOpen(true)}>
              Connect New Account
            </Button>
            <Button
              size="sm"
              disabled={!selectedAccountId || (isNetlify && !selectedSiteId) || createMutation.isPending}
              onClick={handleAdd}
            >
              {createMutation.isPending ? 'Adding...' : 'Add Storage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConnectProviderDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        allowedProviders={STORAGE_CAPABLE_PROVIDERS}
        onConnected={() => {
          queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
        }}
      />
    </>
  );
}

// ── Test Connection Button ────────────────────────────────────────────

function TestConnectionButton({ providerId }: { providerId: string }) {
  const [testing, setTesting] = React.useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.get(`/api/storage/buckets?provider_id=${providerId}`);
      if (res.data?.success) {
        showTestToast({ success: true, message: `${res.data.buckets?.length ?? 0} bucket(s) accessible` }, 'Storage');
      } else {
        showTestToast({ success: false, message: res.data?.error || 'Connection failed' }, 'Storage');
      }
    } catch (e: any) {
      showTestToast({ success: false, message: e?.response?.data?.detail || e.message || 'Connection failed' }, 'Storage');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={handleTest}
      disabled={testing}
      title="Test connection"
    >
      {testing
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <Zap className="h-3.5 w-3.5" />
      }
    </Button>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────

export const StoragePanel: React.FC = () => {
  const { data: storageProviders = [], isLoading } = useStorageProviders();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [providerToDelete, setProviderToDelete] = React.useState<{ id: string; name: string } | null>(null);

  // ── Fetch buckets from ALL providers in parallel ──
  const bucketQueries = useQueries({
    queries: storageProviders.map(sp => ({
      queryKey: ['storage-buckets', sp.id],
      queryFn: () => fetchBuckets(sp.id),
      staleTime: STALE.DEFAULT,
    })),
  });

  // Merge all buckets into unified list with provider metadata
  const { unifiedBuckets, bucketsLoading, bucketsError, permissionWarnings, bucketCountByProvider } = React.useMemo(() => {
    const allBuckets: Bucket[] = [];
    const warnings: Record<string, string> = {};
    const counts: Record<string, number> = {};
    let anyLoading = false;
    let firstError: Error | null = null;

    storageProviders.forEach((sp, i) => {
      const query = bucketQueries[i];
      if (query?.isLoading) anyLoading = true;
      if (query?.error && !firstError) firstError = query.error as Error;

      const result = query?.data as FetchBucketsResult | undefined;
      if (result?.permissionWarning) {
        warnings[sp.id] = result.permissionWarning;
      }

      const provBuckets = result?.buckets ?? [];
      counts[sp.id] = provBuckets.length;

      // Find the EDGE_STORAGE_PROVIDERS entry for the label
      const edgeProv = EDGE_STORAGE_PROVIDERS.find(ep => ep.value === sp.provider);
      const provLabel = edgeProv?.label || PROVIDER_CONFIGS[sp.provider]?.label || sp.provider;

      provBuckets.forEach(b => {
        allBuckets.push({
          ...b,
          providerId: sp.id,
          provider: sp.provider,
          providerLabel: provLabel,
        });
      });
    });

    return {
      unifiedBuckets: allBuckets,
      bucketsLoading: isLoading || anyLoading,
      bucketsError: firstError,
      permissionWarnings: warnings,
      bucketCountByProvider: counts,
    };
  }, [storageProviders, bucketQueries, isLoading]);

  // Available provider names for the filter dropdown
  const availableProviders = React.useMemo(() => {
    return storageProviders.map(sp => {
      const edgeProv = EDGE_STORAGE_PROVIDERS.find(ep => ep.value === sp.provider);
      return {
        label: edgeProv?.label || PROVIDER_CONFIGS[sp.provider]?.label || sp.provider,
        value: sp.provider,
      };
    });
  }, [storageProviders]);

  // Connected providers for the bucket create dialog
  const connectedProviders = React.useMemo(() => {
    return storageProviders.map(sp => ({
      id: sp.id,
      name: sp.name,
      provider: sp.provider,
      providerAccountId: sp.provider_account_id,
    }));
  }, [storageProviders]);

  const deleteMutation = useMutation({
    mutationFn: storageProvidersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-providers'] });
      toast.success('Storage provider removed');
    },
    onError: () => toast.error('Failed to remove storage provider'),
  });

  const handleDelete = (id: string, name: string) => {
    setProviderToDelete({ id, name });
  };

  const confirmDelete = () => {
    if (providerToDelete) {
      deleteMutation.mutate(providerToDelete.id);
      setProviderToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Storage</h1>
          <p className="text-muted-foreground">
            Manage files and media with your storage providers
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Storage
        </Button>
      </div>

      {/* Provider Cards — informational, no selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {storageProviders.length === 0 && !isLoading ? (
          <Card className="col-span-full flex flex-col items-center justify-center py-12 border-dashed">
            <HardDrive className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No storage providers added</p>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add Storage Provider
            </Button>
          </Card>
        ) : (
          storageProviders.map(sp => {
            const config = PROVIDER_CONFIGS[sp.provider];
            const Icon = PROVIDER_ICONS[sp.provider] || HardDrive;
            const count = bucketCountByProvider[sp.id] ?? 0;
            const warning = permissionWarnings[sp.id];
            return (
              <Card
                key={sp.id}
                className="flex flex-col shadow-sm border-muted-foreground/10"
              >
                <CardHeader className="pb-2 flex-shrink-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-primary/5 rounded-lg">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold leading-tight">{sp.name}</CardTitle>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{sp.account_name}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="font-medium text-xs">
                        {count} {count === 1 ? 'bucket' : 'buckets'}
                      </Badge>
                      <Badge variant="outline" className="font-medium text-xs text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                        Connected
                      </Badge>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <TestConnectionButton providerId={sp.id} />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(sp.id, sp.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {warning && (
                  <CardContent className="pt-0 pb-3">
                    <div className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <p className="text-[11px] leading-snug">{warning}</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Unified File Browser — shows ALL providers' buckets */}
      {storageProviders.length > 0 && (
        <FileBrowser
          storageProviderId={storageProviders[0].id}
          unifiedBuckets={unifiedBuckets}
          unifiedBucketsLoading={bucketsLoading}
          unifiedBucketsError={bucketsError}
          permissionWarnings={permissionWarnings}
          availableProviders={availableProviders}
          connectedProviders={connectedProviders}
        />
      )}

      <AddStorageDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Remove provider confirmation */}
      <AlertDialog open={!!providerToDelete} onOpenChange={(open) => !open && setProviderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Storage Provider</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <span className="font-medium text-foreground">"{providerToDelete?.name}"</span>?
              This will disconnect the provider from Frontbase. Your files on the provider will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};