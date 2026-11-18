import {canShowTemplateInstaller} from '@/lib/templateInstallerAccess';
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
import { Search, MoreHorizontal, Edit, Trash2, FileText, RotateCcw, CheckSquare, Square } from 'lucide-react';
import { PageExportEnvelope } from '@/types/page-export';
import { toast } from 'sonner';

import {InstallTemplateDialog} from './InstallTemplateDialog';
import { CreatePageDialog } from './CreatePageDialog';
import { EdgePublishDialog } from './settings/shared/EdgePublishDialog';
import { PagesWorkspace } from './pages-workspace/PagesWorkspace';

export const PagesPanel: React.FC = () => {
  const navigate = useNavigate();
  const { pages, createPageInDatabase, deletePage, restorePage, permanentDeletePage, setCurrentPageId, loadPagesFromDatabase, publishPageToTarget, unpublishPageFromTarget } = useBuilderStore(useShallow(s => ({
    pages: s.pages,
    createPageInDatabase: s.createPageInDatabase,
    deletePage: s.deletePage,
    restorePage: s.restorePage,
    permanentDeletePage: s.permanentDeletePage,
    setCurrentPageId: s.setCurrentPageId,
    loadPagesFromDatabase: s.loadPagesFromDatabase,
    publishPageToTarget: s.publishPageToTarget,
    unpublishPageFromTarget: s.unpublishPageFromTarget
  })));
  const { isAuthenticated, isLoading, tenant, user } = useAuthStore();
  const tenantSlug = tenant?.slug || user?.tenant_slug;
  const { searchQuery, setSearchQuery, filterStatus } = useDashboardStore();
  const [isLoadingPages, setIsLoadingPages] = useState(true);
  const [showTrash, setShowTrash] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInstallTemplate,setShowInstallTemplate]=useState(false);
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

  const handlePageCreated = (pageId: string) => {
    setCurrentPageId(pageId);
    navigate(`/builder/${pageId}`);
    toast.success('Page created successfully!');
  };

  const handleEditPage = (pageId: string) => {
    setCurrentPageId(pageId);
    navigate(`/builder/${pageId}`);
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

  return (
    <div className="space-y-6">
      <InstallTemplateDialog key={`${tenantSlug??'_root'}:${user?.id??'anonymous'}`} open={showInstallTemplate} onOpenChange={setShowInstallTemplate} onInstalled={()=>{void loadPagesFromDatabase(false,true);}} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{showTrash ? 'Trashed Pages' : 'Pages'}</h1>
          <p className="text-muted-foreground">
            {showTrash ? 'Pages will be permanently deleted after 14 days' : 'Manage your website pages and content'}
          </p>
        </div>
        {showTrash && <Button variant="outline" size="sm" onClick={()=>setShowTrash(false)}>View pages</Button>}
      </div>

      {showTrash && <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-full sm:w-[300px]"
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

                {(
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
                      {'Delete Forever'} ({selectedPages.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {'Permanently Delete Pages?'}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {`This will permanently delete ${selectedPages.size} pages. This action cannot be undone.`}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleBulkDelete}
                        className={"bg-destructive text-destructive-foreground hover:bg-destructive/90"}
                      >
                        {'Delete Forever'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        )}
      </div>

      }
      {!showTrash && isAuthenticated && <PagesWorkspace key={`${tenantSlug ?? '_root'}:${user?.id ?? ''}:${user?.role ?? ''}`}
        scope={`${tenantSlug ?? '_root'}:${user?.id ?? ''}`} pages={pages} search={searchQuery} filterStatus={filterStatus}
        onSearchChange={setSearchQuery} onCreatePage={()=>setShowCreateDialog(true)} onShowTrash={()=>setShowTrash(true)}
        onInstallTemplate={canShowTemplateInstaller(user?.role)?()=>setShowInstallTemplate(true):undefined}
        edit={handleEditPage}
        actions={page => <>
          <DropdownMenuItem onClick={() => handleDuplicatePage(page)}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportPage(page)}>Export</DropdownMenuItem>
          {!page.layoutData?.root?.siteConfiguration && !page.layoutData?.root?.directoryLanding && <DropdownMenuItem onClick={() => {setSelectedPages(new Set([page.id]));setShowPublishDialog(true);}}>Publish to target</DropdownMenuItem>}
          {page.deployments?.map((dep: any) => <React.Fragment key={dep.id}>
            <DropdownMenuItem onClick={() => handleSyncTarget(page.id, dep.engineId)}>Sync: {dep.target?.name || 'Target'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleUnpublishTarget(page.id, dep.engineId)}>Unpublish: {dep.target?.name || 'Target'}</DropdownMenuItem>
          </React.Fragment>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => handleDeletePage(page.id)}>Move to trash</DropdownMenuItem>
        </>}
      />}
      {showTrash && <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPages.map((page) => {

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
                      {(
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
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(
                      <Badge variant="destructive">Trashed</Badge>
                    )}
                  </div>

                  {/* Deployments list (only for full edge engines where we published) */}

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => handleEditPage(page.id)}
                      className="flex-1"
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>

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

      </>}

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
