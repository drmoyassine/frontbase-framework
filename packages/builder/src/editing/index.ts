/**
 * @frontbase/builder/editing — Builder unified runtime editing layer.
 *
 * This is the vanilla TypeScript editing layer for the builder.
 * It provides:
 * - BuilderEditor (main class with state management)
 * - SelectionTracker (click-to-select with highlighting)
 * - PropertyPanel (schema-driven property editor)
 * - TreeView (component tree with CRUD operations)
 * - Client utilities (browser bundle API)
 *
 * RULE 1: This is vanilla TypeScript, no React.
 * RULE 2: All editing operates on renderPage output from @frontbase/edge-core.
 * RULE 3: Uses globalRegistry from @frontbase/builder/registry for component metadata.
 */

// Main editing classes
export { BuilderEditor } from './BuilderEditor.js';
export { SelectionTracker } from './SelectionTracker.js';
export { PropertyPanel } from './PropertyPanel.js';
export { TreeView } from './TreeView.js';

// Types
export type {
    EditorChangeEvent,
    EditorChangeCallback,
    ComponentRect,
    SelectionHighlight,
    PropertyChangeEvent,
    PropertyChangeCallback,
    TreeNode,
    DragDropContext,
    CanvasConfig,
    PropertyPanelConfig,
    TreeViewConfig,
    ComponentPosition,
} from './types.js';

// Client API (browser bundle)
export { Editor } from './client/index.js';
export type { EditorConfig } from './client/editor.js';

// Selection utilities
export {
    findComponentById,
    findAllComponents,
    queryComponentPositions,
    calculateDepth,
    findParentId,
    getComponentId,
    getComponentType,
    isComponent,
    getClosestComponent,
    getComponentPath,
    findCommonAncestor,
    createHighlightElement,
    highlightComponent,
    clearHighlight,
    clearAllHighlights,
    calculateInsertIndex,
    domToIframeCoordinates,
    isPointInRect,
    findComponentAtPoint,
} from './client/selection.js';

// Drag & Drop utilities
export {
    DragDropManager,
    makeDraggable,
    setupDropZone,
    calculateDropIndex,
    validateDrop,
} from './client/drag-drop.js';

export type { DragState, DropZoneConfig, DropPosition } from './client/drag-drop.js';
