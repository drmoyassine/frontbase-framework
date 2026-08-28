import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { useDashboardStore } from '@/stores/dashboard';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Plus, Search, MoreHorizontal, Eye, Edit, Copy, Trash2, FileText, RotateCcw, Trash, CheckSquare, Square, Download, Globe, GlobeLock, Upload as UploadIcon } from 'lucide-react';
import { PageExportEnvelope } from '@/types/page-export';
import { toast } from 'sonner';
import { resolvePreviewUrl } from '@/lib/edgeUtils';
import { CreatePageDialog } from './CreatePageDialog';
import { EdgePublishDialog } from './settings/shared/EdgePublishDialog';

export const PagesPanel: React.FC = () => {
  const navigate = useNavigate();
  const { project, pages, createPage, createPageInDatabase, deletePage, restorePage, permanentDeletePage, setCurrentPageId, loadPagesFromDatabase, publishPageToTarget, publishPageToTargets, unpublishPageFromTarget } = useBuilderStore(useShallow(s => ({
    project: s.project,
    pages: s.pages,
    createPage: s.createPage,
    createPageInDatabase: s.createPageInDatabase,
    deletePage: s.deletePage,
    restorePage: s.restorePage,
    permanentDeletePage: s.permanentDeletePage,
    setCurrentPageId: s.setCurrentPageId,
    loadPagesFromDatabase: s.loadPagesFromDatabase,
    publishPageToTarget: s.publishPageToTarget,
    publishPageToTargets: s.publishPageToTargets,
    unpublishPageFromTarget: s.unpublishPageFromTarget
  })));
  const { isAuthenticated, isLoading, tenant, user } = useAuthStore();
  const tenantSlug = tenant?.slug || user?.tenant_slug;
  const { searchQuery, setSearchQuery, filterStatus } = useDashboardStore();
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(true);
  const [showTrash, setShowTrash] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isBulkPublishing, setIsBulkPublishing] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);

  // Load pages from database when component mounts or trash mode changes
  useEffect(() => {
    const loadPages = async () => {
      if (!isLoading && isAuthenticated) {
        try {
          setIsLoadingPages(true);
          await loadPagesFromDatabase(showTrash);
        } catch (error) {
          console.error('Failed to load pages:', error);
          toast.error('Failed to load pages from database');
        } finally {
          setIsLoadingPages(false);
        }
      } else if (!isLoading && !isAuthenticated) {
        setIsLoadingPages(false);
      }
    };

    loadPages();
  }, [loadPagesFromDatabase, isAuthenticated, isLoading, showTrash]);

  // Clear selection when switching between views
  useEffect(() => {
    setSelectedPages(new Set());
  }, [showTrash]);

  const filteredPages = (pages || []).filter(page => {
    // Filter by trash state
    const isDeleted = !!page.deletedAt;
    const matchesTrashView = showTrash ? isDeleted : !isDeleted;

    const matchesSearch = page.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'published' && page.isPublic) ||
      (filterStatus === 'draft' && !page.isPublic);
    return matchesTrashView && matchesSearch && matchesFilter;
  });

  // Safe window.open — validates the URL before opening to prevent DOMException
  const safeOpen = (url: string | undefined | null, context?: string) => {
    const trimmed = (url ?? '').trim();
    if (!trimmed) {
      console.error(`[Preview] Empty URL. Context: ${context}, tenantSlug=${tenantSlug}`);
      toast.error('Preview URL could not be resolved — no valid URL found.');
      return;
    }
    try {
      new URL(trimmed); // Validate it's a parseable URL
    } catch {
      console.error(`[Preview] Invalid URL: "${trimmed}". Context: ${context}, tenantSlug=${tenantSlug}`);
      toast.error(`Preview URL is invalid: ${trimmed}`);
      return;
    }
    window.open(trimmed, '_blank');
  };

  // Get a browser-accessible preview URL for a deployment.
  const getPreviewUrl = (pagePath: string, targetUrl?: string, storedPreviewUrl?: string | null, isShared?: boolean) => {
    // If it's a shared community engine, forcibly dynamically resolve it since stored URLs might just be the backend request origin.
    if (isShared && tenantSlug) {
      const resolved = resolvePreviewUrl(targetUrl, pagePath, isShared, tenantSlug);
      if (resolved) return resolved;
    }

    // 1. Prefer the stored previewUrl — it's the exact URL returned by the edge on publish
    //    and correctly reflects tenant-aware subdomain routing (tenant.frontbase.dev/slug)
    if (storedPreviewUrl) return storedPreviewUrl;

    // 2. Fallback to resolution 
    const fallbackResolved = resolvePreviewUrl(targetUrl, pagePath, isShared, tenantSlug);
    if (fallbackResolved) return fallbackResolved;

    // 3. Absolute fallback: use the current browser origin (reverse proxy handles routing)
    const cleanPath = pagePath.replace(/^\//, '');
    return `${window.location.origin}/${cleanPath}`;
  };

  const handlePageCreated = (pageId: string) => {
    setCurrentPageId(pageId);
    navigate(`/builder/${pageId}`);
    toast.success('Page created successfully!');
  };

  const handleEditPage = (pageId: string) => {
    setCurrentPageId(pageId);
    navigate(`/builder/${pageId}`);
  };

  const handlePreviewPage = (page: any) => {
    const pagePath = page.isHomepage ? '' : page.slug;
    // Try to use the first published deployment's stored previewUrl (tenant-aware)
    const publishedDep = page.deployments?.find((d: any) => d.status === 'published');
    const url = getPreviewUrl(pagePath, publishedDep?.target?.url, publishedDep?.previewUrl, publishedDep?.target?.is_shared);
    safeOpen(url, `handlePreviewPage slug=${page.slug} isShared=${publishedDep?.target?.is_shared} targetUrl=${publishedDep?.target?.url} storedPreviewUrl=${publishedDep?.previewUrl}`);
  };

  const handleSyncAllTargets = async (pageId: string) => {
    try {
      // Fetch active full-scope engines and publish in batch
      const response = await fetch('/api/edge-engines/active/by-scope/full');
      const engines = await response.json();
      if (!Array.isArray(engines) || engines.length === 0) {
        toast.error('No active deployment targets found');
        return;
      }
      const result = await publishPageToTargets(pageId, engines.map((eng: any) => eng.id));
      if (result) {
        const succeeded = result.results?.filter((r: any) => r.success) || [];
        const failed = result.results?.filter((r: any) => !r.success) || [];
        if (succeeded.length > 0) toast.success(`Synced to ${succeeded.length} target(s)`);
        if (failed.length > 0) toast.error(`Failed to sync ${failed.length} target(s)`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to sync targets');
    }
  };

  const handleSyncTarget = async (pageId: string, engineId: string) => {
    await publishPageToTarget(pageId, engineId);
    await loadPagesFromDatabase(false, true);
    toast.success('Target synced');
  };

  const handleUnpublishTarget = async (pageId: string, engineId: string) => {
    await unpublishPageFromTarget(pageId, engineId);
  };

  const handleDeletePage = async (pageId: string) => {
    if (pages.length <= 1) {
      toast.error('Cannot delete the last page');
      return;
    }

    try {
      await deletePage(pageId);
      toast.success('Page deleted successfully!');
    } catch (error) {
      toast.error('Failed to delete page');
    }
  };

  const handleDuplicatePage = async (page: any) => {
    try {
      // Persist via createPageInDatabase (POSTs). The previous call to the
      // in-memory createPage made the copy vanish on refresh.
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = page;
      await createPageInDatabase({
        ...rest,
        name: `${page.name} (Copy)`,
        slug: `${page.slug}-copy`,
        isHomepage: false,
      });

      toast.success('Page duplicated successfully!');
    } catch (error) {
      toast.error('Failed to duplicate page');
    }
  };

  const handleExportPage = (page: any) => {
    const envelope: PageExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      page: {
        name: page.name,
        slug: page.slug,
        title: page.title,
        description: page.description,
        keywords: page.keywords,
        isHomepage: page.isHomepage ?? false,
        containerStyles: page.containerStyles,
        layoutData: page.layoutData,
      },
    };

    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.slug}.frontbase.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Page exported successfully!');
  };

  // Multiselect handlers
  const togglePageSelection = (pageId: string) => {
    setSelectedPages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pageId)) {
        newSet.delete(pageId);
      } else {
        newSet.add(pageId);
      }
      return newSet;
    });
  };

  const selectAllPages = () => {
    if (selectedPages.size === filteredPages.length) {
      setSelectedPages(new Set());
    } else {
      setSelectedPages(new Set(filteredPages.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    const pagesToDelete = Array.from(selectedPages);

    // Don't allow deleting all pages
    const remainingPages = pages.filter(p => !selectedPages.has(p.id) && !p.deletedAt);
    if (remainingPages.length === 0 && !showTrash) {
      toast.error('Cannot delete all pages. At least one page must remain.');
      setShowBulkDeleteDialog(false);
      return;
    }

    try {
      if (showTrash) {
        // Permanent delete
        await Promise.all(pagesToDelete.map(id => permanentDeletePage(id)));
        toast.success(`Permanently deleted ${pagesToDelete.length} pages`);
      } else {
        // Move to trash
        await Promise.all(pagesToDelete.map(id => deletePage(id)));
        toast.success(`Moved ${pagesToDelete.length} pages to trash`);
      }
      setSelectedPages(new Set());
    } catch (error) {
      toast.error('Failed to delete some pages');
    }
    setShowBulkDeleteDialog(false);
  };

  const handleBulkRestore = async () => {
    const pagesToRestore = Array.from(selectedPages);
    try {
      await Promise.all(pagesToRestore.map(id => restorePage(id)));
      toast.success(`Restored ${pagesToRestore.length} pages`);
      setSelectedPages(new Set());
    } catch (error) {
      toast.error('Failed to restore some pages');
    }
  };

  const handleBulkPublish = async (targetId: string) => {
    setIsBulkPublishing(true);
    try {
      const pageIds = Array.from(selectedPages);
      let successCount = 0;
      let failCount = 0;

      for (const pageId of pageIds) {
        try {
          const result = await publishPageToTarget(pageId, targetId);
          if (result) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) toast.success(`Published ${successCount} page(s) successfully`);
      if (failCount > 0) toast.error(`Failed to publish ${failCount} page(s)`);
      setSelectedPages(new Set());
      await loadPagesFromDatabase(false, true);
    } catch (err: any) {
      toast.error(err?.message || 'Bulk publish failed');
    } finally {
      setIsBulkPublishing(false);
    }
  };

  const handleBulkExport = () => {
    const pagesToExport = pages.filter(p => selectedPages.has(p.id));
    for (const page of pagesToExport) {
      handleExportPage(page);
    }
    toast.success(`Exported ${pagesToExport.length} page(s)`);
  };

  // --- Badge computation helpers ---
  const getPageBadges = (page: any) => {
    const badges: { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }[] = [];

    if (page.isHomepage) {
      badges.push({ label: 'Homepage', variant: 'outline' });
    }

    const hasDeployments = page.deployments && page.deployments.length > 0;
    const hasAnyPublished = hasDeployments && page.deployments.some((d: any) => d.status === 'published');

    if (hasAnyPublished) {
      // Actually deployed to at least one target
      badges.push({ label: 'Live', variant: 'default', className: 'bg-emerald-600 hover:bg-emerald-700' });
      if (page.hasUnpublishedChanges) {
        badges.push({ label: 'Changes pending', variant: 'secondary', className: 'bg-amber-100 text-amber-800 border-amber-300' });
      }
    } else if (hasDeployments) {
      // Has deployments but none are "published" (all failed or pending)
      badges.push({ label: 'Deploy failed', variant: 'destructive' });
    } else {
      // Never deployed
      badges.push({ label: 'Not deployed', variant: 'secondary' });
    }

    return badges;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{showTrash ? 'Trashed Pages' : 'Pages'}</h1>
          <p className="text-muted-foreground">
            {showTrash ? 'Pages will be permanently deleted after 14 days' : 'Manage your website pages and content'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showTrash ? "secondary" : "ghost"}
            onClick={() => setShowTrash(!showTrash)}
            className="gap-2"
          >
            <Trash className="h-4 w-4" />
            {showTrash ? 'View Pages' : 'Trash'}
          </Button>
          {!showTrash && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Page
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-[300px]"
            />
          </div>
        </div>

        {/* Bulk actions */}
        {filteredPages.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllPages}
              className="gap-2"
            >
              {selectedPages.size === filteredPages.length ? (
                <CheckSquare className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {selectedPages.size === filteredPages.length ? 'Deselect All' : 'Select All'}
            </Button>

            {selectedPages.size > 0 && (
              <>
                {!showTrash && (
                  <>
                    {/* Bulk Publish */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPublishDialog(true)}
                      disabled={isBulkPublishing}
                      className="gap-2"
                    >
                      <Globe className="h-4 w-4" />
                      {isBulkPublishing ? 'Publishing...' : `Publish (${selectedPages.size})`}
                    </Button>

                    {/* Bulk Export */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkExport}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export ({selectedPages.size})
                    </Button>
                  </>
                )}

                {showTrash && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkRestore}
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restore ({selectedPages.size})
                  </Button>
                )}
                <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      {showTrash ? 'Delete Forever' : 'Trash'} ({selectedPages.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {showTrash ? 'Permanently Delete Pages?' : 'Move Pages to Trash?'}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {showTrash
                          ? `This will permanently delete ${selectedPages.size} pages. This action cannot be undone.`
                          : `This will move ${selectedPages.size} pages to trash. You can restore them later.`}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleBulkDelete}
                        className={showTrash ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
                      >
                        {showTrash ? 'Delete Forever' : 'Move to Trash'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPages.map((page) => {
          const badges = getPageBadges(page);

          return (
            <Card
              key={page.id}
              className={`hover:shadow-md transition-shadow relative ${selectedPages.has(page.id) ? 'ring-2 ring-primary' : ''}`}
            >
              {/* Checkbox for multiselect */}
              <div className="absolute top-3 left-3 z-10">
                <Checkbox
                  checked={selectedPages.has(page.id)}
                  onCheckedChange={() => togglePageSelection(page.id)}
                />
              </div>

              <CardHeader className="pb-3 pl-10">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{page.name}</CardTitle>
                    <CardDescription>{page.isHomepage ? '/' : `/${page.slug}`}</CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {showTrash ? (
                        <>
                          <DropdownMenuItem onClick={() => restorePage(page.id)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Restore
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Forever
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Permanently Delete Page?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the page and all its data.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => permanentDeletePage(page.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete Forever
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      ) : (
                        <>
                          <DropdownMenuItem onClick={() => handleEditPage(page.id)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicatePage(page)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExportPage(page)}>
                            <Download className="mr-2 h-4 w-4" />
                            Export
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {page.isPublic && (
                            <DropdownMenuItem onClick={() => handleSyncAllTargets(page.id)}>
                              <Globe className="mr-2 h-4 w-4" />
                              Publish to All Targets
                            </DropdownMenuItem>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Page?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will move the page to trash. You can restore it later or permanently delete it.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeletePage(page.id)}>
                                  Move to Trash
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {showTrash ? (
                      <Badge variant="destructive">Trashed</Badge>
                    ) : (
                      badges.map((badge, i) => (
                        <Badge key={i} variant={badge.variant} className={badge.className}>
                          {badge.label}
                        </Badge>
                      ))
                    )}
                  </div>

                  {/* Deployments list (only for full edge engines where we published) */}
                  {!showTrash && page.deployments && page.deployments.length > 0 && (
                    <div className="flex flex-col gap-2 mt-4">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Targets</span>
                      {page.deployments.map((dep: any) => (
                        <div key={dep.id} className="flex items-center justify-between text-sm bg-muted/30 p-2 rounded-md border">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{dep.target?.name || 'Unknown'}</span>
                            <Badge
                              variant={dep.status === 'failed' ? 'destructive' : 'outline'}
                              className={`text-[10px] px-1.5 py-0 h-4 ${dep.status === 'published' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : ''}`}
                            >
                              {dep.status}
                            </Badge>
                          </div>
                          <div className="flex gap-1">
                            {dep.status === 'published' && dep.target?.url && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                              onClick={() => safeOpen(getPreviewUrl(page.isHomepage ? '' : page.slug, dep.target?.url, dep.previewUrl, dep.target?.is_shared), `inline slug=${page.slug} isShared=${dep.target?.is_shared} targetUrl=${dep.target?.url} storedPreviewUrl=${dep.previewUrl}`)}
                              >
                                Preview
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleSyncTarget(page.id, dep.engineId)}
                            >
                              {dep.status === 'failed' ? 'Retry' : 'Sync'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => handleUnpublishTarget(page.id, dep.engineId)}
                            >
                              Unpublish
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => handleEditPage(page.id)}
                      className="flex-1"
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>

                    {(!showTrash && !page.hasUnpublishedChanges && page.isPublic) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePreviewPage(page)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoadingPages ? (
        <div className="text-center py-12">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
            <FileText className="h-12 w-12 text-muted-foreground animate-pulse" />
          </div>
          <h3 className="text-lg font-semibold">Loading pages...</h3>
          <p className="text-muted-foreground">
            Fetching your pages from the database
          </p>
        </div>
      ) : filteredPages.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
            <FileText className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No pages found</h3>
          <p className="text-muted-foreground">
            {searchQuery ? 'Try adjusting your search criteria' : 'Get started by creating your first page'}
          </p>
        </div>
      ) : null}

      <CreatePageDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onPageCreated={handlePageCreated}
      />

      <EdgePublishDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
        pageIds={Array.from(selectedPages)}
        onPublish={handleBulkPublish}
      />
    </div>
  );
};
