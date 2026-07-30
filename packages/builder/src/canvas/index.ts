/**
 * Builder Canvas - eSSR-based visual editor canvas
 *
 * Main exports for the canvas package.
 */

// Main canvas class
export { BuilderCanvas, type BuilderCanvasConfig, type BuilderCanvasState } from './BuilderCanvas.js';

// Canvas model functions (pure, framework-agnostic)
export {
  emptyCanvas,
  addNode,
  moveNode,
  removeNode,
  updateProps,
  updateStyles,
  selectNode,
  findComponentById,
  getComponentsByType,
  getComponentPath,
  generateId
} from './model.js';

// Editing overlay
export {
  generateSelectionOverlay,
  generateHoverOverlay,
  generateDragGhost,
  clearOverlays,
  getElementBoundingBox,
  calculateSelectionBoxes,
  type SelectionBox,
  type OverlayConfig
} from './editing/overlay.js';

// Event handling
export {
  CanvasEventManager,
  type CanvasEvent,
  type CanvasEventHandler,
  type DragState,
  type EventManagerConfig
} from './editing/events.js';

// Re-export types from edge-core that are commonly used
export type { PageLayoutData, PageComponent, TemplateContext } from '@frontbase/edge-core';
