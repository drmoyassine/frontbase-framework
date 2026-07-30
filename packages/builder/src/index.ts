/**
 * @frontbase/builder — the unified runtime builder.
 *
 * RULE 1: this package NEVER imports @frontbase/edge-infra (no drivers/secrets).
 * It uses @frontbase/edge-core for rendering (the SAME eSSR engine for builder and published pages).
 *
 * The registry provides component definitions with editing metadata.
 * The canvas model manages component tree state.
 * The editing layer (vanilla TS) provides selection, CRUD, and property panel.
 *
 * Migration path: React components are being replaced with vanilla TS that uses
 * the unified eSSR runtime from @frontbase/edge-core.
 */

// === Registry (NEW: unified runtime) ===
// Component registry with eSSR renderers and editing metadata
export { globalRegistry, ComponentRegistry, registerComponents } from './registry/index.js';
export type {
    ComponentDefinition,
    EditableSchema,
    PropDefinition,
    PropType,
    SelectOption,
    ComponentCategory,
    ValidationResult,
    AgentComponentExport,
    ComponentNode,
    ComponentTree,
} from './registry/EditableSchema.js';

// === Draft Storage (kept: SQLite-WASM) ===
export { localDraftProvider } from './draft/localDraftProvider.js';
export type { DraftRow } from './draft/localDraftProvider.js';

// === Canvas Model (kept: framework-agnostic state) ===
export {
    emptyCanvas, addNode, moveNode, removeNode, updateProps, selectNode,
} from './canvas/model.js';

// === Editing Layer (NEW: unified runtime) ===
// Vanilla TypeScript editing layer (no React)
export {
    BuilderEditor,
    SelectionTracker,
    PropertyPanel,
    TreeView,
    Editor,
} from './editing/index.js';
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
    EditorConfig,
} from './editing/index.js';

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
} from './editing/index.js';

// Drag & Drop utilities
export {
    DragDropManager,
    makeDraggable,
    setupDropZone,
    calculateDropIndex,
    validateDrop,
} from './editing/index.js';
export type { DragState, DropZoneConfig, DropPosition } from './editing/index.js';

// === Builder Engine (NEW: unified runtime) ===
// Hono app serving the builder UI with editing capabilities
export { createBuilderEngine } from './BuilderEngine.js';
export type { BuilderEngineOptions, ComponentUpdate } from './BuilderEngine.js';

// === React Components REMOVED ===
// Replaced with vanilla TS BuilderCanvas using eSSR renderPage from @frontbase/edge-core
// The builder canvas now uses the SAME renderPage that published pages use.
// See canvas/BuilderCanvas.ts for the unified runtime implementation.
