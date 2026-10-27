import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink, Loader2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { resolvePagePreviewUrl } from '@/lib/edgeUtils';
import { isCloud } from '@/lib/edition';
import { toast } from 'sonner';

export interface EdgeTarget {
  id: string;
  name: string;
  url: string;
  is_shared?: boolean;
  is_system?: boolean;
  edge_db_id?: string | null;
}

interface EdgePublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageIds: string[];
  singlePageData?: any; // If single page, pass its details for sync status & preview url
  hasUnsavedChanges?: boolean;
  onPublish: (targetId: string) => Promise<void>;
}

export const EdgePublishDialog: React.FC<EdgePublishDialogProps> = ({
  open,
  onOpenChange,
  pageIds,
  singlePageData,
  hasUnsavedChanges = false,
  onPublish,
}) => {
  const { tenant, user } = useAuthStore();
  const tenantSlug = tenant?.slug || user?.tenant_slug;

  const [targets, setTargets] = useState<EdgeTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Load targets when dialog opens
  useEffect(() => {
    if (!open) return;

    const loadTargets = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/edge-engines/active/by-scope/full');
        const data = await response.json();
        
        // In CLOUD mode, tenants can't publish to the system/control-plane edge
        // (it's the product's own runtime). In SELF-HOST the system edge IS the
        // worker this deployment runs on — the only publish target — so it must be
        // eligible even though is_system is true.
        const eligible = (data as EdgeTarget[]).filter(
          e => e.edge_db_id && (!isCloud() || !tenantSlug || !e.is_system)
        );
        
        setTargets(eligible);

        if (eligible.length > 0) {
          // Pre-select first eligible target
          setSelectedTargetId(eligible[0].id);
        } else {
          setSelectedTargetId(null);
        }
      } catch (err) {
        toast.error('Failed to load publish targets');
      } finally {
        setLoading(false);
      }
    };

    loadTargets();
  }, [open, tenantSlug]);

  const isTargetSynced = (targetId: string, page: any, unsaved: boolean) => {
    if (unsaved) return false;
    if (!page?.deployments) return false;
    return page.deployments.some(
      (d: any) => d.engineId === targetId && d.status === 'published' && d.contentHash === page.contentHash
    );
  };

  const handlePublish = async () => {
    if (!selectedTargetId) return;
    setPublishing(true);
    try {
      await onPublish(selectedTargetId);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const isSingle = pageIds.length === 1 && !!singlePageData;
  const selectedTargetName = targets.find(t => t.id === selectedTargetId)?.name || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publish to Edge</DialogTitle>
          <DialogDescription>
            {isSingle
              ? `Select a deployment target to publish page "${singlePageData.name}".`
              : `Select a deployment target to publish the selected ${pageIds.length} pages.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : targets.length === 0 ? (
          <div className="py-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-medium">No active publish targets available.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a Full-Bundle Edge Engine with a database connection to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {isSingle && hasUnsavedChanges && (
              <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-950 text-[11px] text-amber-700 dark:text-amber-400">
                You have unsaved changes. The page will be saved automatically before publishing.
              </div>
            )}
            <div className="max-h-60 overflow-y-auto space-y-2 border rounded-md p-2.5 bg-muted/10">
              {targets.map(target => {
                const synced = isSingle && isTargetSynced(target.id, singlePageData, hasUnsavedChanges);
                const isSelected = selectedTargetId === target.id;
                
                // Preview URL resolution (shared with the builder header direct-publish path)
                const pagePath = singlePageData?.isHomepage ? '' : singlePageData?.slug || '';
                const storedDep = singlePageData?.deployments?.find(
                  (d: any) => d.engineId === target.id && d.status === 'published'
                );
                const previewUrl = resolvePagePreviewUrl(target, pagePath, storedDep?.previewUrl, tenantSlug);

                return (
                  <label
                    key={target.id}
                    className={cn(
                      "flex items-center gap-3 py-2.5 px-3 rounded border transition-colors cursor-pointer text-left block",
                      isSelected ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="publish-target"
                      value={target.id}
                      checked={isSelected}
                      onChange={() => setSelectedTargetId(target.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{target.name}</span>
                        {isSingle && (
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full flex-shrink-0",
                              synced ? "bg-emerald-500" : "bg-amber-500"
                            )}
                            title={synced ? "Up to date" : "Needs sync"}
                          />
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
                        {target.url}
                      </span>
                    </div>
                    {isSingle && (
                      <button
                        type="button"
                        className="flex-shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(previewUrl?.trim(), '_blank');
                        }}
                        title={`Preview on ${target.name}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={targets.length === 0 || !selectedTargetId || publishing}
            onClick={handlePublish}
          >
            {publishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {selectedTargetName ? `Publish to ${selectedTargetName}` : 'Publish'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
