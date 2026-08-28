import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, History, RotateCcw, AlertCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  useWorkflowVersions,
  useCreateManualWorkflowVersion,
  useRollbackWorkflowToVersion
} from '@/stores/actions';

interface WorkflowVersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDraftId: string | null;
}

export const WorkflowVersionHistoryDialog: React.FC<WorkflowVersionHistoryDialogProps> = ({
  open,
  onOpenChange,
  currentDraftId,
}) => {
  const { data: response, isLoading: loading } = useWorkflowVersions(currentDraftId);
  const versions = response?.data || [];

  const createManualVersion = useCreateManualWorkflowVersion();
  const rollback = useRollbackWorkflowToVersion();

  const [label, setLabel] = useState('');

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDraftId) return;

    try {
      await createManualVersion.mutateAsync({
        draftId: currentDraftId,
        label: label.trim() || undefined,
      });
      toast.success('Version snapshot created successfully');
      setLabel('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create snapshot');
    }
  };

  const handleRollback = async (versionId: string, versionNumber: number) => {
    if (!currentDraftId) return;
    if (!confirm(`Are you sure you want to roll back to version ${versionNumber}? Your current state will be saved as a new version automatically.`)) return;

    try {
      await rollback.mutateAsync({
        draftId: currentDraftId,
        versionId,
      });
      toast.success(`Successfully rolled back to version ${versionNumber}`);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to rollback');
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
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" />
            Workflow Version History
          </DialogTitle>
          <DialogDescription>
            A new version is automatically saved every time you save changes. You can also manually snapshot a labeled version.
          </DialogDescription>
        </DialogHeader>

        {/* Manual snapshot section */}
        {currentDraftId && (
          <form onSubmit={handleCreateVersion} className="flex gap-2 shrink-0 py-3 border-b">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label this snapshot (e.g. 'Before integrating Stripe')"
              className="flex-1 text-sm h-9"
              disabled={createManualVersion.isPending}
            />
            <Button 
              type="submit" 
              size="sm" 
              disabled={createManualVersion.isPending}
              className="gap-1.5 h-9 shrink-0"
            >
              {createManualVersion.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Snapshot
            </Button>
          </form>
        )}

        <div className="flex-1 overflow-y-auto mt-4 space-y-4 min-h-0 pr-1">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center p-8 border border-dashed rounded-lg">
              <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No versions found.</p>
              <p className="text-sm text-muted-foreground mt-1">Save your workflow changes to create your first version snapshot.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((v, index) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">v{v.versionNumber}</span>
                      {v.label && (
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium max-w-[200px] truncate" title={v.label}>
                          {v.label}
                        </span>
                      )}
                      {index === 0 && (
                        <span className="text-[10px] text-muted-foreground font-medium border px-1.5 rounded bg-muted/30">Latest</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2">
                      <span>{formatDate(v.createdAt)}</span>
                      {v.createdBy && <span>• {v.createdBy}</span>}
                      {v.contentHash && (
                        <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          #{v.contentHash.substring(0, 8)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRollback(v.id, v.versionNumber)}
                      disabled={index === 0 || rollback.isPending}
                      className="h-8"
                    >
                      {rollback.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
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
