/**
 * Editing Layer Types — Shared types for the builder editing system.
 *
 * This file defines the types used across the editing layer:
 * - Component tree manipulation
 * - Selection tracking
 * - Property editing
 * - DOM integration
 */

import type { PageLayoutData, PageComponent } from '@frontbase/edge-core';
import type { ComponentDefinition, PropDefinition } from '../registry/EditableSchema.js';

/**
 * Change event emitted by the editor.
 */
export interface EditorChangeEvent {
    /** Type of change that occurred */
    type: 'select' | 'update' | 'add' | 'remove' | 'reorder' | 'load';
    /** ID of the affected component (if applicable) */
    componentId?: string;
    /** Previous state (before the change) */
    previous?: PageLayoutData;
    /** New state (after the change) */
    current: PageLayoutData;
    /** Selected component ID */
    selectedId: string | null;
}

/**
 * Callback for editor change events.
 */
export type EditorChangeCallback = (event: EditorChangeEvent) => void;

/**
 * Component rectangle in the canvas iframe.
 */
export interface ComponentRect {
    /** Component ID */
    id: string;
    /** Component type */
    type: string;
    /** Bounding rectangle relative to iframe */
    rect: DOMRect;
    /** Parent component ID (if nested) */
    parentId?: string;
    /** Depth in the tree */
    depth: number;
}

/**
 * Selection highlight configuration.
 */
export interface SelectionHighlight {
    /** Component ID */
    id: string;
    /** Highlight element */
    element: HTMLDivElement;
    /** Component rectangle */
    rect: ComponentRect;
}

/**
 * Property change event.
 */
export interface PropertyChangeEvent {
    /** Component ID */
    componentId: string;
    /** Property name */
    propertyName: string;
    /** New value */
    value: unknown;
    /** Previous value */
    previousValue?: unknown;
    /**
     * Where to merge this value (Phase 4 styling surface):
     * - 'prop' (default): into component.props
     * - 'stylesData': into component.stylesData.values (applied as inline CSS on
     *   both canvas and published).
     */
    styleTarget?: 'prop' | 'stylesData';
}

/**
 * Property change callback.
 */
export type PropertyChangeCallback = (event: PropertyChangeEvent) => void;

/**
 * Tree node structure for TreeView.
 */
export interface TreeNode {
    /** Component ID */
    id: string;
    /** Component type */
    type: string;
    /** Component props */
    props: Record<string, unknown>;
    /** Display name (type + ID) */
    displayName: string;
    /** Whether this node is selected */
    selected: boolean;
    /** Whether this node is expanded (for tree view) */
    expanded: boolean;
    /** Child nodes */
    children: TreeNode[];
    /** Depth in the tree */
    depth: number;
}

/**
 * Drag and drop context.
 */
export interface DragDropContext {
    /** Component being dragged */
    draggedId: string | null;
    /** Drop target ID */
    targetId: string | null;
    /** Drop position ('before', 'after', 'inside') */
    position: 'before' | 'after' | 'inside' | null;
    /** Ghost element for visual feedback */
    ghostElement?: HTMLDivElement;
}

/**
 * Canvas configuration.
 */
export interface CanvasConfig {
    /** Iframe element for the canvas */
    iframe: HTMLIFrameElement;
    /** Overlay element for selection highlights */
    overlay: HTMLElement;
    /** Container for the canvas */
    container: HTMLElement;
}

/**
 * Property panel configuration.
 */
export interface PropertyPanelConfig {
    /** Container element for the property panel */
    container: HTMLElement;
    /** Callback when a property changes */
    onPropertyChange: PropertyChangeCallback;
}

/**
 * Tree view configuration.
 */
export interface TreeViewConfig {
    /** Container element for the tree view */
    container: HTMLElement;
    /** Callback when a node is selected */
    onSelect: (id: string | null) => void;
    /** Callback when a node is added */
    onAdd: (parentId: string | null, index: number) => void;
    /** Callback when a node is deleted */
    onDelete: (id: string) => void;
    /** Callback when a node is reordered */
    onReorder: (id: string, newIndex: number) => void;
}

/**
 * Component position result from SelectionTracker.
 */
export interface ComponentPosition {
    /** Component ID */
    id: string;
    /** Component type */
    type: string;
    /** Bounding rectangle */
    rect: DOMRectReadOnly;
    /** Parent component ID (if any) */
    parentId?: string;
    /** Depth in the tree */
    depth: number;
}
