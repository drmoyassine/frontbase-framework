import React, { useState } from 'react';
import { useBuilderStore, type Page } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { CanvasGrid } from './CanvasGrid';
import { ComponentBreadcrumb } from './ComponentBreadcrumb';
import { IframeCanvas } from './canvas/IframeCanvas';
import { CanvasOverlay } from './canvas/CanvasOverlay';
import { useSystemEdgeUrl } from './canvas/useSystemEdgeUrl';
import type { ComponentRect } from '@/lib/builder/iframeTypes';
import { cn } from '@/lib/utils';
import { Target, X } from 'lucide-react';

interface BuilderCanvasProps {
  page: Page;
}

// Viewport dimensions — industry standard sizes. Module-scoped so the record is
// not rebuilt on every render (it is static data keyed by viewport id).
const VIEWPORT_DIMENSIONS: Record<'mobile' | 'tablet' | 'desktop', { width: number; height: number }> = {
  mobile: { width: 375, height: 812 },    // iPhone 13 size
  tablet: { width: 768, height: 1024 },   // iPad size
  desktop: { width: 1200, height: 1400 }, // Better working height
};

/**
 * BuilderCanvas — the Phase D eSSR iframe canvas.
 *
 * The canvas is now a same-origin <iframe> (IframeCanvas) whose `srcdoc` is the
 * byte-identical eSSR output of POST /builder/api/reRender, plus a React
 * overlay sibling (CanvasOverlay) that owns selection/hover rectangles and all
 * @dnd-kit droppables. Selection, hover, and inline-edit are bridged through
 * the iframe contentDocument (see useIframeSelection / iframeInlineEdit).
 *
 * This component retains the viewport / zoom / device-frame chrome, the
 * scroll-target selection banner, the grid overlay, and the breadcrumb.
 */
export const BuilderCanvas: React.FC<BuilderCanvasProps> = ({ page }) => {
  const {
    selectedComponentId,
    setSelectedComponentId,
    isPreviewMode,
    currentViewport,
    zoomLevel,
    showDeviceFrame,
    showGrid,
    scrollTargetSelectionMode,
    exitScrollTargetMode
  } = useBuilderStore(useShallow(s => ({
    selectedComponentId: s.selectedComponentId,
    setSelectedComponentId: s.setSelectedComponentId,
    isPreviewMode: s.isPreviewMode,
    currentViewport: s.currentViewport,
    zoomLevel: s.zoomLevel,
    showDeviceFrame: s.showDeviceFrame,
    showGrid: s.showGrid,
    scrollTargetSelectionMode: s.scrollTargetSelectionMode,
    exitScrollTargetMode: s.exitScrollTargetMode
  })));

  // System-edge worker URL (production console is served from it → relative URL
  // is same-origin; dev falls back to this absolute URL if configured).
  const systemEdgeUrl = useSystemEdgeUrl();

  // Component rects (viewport-local to the iframe) + hovered id, published up
  // from IframeCanvas so the overlay can draw selection/hover/drop targets.
  const [rects, setRects] = useState<ComponentRect[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { width: viewportWidth } = VIEWPORT_DIMENSIONS[currentViewport];
  const scaleFactor = zoomLevel / 100;

  return (
    <div
      className={cn(
        "h-full p-8 bg-muted/30 transition-colors relative overflow-y-auto overflow-x-hidden",
        scrollTargetSelectionMode && "ring-2 ring-primary ring-inset"
      )}
      style={{ minHeight: '100%' }}
      onClick={(e) => {
        // Cancel selection mode if clicking outside the device frame.
        if (scrollTargetSelectionMode && e.target === e.currentTarget) {
          exitScrollTargetMode();
          return;
        }
        // Only deselect if clicking on the outer padding, not the canvas content.
        if (e.target === e.currentTarget && !isPreviewMode) {
          setSelectedComponentId(null);
        }
      }}
    >
      {/* Scroll Target Selection Mode Banner */}
      {scrollTargetSelectionMode && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-primary text-primary-foreground px-4 py-2 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            <span className="text-sm font-medium">Click on a section to set as scroll target</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              exitScrollTargetMode();
            }}
            className="p-1 hover:bg-primary-foreground/20 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Device Frame / Viewport Container.
          position: relative so the iframe (in-flow) and the overlay (absolute
          inset:0) share an origin inside the same transform-scaled wrapper —
          iframe-local coords map 1:1 to overlay coords at any zoom. */}
      <div
        className={cn(
          "mx-auto transition-all duration-300 relative w-full",
          showDeviceFrame && "shadow-2xl rounded-lg overflow-hidden bg-background"
        )}
        style={{
          maxWidth: `${viewportWidth}px`,
          transform: `scale(${scaleFactor})`,
          transformOrigin: 'top center'
        }}
      >
        {/* Grid overlay — pure background, pointer-events handled by CSS. */}
        {showGrid && <CanvasGrid visible={showGrid} />}

        {/* The eSSR presentation surface (srcdoc = reRender output). */}
        <IframeCanvas
          page={page}
          systemEdgeUrl={systemEdgeUrl}
          onRects={setRects}
          onHoveredId={setHoveredId}
        />

        {/* Interaction layer: selection / hover / drop targets / reorder handle. */}
        <CanvasOverlay page={page} rects={rects} hoveredId={hoveredId} />

        {/* Breadcrumb Navigation — shows ancestry when a component is selected. */}
        {!isPreviewMode && selectedComponentId && <ComponentBreadcrumb />}
      </div>
    </div>
  );
};
