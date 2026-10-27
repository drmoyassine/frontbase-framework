import React, { useEffect, useState } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getPageVersions, rollbackPageToVersion, PageVersion } from '@/services/pages-api';
import { Button } from '@/components/ui/button';
import { Loader2, History, RotateCcw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const VersionHistoryDialog: React.FC<VersionHistoryDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { currentPageId, loadPagesFromDatabase } = useBuilderStore(useShallow(s => ({
    currentPageId: s.currentPageId,
    loadPagesFromDatabase: s.loadPagesFromDatabase
  })));
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  useEffect(() => {
    if (open && currentPageId) {
      fetchVersions();
    }
  }, [open, currentPageId]);

  const fetchVersions = async () => {
    if (!currentPageId) return;
    setLoading(true);
    try {
      const data = await getPageVersions(currentPageId);
      setVersions(data);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (versionId: string, versionNumber: number) => {
    if (!currentPageId) return;
    if (!confirm(`Are you sure you want to roll back to version ${versionNumber}? Your current state will be saved as a new version automatically.`)) return;

    setRollingBackId(versionId);
    try {
      await rollbackPageToVersion(currentPageId, versionId);
      toast.success(`Successfully rolled back to version ${versionNumber}`);
      // Reload pages so the canvas reflects the rolled back state
      await loadPagesFromDatabase(false, true);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to rollback');
    } finally {
      setRollingBackId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('default', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            A new version is automatically saved every time you save the page.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center p-8 border border-dashed rounded-lg">
              <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No versions found.</p>
              <p className="text-sm text-muted-foreground mt-1">Save your page to create your first version snapshot.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((v, index) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">v{v.versionNumber}</span>
                      {v.label && (
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
                          {v.label}
                        </span>
                      )}
                      {index === 0 && (
                        <span className="text-xs text-muted-foreground font-medium border px-1.5 rounded-md">Latest</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-1">
                      {formatDate(v.createdAt)}
                      {v.contentHash && <span className="ml-2 font-mono text-[10px]">#{v.contentHash.substring(0, 8)}</span>}
                    </div>
                  </div>
                  
                  <div className="flex-shrink-0 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRollback(v.id, v.versionNumber)}
                      disabled={index === 0 || rollingBackId !== null}
                    >
                      {rollingBackId === v.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4 mr-2" />
                      )}
                      Rollback
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
