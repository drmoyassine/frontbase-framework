/**
 * BuilderEditor — Main editor class for the builder editing layer.
 *
 * This class manages the component tree and provides CRUD operations.
 * It integrates with @frontbase/edge-core renderPage for re-rendering.
 *
 * RULE 1: This is vanilla TypeScript, no React.
 * RULE 2: All re-renders go through renderPage from @frontbase/edge-core.
 * RULE 3: Uses globalRegistry from @frontbase/builder/registry for component metadata.
 */

import type { PageLayoutData, PageComponent, TemplateContext } from '@frontbase/edge-core';
import { renderPage } from '@frontbase/edge-core';
import { globalRegistry } from '../registry/index.js';
import type { EditorChangeEvent, EditorChangeCallback } from './types.js';

/**
 * BuilderEditor — Main class for editing component trees.
 *
 * Manages:
 * - Component tree state (PageLayoutData)
 * - Selection state (currently selected component ID)
 * - Change notifications (callbacks for subscribers)
 * - Re-rendering (calls renderPage on every change)
 */
export class BuilderEditor {
    /** Current component tree state */
    private _layoutData: PageLayoutData;
    /** Currently selected component ID */
    private _selectedId: string | null;
    /** Registered change callbacks */
    private _changeCallbacks: Set<EditorChangeCallback>;
    /** Template context for rendering */
    private _context: TemplateContext;
    /** Whether the editor is destroyed */
    private _destroyed: boolean;
    /** Unique ID counter for new components */
    private _idCounter: number;

    /**
     * Create a new BuilderEditor instance.
     *
     * @param context - Template context for rendering (from @frontbase/edge-core)
     */
    constructor(context: TemplateContext = {} as any) {
        this._layoutData = { content: [], root: {} };
        this._selectedId = null;
        this._changeCallbacks = new Set();
        this._context = context;
        this._destroyed = false;
        this._idCounter = 0;
    }

    /**
     * Get the current layout data.
     */
    get layoutData(): PageLayoutData {
        return this._layoutData;
    }

    /**
     * Get the currently selected component ID.
     */
    get selectedId(): string | null {
        return this._selectedId;
    }

    /**
     * Check if the editor is destroyed.
     */
    get isDestroyed(): boolean {
        return this._destroyed;
    }

    /**
     * Load a component tree into the editor.
     *
     * @param components - Component tree to load
     * @param root - Optional root properties
     */
    load(components: PageComponent[], root?: Record<string, unknown>): void {
        if (this._destroyed) {
            throw new Error('Cannot load: editor is destroyed');
        }

        const previous = this._layoutData;
        this._layoutData = {
            content: JSON.parse(JSON.stringify(components)),
            root: root ? { ...root } : {}
        };
        this._selectedId = null;

        this._emitChange({
            type: 'load',
            previous,
            current: this._layoutData,
            selectedId: null
        });
    }

    /**
     * Select a component by ID.
     *
     * @param id - Component ID to select (null to deselect)
     */
    select(id: string | null): void {
        if (this._destroyed) {
            throw new Error('Cannot select: editor is destroyed');
        }

        if (this._selectedId === id) return;

        const previousId = this._selectedId;
        this._selectedId = id;

        this._emitChange({
            type: 'select',
            componentId: id ?? undefined,
            current: this._layoutData,
            selectedId: id
        });
    }

    /**
     * Update component props.
     *
     * @param id - Component ID
     * @param props - New props to merge with existing props
     */
    updateProps(id: string, props: Record<string, unknown>): void {
        if (this._destroyed) {
            throw new Error('Cannot update props: editor is destroyed');
        }

        const previous = this._layoutData;
        const component = this._findComponent(id, this._layoutData.content);

        if (!component) {
            throw new Error(`Component not found: ${id}`);
        }

        // Merge props
        component.props = { ...component.props, ...props };
        this._layoutData = { ...this._layoutData };

        this._emitChange({
            type: 'update',
            componentId: id,
            previous,
            current: this._layoutData,
            selectedId: this._selectedId
        });
    }

    /**
     * Add a new component.
     *
     * @param component - Component to add (type is required, id is optional)
     * @param parentId - Parent component ID (null for top-level)
     * @param index - Index to insert at (default: end)
     * @returns The ID of the new component
     */
    add(component: Partial<PageComponent>, parentId: string | null = null, index?: number): string {
        if (this._destroyed) {
            throw new Error('Cannot add: editor is destroyed');
        }

        if (!component.type) {
            throw new Error('Component type is required');
        }

        // Validate component type against registry
        const def = globalRegistry.get(component.type);
        if (!def) {
            throw new Error(`Unknown component type: ${component.type}`);
        }

        const previous = this._layoutData;

        // Generate ID if not provided
        const id = component.id || this._generateId(component.type);

        // Get default props from registry
        const defaultProps = globalRegistry.getDefaults(component.type);

        // Create new component node
        const newComponent: PageComponent = {
            id,
            type: component.type,
            props: { ...defaultProps, ...component.props },
            styles: component.styles,
            children: component.children ? [...component.children] : []
        };

        if (parentId) {
            // Add as child of parent
            const parent = this._findComponent(parentId, this._layoutData.content);
            if (!parent) {
                throw new Error(`Parent component not found: ${parentId}`);
            }

            // Validate parent allows children
            if (!def.editable.allowChildren) {
                throw new Error(`Component type "${component.type}" does not allow children`);
            }

            // Validate against allowed children
            if (def.editable.allowedChildren && def.editable.allowedChildren.length > 0) {
                if (!def.editable.allowedChildren.includes(component.type)) {
                    throw new Error(`Component type "${component.type}" is not allowed as a child of "${parent.type}"`);
                }
            }

            parent.children = parent.children || [];
            const insertIndex = index !== undefined ? index : parent.children.length;
            parent.children.splice(insertIndex, 0, newComponent);
        } else {
            // Add as top-level component
            const insertIndex = index !== undefined ? index : this._layoutData.content.length;
            this._layoutData.content.splice(insertIndex, 0, newComponent);
        }

        this._layoutData = { ...this._layoutData };
        this._selectedId = id;

        this._emitChange({
            type: 'add',
            componentId: id,
            previous,
            current: this._layoutData,
            selectedId: id
        });

        return id;
    }

    /**
     * Remove a component by ID.
     *
     * @param id - Component ID to remove
     */
    remove(id: string): void {
        if (this._destroyed) {
            throw new Error('Cannot remove: editor is destroyed');
        }

        const previous = this._layoutData;
        const removed = this._removeComponent(id, this._layoutData.content);

        if (!removed) {
            throw new Error(`Component not found: ${id}`);
        }

        if (this._selectedId === id) {
            this._selectedId = null;
        }

        this._layoutData = { ...this._layoutData };

        this._emitChange({
            type: 'remove',
            componentId: id,
            previous,
            current: this._layoutData,
            selectedId: this._selectedId
        });
    }

    /**
     * Reorder a component within its parent.
     *
     * @param id - Component ID to reorder
     * @param newIndex - New index position
     */
    reorder(id: string, newIndex: number): void {
        if (this._destroyed) {
            throw new Error('Cannot reorder: editor is destroyed');
        }

        const previous = this._layoutData;
        const reordered = this._reorderComponent(id, newIndex, this._layoutData.content);

        if (!reordered) {
            throw new Error(`Component not found: ${id}`);
        }

        this._layoutData = { ...this._layoutData };

        this._emitChange({
            type: 'reorder',
            componentId: id,
            previous,
            current: this._layoutData,
            selectedId: this._selectedId
        });
    }

    /**
     * Re-render the page with the current layout data.
     *
     * @returns Promise resolving to the rendered HTML string
     */
    async reRender(): Promise<string> {
        if (this._destroyed) {
            throw new Error('Cannot render: editor is destroyed');
        }

        try {
            return await renderPage(this._layoutData, this._context);
        } catch (error) {
            console.error('Render error:', error);
            throw error;
        }
    }

    /**
     * Subscribe to editor changes.
     *
     * @param callback - Function to call on changes
     * @returns Unsubscribe function
     */
    onChange(callback: EditorChangeCallback): () => void {
        if (this._destroyed) {
            throw new Error('Cannot subscribe: editor is destroyed');
        }

        this._changeCallbacks.add(callback);

        // Return unsubscribe function
        return () => {
            this._changeCallbacks.delete(callback);
        };
    }

    /**
     * Destroy the editor and cleanup resources.
     */
    destroy(): void {
        if (this._destroyed) return;

        this._destroyed = true;
        this._changeCallbacks.clear();
        this._layoutData = { content: [], root: {} };
        this._selectedId = null;
    }

    /**
     * Find a component by ID in the tree.
     *
     * @param id - Component ID to find
     * @param components - Component array to search
     * @returns The component if found, null otherwise
     */
    private _findComponent(id: string, components: PageComponent[]): PageComponent | null {
        for (const component of components) {
            if (component.id === id) {
                return component;
            }

            if (component.children && component.children.length > 0) {
                const found = this._findComponent(id, component.children);
                if (found) return found;
            }
        }

        return null;
    }

    /**
     * Remove a component by ID from the tree.
     *
     * @param id - Component ID to remove
     * @param components - Component array to modify
     * @returns true if removed, false if not found
     */
    private _removeComponent(id: string, components: PageComponent[]): boolean {
        for (let i = 0; i < components.length; i++) {
            const component = components[i];
            if (!component) continue;

            if (component.id === id) {
                components.splice(i, 1);
                return true;
            }

            if (component.children && component.children.length > 0) {
                if (this._removeComponent(id, component.children)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Reorder a component within its parent array.
     *
     * @param id - Component ID to reorder
     * @param newIndex - New index position
     * @param components - Component array to modify
     * @returns true if reordered, false if not found
     */
    private _reorderComponent(id: string, newIndex: number, components: PageComponent[]): boolean {
        for (let i = 0; i < components.length; i++) {
            const component = components[i];
            if (!component) continue;

            if (component.id === id) {
                const [movedComponent] = components.splice(i, 1);
                if (!movedComponent) return false;
                const safeIndex = Math.max(0, Math.min(newIndex, components.length));
                components.splice(safeIndex, 0, movedComponent);
                return true;
            }

            if (component.children && component.children.length > 0) {
                if (this._reorderComponent(id, newIndex, component.children)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Generate a unique component ID.
     *
     * @param type - Component type
     * @returns Unique ID string
     */
    private _generateId(type: string): string {
        const prefix = type.toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${prefix}-${++this._idCounter}`;
    }

    /**
     * Emit a change event to all subscribers.
     *
     * @param event - Change event to emit
     */
    private _emitChange(event: EditorChangeEvent): void {
        for (const callback of this._changeCallbacks) {
            try {
                callback(event);
            } catch (error) {
                console.error('Change callback error:', error);
            }
        }
    }
}
