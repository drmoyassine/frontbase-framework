/**
 * TreeView — Component tree visualization for the builder.
 *
 * This class handles:
 * - Rendering the component tree structure
 * - Handling tree node selection
 * - Adding/removing components
 * - Reordering components
 * - Collapsing/expanding nodes
 *
 * RULE 1: This is vanilla TypeScript, no React.
 * RULE 2: Uses PageComponent data from the editor state.
 */

import type { PageComponent } from '@frontbase/edge-core';
import type { TreeNode, TreeViewConfig } from './types.js';
import { globalRegistry } from '../registry/index.js';

/**
 * Tree view state.
 */
interface TreeViewState {
    /** Tree nodes */
    nodes: TreeNode[];
    /** Selected node ID */
    selectedId: string | null;
    /** Expanded node IDs */
    expandedIds: Set<string>;
    /** Hovered node ID */
    hoveredId: string | null;
}

/**
 * TreeView — Manages the component tree visualization.
 *
 * Provides:
 * - Render tree structure from component data
 * - Handle node selection
 * - Handle node addition/deletion
 * - Handle node reordering
 * - Expand/collapse tree nodes
 */
export class TreeView {
    /** Container element for the tree */
    private _container: HTMLElement | null;
    /** Current tree state */
    private _state: TreeViewState;
    /** Configuration callbacks */
    private _config: TreeViewConfig | null;
    /** Cleanup callbacks */
    private _cleanup: Array<() => void>;
    /** Drag state */
    private _dragState: {
        draggedId: string | null;
        targetId: string | null;
        position: 'before' | 'after' | 'inside' | null;
        ghostElement: HTMLElement | null;
    } | null;

    /**
     * Create a new TreeView instance.
     */
    constructor() {
        this._container = null;
        this._config = null;
        this._cleanup = [];
        this._state = {
            nodes: [],
            selectedId: null,
            expandedIds: new Set(),
            hoveredId: null
        };
        this._dragState = null;
    }

    /**
     * Get the selected node ID.
     */
    get selectedId(): string | null {
        return this._state.selectedId;
    }

    /**
     * Check if the tree is attached to a container.
     */
    get isAttached(): boolean {
        return this._container !== null;
    }

    /**
     * Attach the tree view to a container.
     *
     * @param config - Tree view configuration
     */
    attach(config: TreeViewConfig): void {
        if (this._container) {
            throw new Error('Already attached to a container');
        }

        this._container = config.container;
        this._config = config;

        // Render empty state
        this._renderEmptyState();
    }

    /**
     * Render the component tree.
     *
     * @param components - Component array to render
     */
    renderTree(components: PageComponent[]): void {
        if (!this._container) return;

        this._state.nodes = this._buildTreeNodes(components);

        this._container.innerHTML = '';
        this._container.className = 'fb-tree-view';

        if (this._state.nodes.length === 0) {
            this._renderEmptyState();
            return;
        }

        // Render tree nodes
        const treeRoot = document.createElement('div');
        treeRoot.className = 'fb-tree-root';

        for (const node of this._state.nodes) {
            treeRoot.appendChild(this._renderTreeNode(node));
        }

        this._container.appendChild(treeRoot);
    }

    /**
     * Handle node selection.
     *
     * @param id - Node ID to select (null to deselect)
     */
    handleSelect(id: string | null): void {
        if (!this._container) return;

        // Update state
        this._state.selectedId = id;

        // Update DOM
        this._updateSelectionState();
    }

    /**
     * Handle adding a new component.
     *
     * @param parentId - Parent node ID (null for top-level)
     * @param index - Index to insert at
     */
    handleAdd(parentId: string | null, index: number): void {
        if (!this._config) return;

        this._config.onAdd(parentId, index);
    }

    /**
     * Handle deleting a component.
     *
     * @param id - Node ID to delete
     */
    handleDelete(id: string): void {
        if (!this._config) return;

        // Confirm deletion
        const confirmed = confirm(`Delete component "${id}"?`);
        if (!confirmed) return;

        this._config.onDelete(id);
    }

    /**
     * Handle reordering a component.
     *
     * @param id - Node ID to reorder
     * @param newIndex - New index position
     */
    handleReorder(id: string, newIndex: number): void {
        if (!this._config) return;

        this._config.onReorder(id, newIndex);
    }

    /**
     * Toggle node expansion.
     *
     * @param id - Node ID to toggle
     */
    toggleExpansion(id: string): void {
        if (!this._container) return;

        if (this._state.expandedIds.has(id)) {
            this._state.expandedIds.delete(id);
        } else {
            this._state.expandedIds.add(id);
        }

        // Update DOM
        this._updateExpansionState();
    }

    /**
     * Collapse all nodes.
     */
    collapseAll(): void {
        if (!this._container) return;

        this._state.expandedIds.clear();
        this._updateExpansionState();
    }

    /**
     * Expand all nodes.
     */
    expandAll(): void {
        if (!this._container) return;

        // Collect all IDs
        const allIds = new Set<string>();
        const collectIds = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                if (node.children.length > 0) {
                    allIds.add(node.id);
                    collectIds(node.children);
                }
            }
        };
        collectIds(this._state.nodes);

        this._state.expandedIds = allIds;
        this._updateExpansionState();
    }

    /**
     * Update the tree with new component data.
     *
     * @param components - New component array
     */
    update(components: PageComponent[]): void {
        this.renderTree(components);
    }

    /**
     * Cleanup resources.
     */
    destroy(): void {
        // Clear container
        if (this._container) {
            this._container.innerHTML = '';
        }

        // Cleanup event listeners
        for (const cleanup of this._cleanup) {
            cleanup();
        }
        this._cleanup = [];

        // Clear state
        this._state = {
            nodes: [],
            selectedId: null,
            expandedIds: new Set(),
            hoveredId: null
        };

        // Clear config
        this._config = null;
        this._container = null;
        this._dragState = null;
    }

    /**
     * Build tree nodes from component data.
     */
    private _buildTreeNodes(components: PageComponent[], depth: number = 0): TreeNode[] {
        const nodes: TreeNode[] = [];

        for (const component of components) {
            const def = globalRegistry.get(component.type);
            const displayName = def?.displayName || component.type;

            const node: TreeNode = {
                id: component.id,
                type: component.type,
                props: component.props || {},
                displayName: `${displayName} (${component.id})`,
                selected: component.id === this._state.selectedId,
                expanded: this._state.expandedIds.has(component.id),
                children: this._buildTreeNodes(component.children || [], depth + 1),
                depth
            };

            nodes.push(node);
        }

        return nodes;
    }

    /**
     * Render a single tree node.
     */
    private _renderTreeNode(node: TreeNode): HTMLElement {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'fb-tree-node';
        nodeEl.setAttribute('data-node-id', node.id);
        nodeEl.style.paddingLeft = `${node.depth * 16}px`;

        // Node content
        const content = document.createElement('div');
        content.className = 'fb-tree-node-content';
        if (node.selected) {
            content.classList.add('fb-selected');
        }

        // Expand/collapse toggle
        if (node.children.length > 0) {
            const toggle = document.createElement('button');
            toggle.className = 'fb-tree-node-toggle';
            toggle.textContent = node.expanded ? '▼' : '▶';
            toggle.setAttribute('aria-label', node.expanded ? 'Collapse' : 'Expand');
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleExpansion(node.id);
            });
            content.appendChild(toggle);
        } else {
            const spacer = document.createElement('span');
            spacer.className = 'fb-tree-node-spacer';
            content.appendChild(spacer);
        }

        // Node icon
        const icon = document.createElement('span');
        icon.className = 'fb-tree-node-icon';
        const def = globalRegistry.get(node.type);
        icon.textContent = this._getIconForType(def?.editable.category || 'basic');
        content.appendChild(icon);

        // Node label
        const label = document.createElement('span');
        label.className = 'fb-tree-node-label';
        label.textContent = node.displayName;
        content.appendChild(label);

        // Node actions
        const actions = document.createElement('div');
        actions.className = 'fb-tree-node-actions';

        // Add button
        const addBtn = this._createActionButton('➕', 'Add child component', () => {
            this.handleAdd(node.id, 0);
        });
        actions.appendChild(addBtn);

        // Delete button
        const deleteBtn = this._createActionButton('🗑️', 'Delete component', () => {
            this.handleDelete(node.id);
        });
        actions.appendChild(deleteBtn);

        content.appendChild(actions);

        nodeEl.appendChild(content);

        // Render children if expanded
        if (node.expanded && node.children.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'fb-tree-node-children';

            for (const child of node.children) {
                childrenContainer.appendChild(this._renderTreeNode(child));
            }

            nodeEl.appendChild(childrenContainer);
        }

        // Setup click handler for selection
        content.addEventListener('click', () => {
            this._config?.onSelect(node.id);
        });

        // Setup drag and drop
        this._setupDragDrop(nodeEl, node);

        return nodeEl;
    }

    /**
     * Create an action button.
     */
    private _createActionButton(icon: string, title: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.className = 'fb-tree-node-action';
        button.textContent = icon;
        button.title = title;
        button.type = 'button';
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return button;
    }

    /**
     * Setup drag and drop for a node.
     */
    private _setupDragDrop(element: HTMLElement, node: TreeNode): void {
        element.draggable = true;

        element.addEventListener('dragstart', (e) => {
            if (!this._dragState) {
                this._dragState = {
                    draggedId: node.id,
                    targetId: null,
                    position: null,
                    ghostElement: null
                };
            }
            element.classList.add('fb-dragging');
        });

        element.addEventListener('dragend', () => {
            element.classList.remove('fb-dragging');
            if (this._dragState) {
                this._dragState = null;
            }
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!this._dragState) return;

            this._dragState.targetId = node.id;

            const rect = element.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const height = rect.height;

            if (y < height * 0.25) {
                this._dragState.position = 'before';
            } else if (y > height * 0.75) {
                this._dragState.position = 'after';
            } else {
                this._dragState.position = 'inside';
            }
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!this._dragState || !this._config) return;

            const { draggedId, targetId, position } = this._dragState;

            if (draggedId && targetId && draggedId !== targetId) {
                // Calculate new index based on position
                // This is a simplified implementation - the editor will handle the actual reordering
                this._config.onReorder(draggedId, -1); // -1 indicates drop operation
            }

            this._dragState = null;
        });
    }

    /**
     * Get icon for component category.
     */
    private _getIconForType(category: string): string {
        const icons: Record<string, string> = {
            basic: '📝',
            layout: '📐',
            form: '📋',
            data: '📊',
            landing: '🎯',
            advanced: '⚙️'
        };
        return icons[category] || '📦';
    }

    /**
     * Render empty state.
     */
    private _renderEmptyState(): void {
        if (!this._container) return;

        const empty = document.createElement('div');
        empty.className = 'fb-tree-empty';
        empty.innerHTML = `
            <p class="fb-tree-empty-text">No components</p>
            <p class="fb-tree-empty-hint">Add a component to get started</p>
        `;

        this._container.appendChild(empty);
    }

    /**
     * Update selection state in the DOM.
     */
    private _updateSelectionState(): void {
        if (!this._container) return;

        // Clear all selections
        for (const content of Array.from(this._container.querySelectorAll('.fb-tree-node-content'))) {
            content.classList.remove('fb-selected');
        }

        // Set new selection
        if (this._state.selectedId) {
            const node = this._container.querySelector(`[data-node-id="${this._state.selectedId}"] .fb-tree-node-content`);
            if (node) {
                node.classList.add('fb-selected');
            }
        }
    }

    /**
     * Update expansion state in the DOM.
     */
    private _updateExpansionState(): void {
        if (!this._container) return;

        for (const nodeEl of Array.from(this._container.querySelectorAll('.fb-tree-node'))) {
            const nodeId = nodeEl.getAttribute('data-node-id');
            if (!nodeId) continue;

            const toggle = nodeEl.querySelector('.fb-tree-node-toggle') as HTMLElement;
            const children = nodeEl.querySelector('.fb-tree-node-children') as HTMLElement;

            if (!toggle || !children) continue;

            const isExpanded = this._state.expandedIds.has(nodeId);
            toggle.textContent = isExpanded ? '▼' : '▶';

            if (isExpanded) {
                children.style.display = 'block';
            } else {
                children.style.display = 'none';
            }
        }
    }
}
