import React, { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { FrontbaseBuilder } from '@/components/builder/FrontbaseBuilder';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { toast } from '@/hooks/use-toast';
import { registerBuilderSw } from '@/sw/registerBuilderSw';

// Phase E: the builder-scoped SW registration is idempotent and shared across
// every BuilderPage mount, so module scope (run once per page load) is the
// correct place — registering inside the component effect would re-run on every
// route change and add noise.
let builderSwRegistered = false;

const BuilderPage: React.FC = () => {
  const { pageId } = useParams<{ pageId: string }>();
  const {
    pages,
    setCurrentPageId,
    currentPageId,
    loadPagesFromDatabase,
    createPageInDatabase,
    isPagesLoading,
    isInitialized
  } = useBuilderStore(useShallow(s => ({
    pages: s.pages,
    setCurrentPageId: s.setCurrentPageId,
    currentPageId: s.currentPageId,
    loadPagesFromDatabase: s.loadPagesFromDatabase,
    createPageInDatabase: s.createPageInDatabase,
    isPagesLoading: s.isPagesLoading,
    isInitialized: s.isInitialized
  })));

  useEffect(() => {
    // Load pages from database on component mount
    const initializeBuilder = async () => {
      try {
        await loadPagesFromDatabase();
      } catch (error) {
        console.error('Failed to load pages:', error);
        toast({
          title: "Error loading pages",
          description: "Failed to load pages from database",
          variant: "destructive"
        });
      }
    };

    initializeBuilder();
  }, [loadPagesFromDatabase]);

  useEffect(() => {
    // Phase E: register the builder-scoped Service Worker so canvas re-renders
    // are served LOCALLY (no /builder/api/reRender round-trip). Fire-and-forget
    // — failure is non-fatal; iframeBridge falls back to the worker endpoint.
    if (builderSwRegistered) return;
    builderSwRegistered = true;
    void registerBuilderSw().then((result) => {
      if (!result.ok && result.error !== 'service-worker-unsupported') {
        // Log only — never block the builder. The fallback render path still works.
        console.warn('[builder-sw] registration failed:', result.error);
      }
    });
  }, []);

  useEffect(() => {
    if (pageId && pageId !== currentPageId) {
      // Check if page exists in loaded pages
      const pageExists = pages.find(page => page.id === pageId);
      if (pageExists) {
        setCurrentPageId(pageId);
      } else if (pages.length > 0) {
        // Page doesn't exist in database but we have pages loaded
        // Check if it exists locally (might need to be created in database)
        const localPageExists = pages.find(page => page.id === pageId);
        if (localPageExists) {
          setCurrentPageId(pageId);
        }
      }
    }
  }, [pageId, setCurrentPageId, currentPageId, pages]);

  if (isPagesLoading || !isInitialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading builder...</p>
        </div>
      </div>
    );
  }

  // If no pageId or page doesn't exist, redirect to dashboard
  if (!pageId || !pages.find(page => page.id === pageId)) {
    return <Navigate to="/pages" replace />;
  }

  return <FrontbaseBuilder />;
};

export default BuilderPage;