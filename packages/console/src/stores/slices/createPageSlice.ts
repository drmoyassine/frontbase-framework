import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Page } from '@/types/builder';
import { BuilderState } from '../builder';
import { toast } from '@/hooks/use-toast';
import { track } from '@/lib/analytics';
import { getPages, createPage as createPageApi, updatePage as updatePageApi, deletePage as deletePageApi, restorePage as restorePageApi, permanentDeletePage as permanentDeletePageApi } from '../../services/pages-api';
import { validatePageForSave, validatePageForPublish, type ValidationError } from '@/lib/validation/pageValidation';

// Module-level in-flight dedup — prevents concurrent callers from
// triggering redundant page loads (App.tsx + BuilderPage.tsx + PagesPanel.tsx)
let _loadPagesPromise: Promise<void> | null = null;
// Monotonic generation counter — the trash (includeDeleted) load intentionally
// runs outside `_loadPagesPromise`, so without ordering protection a slower
// active-only load (App.tsx mount / StrictMode double-invoke) could resolve
// AFTER the trash load and clobber `pages` back to active-only, making the
// Trash view render empty. A load only commits if it is still the newest.
let _loadGen = 0;

export interface PageSlice {
    pages: Page[];
    currentPageId: string | null;
    isPagesLoading: boolean;
    error: string | null;

    createPage: (page: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>) => void;
    updatePage: (id: string, updates: Partial<Page>) => void;
    deletePage: (id: string) => Promise<void>;
    restorePage: (id: string) => Promise<void>;
    permanentDeletePage: (id: string) => Promise<void>;
    setCurrentPage: (id: string) => void;
    setCurrentPageId: (id: string | null) => void;

    // Database integration
    savePageToDatabase: (pageId: string) => Promise<void>;

    publishPageToTarget: (pageId: string, engineId: string) => Promise<string | undefined>;
    publishPageToTargets: (pageId: string, engineIds: string[]) => Promise<{ success: boolean; message: string; results: Array<{ engineId: string; name: string; success: boolean; error?: string }> } | undefined>;
    unpublishPageFromTarget: (pageId: string, engineId: string) => Promise<void>;
    togglePageVisibility: (pageId: string) => Promise<void>;
    loadPagesFromDatabase: (includeDeleted?: boolean, force?: boolean) => Promise<void>;
    createPageInDatabase: (pageData: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string | null>;

    // Sprint 2: required-field / form-binding validation
    validatePageForSave: (pageId: string) => { valid: boolean; errors: ValidationError[] };
    validatePageForPublish: (pageId: string) => { valid: boolean; errors: ValidationError[] };
}

export const createPageSlice: StateCreator<BuilderState, [], [], PageSlice> = (set, get) => ({
    pages: [],
    currentPageId: null,
    isPagesLoading: false,
    error: null,

    // `setCurrentPage` is kept as a back-compat alias for `setCurrentPageId`
    // (PageSelector.tsx still destructures the old name). Both set the same
    // slice of state.
    setCurrentPage: (id) => set({ currentPageId: id }),
    setCurrentPageId: (id) => set({ currentPageId: id }),

    createPage: (pageData) => {
        const newPage: Page = {
            ...pageData,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        set((state) => ({
            pages: [...state.pages, newPage],
            currentPageId: newPage.id
        }));
    },

    updatePage: (id, updates) => set((state) => ({
        pages: state.pages.map(page =>
            page.id === id
                ? { ...page, ...updates, updatedAt: new Date().toISOString() }
                : page
        ),
        hasUnsavedChanges: true
    })),

    deletePage: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            await deletePageApi(id);

            set((state) => ({
                pages: state.pages.filter(page => page.id !== id),
                currentPageId: state.currentPageId === id ? null : state.currentPageId
            }));

            toast({
                title: "Page moved to trash",
                description: "Page has been moved to trash successfully"
            });
        } catch (error: any) {
            toast({
                title: "Error deleting page",
                description: error.response?.data?.message || error.message || "Failed to delete page",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    restorePage: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            await restorePageApi(id);

            // Reload (force=true) so the page moves out of trash and back into
            // the active list, reflecting backend truth.
            await get().loadPagesFromDatabase(false, true);

            toast({
                title: "Page restored",
                description: "Page has been restored from trash"
            });
        } catch (error: any) {
            toast({
                title: "Error restoring page",
                description: error.response?.data?.message || error.message || "Failed to restore page",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    permanentDeletePage: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            await permanentDeletePageApi(id);

            set((state) => ({
                pages: state.pages.filter(page => page.id !== id),
                currentPageId: state.currentPageId === id ? null : state.currentPageId
            }));

            toast({
                title: "Page permanently deleted",
                description: "Page has been permanently deleted"
            });
        } catch (error: any) {
            toast({
                title: "Error deleting page",
                description: error.response?.data?.message || error.message || "Failed to permanently delete page",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    savePageToDatabase: async (pageId: string) => {
        const { pages, setSaving, setUnsavedChanges } = get();
        const page = pages.find(p => p.id === pageId);
        if (!page) return;

        // Sprint 2: pre-save validation (warnings only — never blocks saving)
        const validation = validatePageForSave(page);
        if (!validation.valid) {
            // Validation issues are surfaced in the UI; intentionally not logged
            // to the console on every save.
        }

        setSaving(true);
        try {
            // Serialize containerStyles into layoutData.root for database storage
            const sanitizedPage = { ...page };

            if (sanitizedPage.containerStyles) {
                // Ensure layoutData exists
                if (!sanitizedPage.layoutData) {
                    sanitizedPage.layoutData = { content: [], root: {} };
                }

                // Move containerStyles into layoutData.root
                sanitizedPage.layoutData = {
                    ...sanitizedPage.layoutData,
                    root: {
                        ...sanitizedPage.layoutData.root,
                        containerStyles: sanitizedPage.containerStyles
                    }
                };

                // Remove top-level containerStyles (not in DB schema)
                delete sanitizedPage.containerStyles;
            }

            const updatedPage = await updatePageApi(pageId, sanitizedPage);

            // Merge the backend's updated contentHash + deployments into Zustand.
            // Also refresh hasUnpublishedChanges so the builder status badge stays
            // honest between a save and the next full reload — the backend recomputes
            // it (by comparing the new content hash vs each published deployment's hash)
            // and returns it on the update response, so a saved-but-not-republished
            // page correctly reads as "Modified" instead of regressing to "Published".
            if (updatedPage) {
                const mergeFields: Record<string, unknown> = {};
                if (updatedPage.contentHash) mergeFields.contentHash = updatedPage.contentHash;
                if (updatedPage.deployments) mergeFields.deployments = updatedPage.deployments;
                if (typeof updatedPage.hasUnpublishedChanges === 'boolean') {
                    mergeFields.hasUnpublishedChanges = updatedPage.hasUnpublishedChanges;
                }
                if (Object.keys(mergeFields).length > 0) {
                    set((state) => ({
                        pages: state.pages.map(p =>
                            p.id === pageId ? { ...p, ...mergeFields } : p
                        ),
                    }));
                }
            }

            setUnsavedChanges(false);

            toast({
                title: "Page saved",
                description: "Page has been saved successfully"
            });
        } catch (error: any) {
            console.error('❌ [Store] Save failed:', error);
            toast({
                title: "Error saving page",
                description: error.response?.data?.message || error.message || "Failed to save page",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    publishPageToTarget: async (pageId: string, engineId: string) => {
        const { pages, updatePage, setSaving, setUnsavedChanges, savePageToDatabase } = get();
        const page = pages.find(p => p.id === pageId);
        if (!page) return;

        // Sprint 2: pre-publish validation (blocks publication of misconfigured pages)
        const validation = validatePageForPublish(page);
        if (!validation.valid) {
            toast({
                title: "Cannot publish page",
                description: validation.errors.map(e => e.message).join('; '),
                variant: "destructive",
            });
            return;
        }

        setSaving(true);
        try {
            // First save any unsaved changes
            const { hasUnsavedChanges } = get();
            if (hasUnsavedChanges) {
                await savePageToDatabase(pageId);
            }

            // Call the targeted publish endpoint
            const response = await fetch(`/api/pages/${pageId}/publish/${engineId}/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const result = await response.json();

            if (result.success) {
                setUnsavedChanges(false);

                // Reload so the per-page `hasUnpublishedChanges` flag (and the
                // updated deployments list) reflects backend truth — otherwise
                // the "Modified" badge lingers after a successful single-target
                // publish. Mirrors the batch path below.
                await get().loadPagesFromDatabase(false, true);

                track('page_published', { page_id: pageId, engine_id: engineId, mode: 'single' });

                return result.previewUrl;
            } else {
                throw new Error(result.error || 'Failed to publish page to target');
            }
        } catch (error: any) {
            console.error('Publish error:', error);
            toast({
                title: "Error publishing page",
                description: error.message || "Failed to publish page to specific Edge Engine",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    publishPageToTargets: async (pageId: string, engineIds: string[]) => {
        const { pages, setSaving, setUnsavedChanges, savePageToDatabase } = get();
        const page = pages.find(p => p.id === pageId);
        if (!page || engineIds.length === 0) return;

        // Sprint 2: pre-publish validation (blocks publication of misconfigured pages)
        const validation = validatePageForPublish(page);
        if (!validation.valid) {
            toast({
                title: "Cannot publish page",
                description: validation.errors.map(e => e.message).join('; '),
                variant: "destructive",
            });
            return;
        }

        setSaving(true);
        try {
            // Save once if needed
            const { hasUnsavedChanges } = get();
            if (hasUnsavedChanges) {
                await savePageToDatabase(pageId);
            }

            // Single batch request
            const response = await fetch(`/api/pages/${pageId}/publish-batch/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ engine_ids: engineIds }),
            });

            const result = await response.json();

            if (result.results) {
                setUnsavedChanges(false);
                // Reload once to get updated deployments
                await get().loadPagesFromDatabase(false, true);
                track('page_published', {
                    page_id: pageId,
                    target_count: engineIds.length,
                    mode: 'batch',
                });
            }

            return result;
        } catch (error: any) {
            console.error('Batch publish error:', error);
            toast({
                title: "Error publishing page",
                description: error.message || "Failed to publish page to targets",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    unpublishPageFromTarget: async (pageId: string, engineId: string) => {
        const { setSaving } = get();
        setSaving(true);

        try {
            const response = await fetch(`/api/pages/${pageId}/unpublish/${engineId}/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const result = await response.json();

            if (result.success) {
                // Reload pages to reflect the removed deployment
                get().loadPagesFromDatabase(false, true);

                toast({
                    title: "Target unpublished",
                    description: result.message || "Page has been removed from the target"
                });
            } else {
                throw new Error(result.error || 'Failed to unpublish from target');
            }
        } catch (error: any) {
            console.error('Unpublish error:', error);
            toast({
                title: "Error unpublishing",
                description: error.message || "Failed to unpublish page from target",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    togglePageVisibility: async (pageId: string) => {
        const { pages, updatePage, setSaving } = get();
        const page = pages.find(p => p.id === pageId);
        if (!page) return;

        setSaving(true);
        try {
            const newVisibility = !page.isPublic;
            updatePage(pageId, { isPublic: newVisibility });

            await updatePageApi(pageId, { ...page, isPublic: newVisibility });

            toast({
                title: "Page updated",
                description: `Page ${newVisibility ? 'published' : 'made private'}`
            });
        } catch (error: any) {
            toast({
                title: "Error updating page",
                description: error.response?.data?.message || error.message || "Failed to update page visibility",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    loadPagesFromDatabase: async (includeDeleted = false, force = false) => {
        // Skip if pages already loaded (handles sequential callers like BuilderPage after App.tsx)
        // force=true bypasses this check (used after publish/sync operations)
        if (!force && !includeDeleted && get().isInitialized && get().pages.length > 0) {
            return;
        }

        // In-flight dedup: concurrent callers share one promise
        if (!force && !includeDeleted && _loadPagesPromise) {
            await _loadPagesPromise;
            return;
        }

        const doLoad = async () => {
            const myGen = ++_loadGen;
            set({ isPagesLoading: true });
            try {
                const pagesRaw = await getPages(includeDeleted);
                // A newer load (e.g. the user toggled Trash again, or a force
                // reload) superseded this one while it was in flight — drop our
                // result so we never clobber fresh state with stale rows (the
                // classic "Trash renders empty" race: a slow active-only load
                // resolving after the trash load and wiping deleted rows).
                if (myGen !== _loadGen) return;
                const safePages = Array.isArray(pagesRaw) ? pagesRaw : [];

                // Deserialize containerStyles from layoutData.root to top-level
                const pages = safePages.map((page: any) => {
                    const layoutData = page.layoutData ?? page.layout_data ?? { content: [], root: {} };

                    // Extract containerStyles from layoutData.root
                    const containerStyles = layoutData?.root?.containerStyles;

                    return {
                        ...page,
                        isPublic: page.isPublic ?? page.is_public ?? false,
                        isHomepage: page.isHomepage ?? page.is_homepage ?? false,
                        layoutData,
                        containerStyles, // Expose at top level for easy access
                        createdAt: page.createdAt ?? page.created_at ?? new Date().toISOString(),
                        updatedAt: page.updatedAt ?? page.updated_at ?? new Date().toISOString(),
                        deletedAt: page.deletedAt ?? page.deleted_at ?? null,
                        contentHash: page.contentHash ?? page.content_hash,
                        hasUnpublishedChanges: page.hasUnpublishedChanges ?? page.has_unpublished_changes ?? false,
                        deployments: page.deployments || []
                    };
                }) as Page[];



                set({
                    pages: pages || [],
                    hasUnsavedChanges: false,
                    isInitialized: true
                });
            } catch (error: any) {
                if (myGen !== _loadGen) return;
                console.error('Failed to load pages:', error);
                toast({
                    title: "Error loading pages",
                    description: error.response?.data?.message || error.message || "Failed to load pages from database",
                    variant: "destructive"
                });
                set({ isInitialized: true });
            } finally {
                if (myGen === _loadGen) {
                    set({ isPagesLoading: false });
                    _loadPagesPromise = null;
                }
            }
        };

        // Route both the active-only and the trash (includeDeleted) loads
        // through the same in-flight promise so concurrent callers of either
        // flavor share one network round-trip instead of racing to overwrite
        // `pages`. The generation guard inside doLoad is the backstop that
        // ultimately decides whose result commits.
        _loadPagesPromise = doLoad();
        await _loadPagesPromise;
    },

    createPageInDatabase: async (pageData) => {
        const { setSaving } = get();
        setSaving(true);

        try {
            const newPage = await createPageApi(pageData);

            set((state) => ({
                pages: [...state.pages, newPage],
                hasUnsavedChanges: false
            }));

            toast({
                title: "Page created",
                description: "Page has been created successfully"
            });

            track('page_created', { page_id: newPage.id });

            return newPage.id;
        } catch (error: any) {
            toast({
                title: "Error creating page",
                description: error.response?.data?.message || error.message || "Failed to create page",
                variant: "destructive"
            });
            return null;
        } finally {
            setSaving(false);
        }
    },

    // Sprint 2: validation methods
    validatePageForSave: (pageId: string) => {
        const page = get().pages.find(p => p.id === pageId);
        if (!page) return { valid: false, errors: [{ field: 'page', message: 'Page not found' }] };
        return validatePageForSave(page);
    },

    validatePageForPublish: (pageId: string) => {
        const page = get().pages.find(p => p.id === pageId);
        if (!page) return { valid: false, errors: [{ field: 'page', message: 'Page not found' }] };
        return validatePageForPublish(page);
    },
});
