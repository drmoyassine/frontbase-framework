import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { showApiErrorToast } from '@/components/dashboard/settings/shared/edgeTestToast';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Eye,
  Save,
  Layers,
  ArrowLeft,
  Smartphone,
  Tablet,
  Monitor,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Menu,
  Wrench,
  FileEdit,
  Trash2,
  Grid3x3,
  Settings,
  History,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores/auth';
import { PageSelector } from './PageSelector';
import { PageSettingsDrawer } from './PageSettingsDrawer';
import { VersionHistoryDialog } from './settings/VersionHistoryDialog';
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import { resolvePagePreviewUrl } from '@/lib/edgeUtils';
import { isCloud } from '@/lib/edition';
import { EdgePublishDialog } from '../dashboard/settings/shared/EdgePublishDialog';

interface EdgeTarget {
  id: string;
  name: string;
  url: string;
  adapter_type: string;
  is_active: boolean;
  edge_db_id: string | null;
  is_shared?: boolean;
  is_system?: boolean;
}

export const BuilderHeader: React.FC<{
  isMobile?: boolean;
  onToggleLeftSidebar?: () => void;
  onToggleRightSidebar?: () => void;
}> = ({
  isMobile = false,
  onToggleLeftSidebar,
  onToggleRightSidebar
}) => {
    const navigate = useNavigate();
    const { tenant, user } = useAuthStore();
    const tenantSlug = tenant?.slug || user?.tenant_slug;
    const {
      project,
      currentPageId,
      pages,
      isPreviewMode,
      setPreviewMode,
      isSupabaseConnected,
      selectedComponentId,
      isSaving,
      hasUnsavedChanges,
      currentViewport,
      zoomLevel,
      setCurrentViewport,
      setZoomLevel,
      showGrid,
      setShowGrid,
      savePageToDatabase,
      publishPageToTarget,
      publishPageToTargets,
      loadPagesFromDatabase,
      togglePageVisibility,
      deleteSelectedComponent
    } = useBuilderStore(useShallow(s => ({
      project: s.project,
      currentPageId: s.currentPageId,
      pages: s.pages,
      isPreviewMode: s.isPreviewMode,
      setPreviewMode: s.setPreviewMode,
      isSupabaseConnected: s.isSupabaseConnected,
      selectedComponentId: s.selectedComponentId,
      isSaving: s.isSaving,
      hasUnsavedChanges: s.hasUnsavedChanges,
      currentViewport: s.currentViewport,
      zoomLevel: s.zoomLevel,
      setCurrentViewport: s.setCurrentViewport,
      setZoomLevel: s.setZoomLevel,
      showGrid: s.showGrid,
      setShowGrid: s.setShowGrid,
      savePageToDatabase: s.savePageToDatabase,
      publishPageToTarget: s.publishPageToTarget,
      publishPageToTargets: s.publishPageToTargets,
      loadPagesFromDatabase: s.loadPagesFromDatabase,
      togglePageVisibility: s.togglePageVisibility,
      deleteSelectedComponent: s.deleteSelectedComponent
    })));

    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [showPageSettings, setShowPageSettings] = useState(false);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [loadingTargets, setLoadingTargets] = useState(false);

    const currentPage = pages.find(page => page.id === currentPageId);

    // Get unified page status.
    // State map (signals: deletedAt, isPublic, hasUnsavedChanges, hasUnpublishedChanges):
    //   deletedAt set                                              → Deleted
    //   isPublic && (hasUnsavedChanges || hasUnpublishedChanges)   → Modified (live version is stale)
    //   isPublic && in sync                                        → Published
    //   !isPublic                                                  → Draft
    const getPageStatus = () => {
      if (!currentPage) return null;

      if (currentPage.deletedAt) {
        return {
          label: 'Deleted',
          icon: Trash2,
          className: 'text-red-600 border-red-500 bg-red-50'
        };
      }

      if (currentPage.isPublic) {
        // The live deployment is stale if there are unsaved edits OR saved edits
        // that haven't been re-published (hasUnpublishedChanges, backend-computed).
        const stale = hasUnsavedChanges || !!currentPage.hasUnpublishedChanges;
        if (stale) {
          return {
            label: 'Modified',
            icon: AlertCircle,
            className: 'text-amber-600 border-amber-500 bg-amber-50'
          };
        }
        return {
          label: 'Published',
          icon: CheckCircle2,
          className: 'text-green-600 border-green-500 bg-green-50'
        };
      }

      return {
        label: 'Draft',
        icon: FileEdit,
        className: 'text-muted-foreground border-border'
      };
    };

    const pageStatus = getPageStatus();

    const handleSave = async () => {
      if (currentPageId) {
        await savePageToDatabase(currentPageId);
      }
    };

    const handlePublishTarget = async (targetId: string, target?: EdgeTarget) => {
      if (!currentPageId || !currentPage) return;
      setIsPublishing(true);
      try {
        const returnedPreviewUrl = await publishPageToTarget(currentPageId, targetId);
        await loadPagesFromDatabase(false, true);

        // Resolve a browser-usable preview URL. The backend-returned URL can be
        // an internal hostname or empty for the system edge, so reuse the same
        // resolution chain as EdgePublishDialog / PagesPanel (falls back to the
        // current origin for the system edge, which IS this deployment's worker).
        const freshPage = useBuilderStore.getState().pages.find(p => p.id === currentPageId) || currentPage;
        const pagePath = freshPage.isHomepage ? '' : freshPage.slug || '';
        const storedDep = freshPage.deployments?.find(
          d => d.engineId === targetId && d.status === 'published'
        );
        const previewUrl = resolvePagePreviewUrl(target, pagePath, storedDep?.previewUrl, tenantSlug)
          || (returnedPreviewUrl ?? '');

        if (previewUrl) {
          window.open(previewUrl.trim(), '_blank');
        } else {
          toast.success('Page published successfully');
        }
      } catch (err) {
        showApiErrorToast(err, 'Publish failed');
      } finally {
        setIsPublishing(false);
      }
    };

    // Main publish handler: single-target fast path vs multi-target dialog
    const handlePublishClick = async () => {
      if (!currentPageId || !currentPage) return;

      setLoadingTargets(true);
      try {
        const response = await fetch('/api/edge-engines/active/by-scope/full');
        const data = await response.json();

        // In CLOUD mode tenants can't publish to the control-plane system edge,
        // but in SELF-HOST the system edge IS this deployment's worker and the
        // only publish target — so it must stay eligible. (Mirrors EdgePublishDialog.)
        const eligible = (data as EdgeTarget[]).filter(
          e => e.edge_db_id && (!isCloud() || !tenantSlug || !e.is_system)
        );

        if (eligible.length === 1) {
          // Single target (the common community case = system edge) → direct
          // publish + auto-preview in a new tab, no dialog.
          await handlePublishTarget(eligible[0].id, eligible[0]);
        } else {
          // Multiple targets (future paid tiers) or none → show the picker.
          setPublishOpen(true);
        }
      } catch (err) {
        showApiErrorToast(err, 'Failed to load targets');
      } finally {
        setLoadingTargets(false);
      }
    };

    const handleToggleVisibility = async () => {
      if (currentPageId) {
        await togglePageVisibility(currentPageId);
      }
    };

    const handleDeleteComponent = () => {
      deleteSelectedComponent();
    };

    const handleNavigateToDatabase = () => {
      navigate('/data-studio');
    };

    const handleBackToDashboard = () => {
      if (hasUnsavedChanges) {
        setShowUnsavedDialog(true);
      } else {
        navigate('/pages');
      }
    };

    const handleSaveAndNavigate = async () => {
      if (currentPageId) {
        await handleSave();
      }
      navigate('/pages');
      setShowUnsavedDialog(false);
    };

    const handleDiscardAndNavigate = () => {
      navigate('/pages');
      setShowUnsavedDialog(false);
    };

    return (
      <header className="relative h-16 bg-card border-b border-border flex items-center px-6">
        {/* Left Section */}
        <div className="flex items-center gap-4">

          <Button variant="ghost" size="sm" onClick={handleBackToDashboard}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-border hidden sm:block" />

          <div className="hidden sm:flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">Frontbase</span>
          </div>

          <div className="h-6 w-px bg-border" />

          <PageSelector />
        </div>

        {/* Center Section - Responsive Controls (Hidden on mobile) */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 items-center gap-3">
          {/* Viewport Selection */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            <Button
              variant={currentViewport === 'mobile' ? "default" : "ghost"}
              size="sm"
              onClick={() => setCurrentViewport('mobile')}
              className="h-8 w-8 p-0"
            >
              <Smartphone className="h-4 w-4" />
            </Button>
            <Button
              variant={currentViewport === 'tablet' ? "default" : "ghost"}
              size="sm"
              onClick={() => setCurrentViewport('tablet')}
              className="h-8 w-8 p-0"
            >
              <Tablet className="h-4 w-4" />
            </Button>
            <Button
              variant={currentViewport === 'desktop' ? "default" : "ghost"}
              size="sm"
              onClick={() => setCurrentViewport('desktop')}
              className="h-8 w-8 p-0"
            >
              <Monitor className="h-4 w-4" />
            </Button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoomLevel(Math.max(25, zoomLevel - 25))}
              disabled={zoomLevel <= 25}
              className="h-8 w-8 p-0"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>

            <Badge variant="outline" className="min-w-16 justify-center">
              {zoomLevel}%
            </Badge>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoomLevel(Math.min(200, zoomLevel + 25))}
              disabled={zoomLevel >= 200}
              className="h-8 w-8 p-0"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Grid Controls */}
          <div className="flex items-center gap-1 border-l pl-4">
            <Button
              variant={showGrid ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowGrid(!showGrid)}
              className="h-8 w-8 p-0"
              title="Toggle Grid (G)"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4 ml-auto">
          {/* Status Badge */}
          {pageStatus && (
            <Badge
              variant="outline"
              className={cn("gap-1.5 px-2.5 py-0.5", pageStatus.className)}
            >
              <pageStatus.icon className="h-3 w-3" />
              <span className="text-xs font-medium hidden sm:inline">{pageStatus.label}</span>
            </Badge>
          )}

          {/* Save Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              hasUnsavedChanges && "border-amber-500 text-amber-600"
            )}
          >
            {isSaving && <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />}
            {!isSaving && <Save className="h-4 w-4 sm:mr-2" />}
            <span className="hidden sm:inline">
              {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save*' : 'Save'}
            </span>
          </Button>

          {/* Publish Button */}
          <Button
            size="sm"
            disabled={isSaving || isPublishing || loadingTargets}
            onClick={handlePublishClick}
          >
            {(isPublishing || loadingTargets) ? (
              <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">
              {isPublishing ? 'Publishing...' : 'Publish'}
            </span>
          </Button>

          {/* Version History */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVersionHistory(true)}
            title="Version History"
          >
            <History className="h-4 w-4" />
          </Button>

          {/* Page Settings */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPageSettings(true)}
            title="Page Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        <UnsavedChangesDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onSaveAndContinue={handleSaveAndNavigate}
          onDiscardAndContinue={handleDiscardAndNavigate}
        />

        <PageSettingsDrawer
          open={showPageSettings}
          onOpenChange={setShowPageSettings}
        />

        <VersionHistoryDialog
          open={showVersionHistory}
          onOpenChange={setShowVersionHistory}
        />

        <EdgePublishDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          pageIds={currentPageId ? [currentPageId] : []}
          singlePageData={currentPage}
          hasUnsavedChanges={hasUnsavedChanges}
          onPublish={handlePublishTarget}
        />
      </header>
    );
  };