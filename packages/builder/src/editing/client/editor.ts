/**
 * Editor — Thin DOM-only browser client for Phase 2.
 *
 * This is a minimal browser client that round-trips edits through server
 * endpoints. It does NOT import renderPage, globalRegistry, or any server-side
 * rendering logic. All re-rendering happens server-side via:
 * - POST /builder/api/components — updates layout and returns re-rendered HTML
 * - POST /builder/api/reRender — re-renders full canvas from layout
 *
 * RULE 1: No renderPage, liquid, iconMap, or globalRegistry imports.
 * RULE 2: Read registry from window.__FRONTBASE_REGISTRY__ (injected by server).
 * RULE 3: All property changes go through server API.
 */

import type { PageComponent } from '@frontbase/edge-core';
import { SelectionTracker } from '../SelectionTracker.js';
import { PropertyPanel, type RegistryDescriptor } from '../PropertyPanel.js';
import { TreeView } from '../TreeView.js';

/**
 * Editor configuration for browser use.
 */
export interface EditorConfig {
    /** Iframe element for canvas rendering */
    iframe: HTMLIFrameElement;
    /** Overlay element for selection highlights */
    overlay: HTMLElement;
    /** Container for property panel */
    propertyPanelContainer?: HTMLElement;
    /** Container for tree view */
    treeViewContainer?: HTMLElement;
    /** Callback when HTML is rendered */
    onRender?: (html: string) => void;
    /** Callback when component tree changes */
    onChange?: (components: PageComponent[]) => void;
    /** Page ID (from window.__FRONTBASE_PAGE_ID__) */
    pageId: string;
}

/**
 * Component update operation (matches server API).
 */
interface ComponentUpdate {
    operation: 'add' | 'update' | 'remove' | 'reorder';
    componentId?: string;
    data?: Record<string, unknown>;
    parentId?: string;
    index?: number;
}

/**
 * Editor — Thin DOM-only browser editor class.
 *
 * Provides:
 * - Selection tracking (via SelectionTracker)
 * - Property editing (via PropertyPanel with injected registry)
 * - Tree visualization (via TreeView)
 * - Server round-trip for all rendering
 */
export class Editor {
    /** Registry descriptor (from injected window.__FRONTBASE_REGISTRY__) */
    private _registry: RegistryDescriptor;
    /** Selection tracker */
    private _selection: SelectionTracker;
    /** Property panel */
    private _propertyPanel: PropertyPanel;
    /** Tree view */
    private _treeView: TreeView;
    /** Configuration */
    private _config: EditorConfig;
    /** Initial render flag */
    private _initialized: boolean;
    /** Current component tree */
    private _components: PageComponent[];
    /** Selected component ID */
    private _selectedId: string | null;

    /**
     * Create a new Editor instance.
     *
     * @param config - Editor configuration
     */
    constructor(config: EditorConfig) {
        this._config = config;
        this._initialized = false;
        this._components = [];
        this._selectedId = null;

        // Read registry from injected global (server provides this)
        const injectedRegistry = (window as any).__FRONTBASE_REGISTRY__;
        if (!injectedRegistry) {
            throw new Error('Registry not injected (window.__FRONTBASE_REGISTRY__ missing)');
        }
        this._registry = injectedRegistry;

        // Create property panel with registry descriptor
        this._propertyPanel = new PropertyPanel(this._registry);

        // Create selection tracker
        this._selection = new SelectionTracker((id) => {
            this.select(id);
        });

        // Create tree view
        this._treeView = new TreeView();

        // Attach components to containers
        if (config.iframe && config.overlay) {
            this._selection.attachEventListeners({
                iframe: config.iframe,
                overlay: config.overlay,
                container: config.overlay.parentElement!
            });
        }

        if (config.propertyPanelContainer) {
            this._propertyPanel.attach({
                container: config.propertyPanelContainer,
                onPropertyChange: (event) => {
                    this._handlePropertyChange(event.componentId, {
                        [event.propertyName]: event.value
                    });
                }
            });
        }

        if (config.treeViewContainer) {
            this._treeView.attach({
                container: config.treeViewContainer,
                onSelect: (id) => {
                    this.select(id);
                },
                onAdd: (parentId, index) => {
                    // Prompt for component type
                    const type = prompt('Enter component type (e.g. Button, Text):');
                    if (type) {
                        this._addComponent({ type }, parentId || undefined, index);
                    }
                },
                onDelete: (id) => {
                    this._removeComponent(id);
                },
                onReorder: (id, newIndex) => {
                    this._reorderComponent(id, newIndex);
                }
            });
        }

        this._initialized = true;
    }

    /**
     * Get the current component tree.
     */
    get components(): PageComponent[] {
        return this._components;
    }

    /**
     * Get the selected component ID.
     */
    get selectedId(): string | null {
        return this._selectedId;
    }

    /**
     * Load component tree into the editor.
     *
     * @param components - Component array
     */
    load(components: PageComponent[]): void {
        this._components = components;

        // Update tree view
        if (this._config.treeViewContainer) {
            this._treeView.renderTree(components);
        }

        // Query component positions after iframe loads
        setTimeout(() => {
            if (this._config.iframe) {
                this._selection.queryComponentRects(this._config.iframe);
            }
        }, 100);
    }

    /**
     * Select a component.
     *
     * @param id - Component ID
     */
    select(id: string | null): void {
        this._selectedId = id;
        this._selection.highlightSelected(id);
        this._treeView.handleSelect(id);

        if (id) {
            this._updatePropertyPanel(id);
        } else {
            this._propertyPanel.clear();
        }
    }

    /**
     * Update component props via server API.
     *
     * @param componentId - Component ID
     * @param props - Props to update
     */
    async updateProps(componentId: string, props: Record<string, unknown>): Promise<void> {
        const response = await fetch('/builder/api/components', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-page-id': this._config.pageId
            },
            body: JSON.stringify({
                operation: 'update',
                componentId,
                data: props
            } satisfies ComponentUpdate)
        });

        if (!response.ok) {
            console.error('[Editor] Failed to update component:', response.statusText);
            return;
        }

        const result = await response.json();
        if (result.success) {
            // Swap iframe srcdoc with re-rendered HTML
            this._swapCanvas(result.html);
            // Update local component tree
            this._components = result.layout.content;
            // Re-query component positions
            setTimeout(() => {
                if (this._config.iframe) {
                    this._selection.queryComponentRects(this._config.iframe);
                }
            }, 50);
            // Notify change callback
            if (this._config.onChange) {
                this._config.onChange(this._components);
            }
        }
    }

    /**
     * Add a component via server API.
     *
     * @param component - Component to add
     * @param parentId - Parent ID (optional)
     * @param index - Index position (optional)
     * @returns New component ID
     */
    async add(component: Partial<PageComponent>, parentId?: string, index?: number): Promise<string> {
        return this._addComponent(component, parentId, index);
    }

    /**
     * Remove a component via server API.
     *
     * @param id - Component ID
     */
    async remove(id: string): Promise<void> {
        this._removeComponent(id);
    }

    /**
     * Reorder a component via server API.
     *
     * @param id - Component ID
     * @param newIndex - New index
     */
    async reorder(id: string, newIndex: number): Promise<void> {
        this._reorderComponent(id, newIndex);
    }

    /**
     * Subscribe to editor changes.
     *
     * @param callback - Change callback
     * @returns Unsubscribe function
     */
    onChange(callback: (event: any) => void): () => void {
        // For the thin client, changes are handled via the onChange callback in config
        // This is a no-op for API compatibility
        return () => {};
    }

    /**
     * Destroy the editor and cleanup.
     */
    destroy(): void {
        this._selection.destroy();
        this._propertyPanel.destroy();
        this._treeView.destroy();
        this._initialized = false;
    }

    /**
     * Handle property change from PropertyPanel.
     */
    private async _handlePropertyChange(componentId: string, props: Record<string, unknown>): Promise<void> {
        await this.updateProps(componentId, props);
    }

    /**
     * Add component via server API.
     */
    private async _addComponent(component: Partial<PageComponent>, parentId?: string, index?: number): Promise<string> {
        const response = await fetch('/builder/api/components', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-page-id': this._config.pageId
            },
            body: JSON.stringify({
                operation: 'add',
                data: component,
                parentId: parentId,
                index: index
            } satisfies ComponentUpdate)
        });

        if (!response.ok) {
            console.error('[Editor] Failed to add component:', response.statusText);
            return '';
        }

        const result = await response.json();
        if (result.success) {
            // Swap iframe srcdoc with re-rendered HTML
            this._swapCanvas(result.html);
            // Update local component tree
            this._components = result.layout.content;
            // Re-query component positions
            setTimeout(() => {
                if (this._config.iframe) {
                    this._selection.queryComponentRects(this._config.iframe);
                }
            }, 50);
            // Notify change callback
            if (this._config.onChange) {
                this._config.onChange(this._components);
            }
            // Return new component ID (extracted from the added component)
            return this._findNewComponentId(this._components);
        }
        return '';
    }

    /**
     * Remove component via server API.
     */
    private async _removeComponent(id: string): Promise<void> {
        const response = await fetch('/builder/api/components', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-page-id': this._config.pageId
            },
            body: JSON.stringify({
                operation: 'remove',
                componentId: id
            } satisfies ComponentUpdate)
        });

        if (!response.ok) {
            console.error('[Editor] Failed to remove component:', response.statusText);
            return;
        }

        const result = await response.json();
        if (result.success) {
            // Swap iframe srcdoc with re-rendered HTML
            this._swapCanvas(result.html);
            // Update local component tree
            this._components = result.layout.content;
            // Clear selection if we removed the selected component
            if (this._selectedId === id) {
                this.select(null);
            }
            // Re-query component positions
            setTimeout(() => {
                if (this._config.iframe) {
                    this._selection.queryComponentRects(this._config.iframe);
                }
            }, 50);
            // Notify change callback
            if (this._config.onChange) {
                this._config.onChange(this._components);
            }
        }
    }

    /**
     * Reorder component via server API.
     */
    private async _reorderComponent(id: string, newIndex: number): Promise<void> {
        const response = await fetch('/builder/api/components', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-page-id': this._config.pageId
            },
            body: JSON.stringify({
                operation: 'reorder',
                componentId: id,
                index: newIndex
            } satisfies ComponentUpdate)
        });

        if (!response.ok) {
            console.error('[Editor] Failed to reorder component:', response.statusText);
            return;
        }

        const result = await response.json();
        if (result.success) {
            // Swap iframe srcdoc with re-rendered HTML
            this._swapCanvas(result.html);
            // Update local component tree
            this._components = result.layout.content;
            // Re-query component positions
            setTimeout(() => {
                if (this._config.iframe) {
                    this._selection.queryComponentRects(this._config.iframe);
                }
            }, 50);
            // Notify change callback
            if (this._config.onChange) {
                this._config.onChange(this._components);
            }
        }
    }

    /**
     * Swap iframe srcdoc with new HTML and restore selection.
     */
    private _swapCanvas(html: string): void {
        if (!this._config.iframe) return;

        // Save current selection
        const savedSelection = this._selectedId;

        // Update iframe srcdoc
        this._config.iframe.srcdoc = html;

        // Restore selection after iframe reloads
        if (savedSelection) {
            setTimeout(() => {
                this.select(savedSelection);
            }, 50);
        }
    }

    /**
     * Update property panel for selected component.
     */
    private _updatePropertyPanel(componentId: string): void {
        if (!this._config.propertyPanelContainer) return;

        const component = this._findComponent(componentId, this._components);

        if (component) {
            this._propertyPanel.renderPropertyPanel(
                componentId,
                component.type || '',
                component.props || {}
            );
        }
    }

    /**
     * Find component by ID in tree.
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
     * Find new component ID after add (assumes the last component in the array).
     */
    private _findNewComponentId(components: PageComponent[]): string {
        if (components.length === 0) return '';
        const lastComponent = components[components.length - 1];
        return lastComponent?.id || '';
    }
}
