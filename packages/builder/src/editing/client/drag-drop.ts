/**
 * Drag & Drop Utilities — Native HTML5 Drag/Drop handlers for the builder.
 *
 * This module provides drag and drop functionality using the native HTML5 API:
 * - Drag start/end handlers
 * - Drop zone detection
 * - Visual feedback during drag
 * - Insert position calculation
 */

import type { PageComponent } from '@frontbase/edge-core';

/**
 * Drop position relative to target.
 */
export type DropPosition = 'before' | 'after' | 'inside' | null;

/**
 * Drag state during drag operation.
 */
export interface DragState {
    /** Component being dragged */
    draggedId: string | null;
    /** Drop target component ID */
    targetId: string | null;
    /** Drop position relative to target */
    position: DropPosition;
    /** Ghost element for visual feedback */
    ghostElement: HTMLDivElement | null;
    /** Original component data (for cancel) */
    originalData?: PageComponent;
}

/**
 * Drop zone configuration.
 */
export interface DropZoneConfig {
    /** Container element */
    container: HTMLElement;
    /** Callback when drag starts */
    onDragStart?: (id: string) => void;
    /** Callback when drag ends */
    onDragEnd?: (state: DragState) => void;
    /** Callback when component is dropped */
    onDrop?: (state: DragState) => void;
    /** Allow dropping on same parent */
    allowSameParent?: boolean;
    /** Allow nesting (dropping inside other components) */
    allowNesting?: boolean;
}

/**
 * Drag drop manager class.
 */
export class DragDropManager {
    /** Current drag state */
    private _state: DragState;
    /** Drop zone configuration */
    private _config: DropZoneConfig | null;
    /** Cleanup functions */
    private _cleanup: Array<() => void>;

    constructor() {
        this._state = {
            draggedId: null,
            targetId: null,
            position: null,
            ghostElement: null
        };
        this._config = null;
        this._cleanup = [];
    }

    /**
     * Get the current drag state.
     */
    get state(): DragState {
        return this._state;
    }

    /**
     * Check if currently dragging.
     */
    get isDragging(): boolean {
        return this._state.draggedId !== null;
    }

    /**
     * Setup drag and drop for a container.
     *
     * @param config - Drop zone configuration
     */
    setup(config: DropZoneConfig): void {
        if (this._config) {
            throw new Error('Already configured');
        }

        this._config = config;

        const { container } = config;

        // Setup drag start listener
        const handleDragStart = (e: Event) => {
            const mouseEvent = e as MouseEvent;
            const target = mouseEvent.target as HTMLElement;
            const draggable = target.closest('[data-fb-draggable]') as HTMLElement;

            if (!draggable) return;

            const id = draggable.getAttribute('data-fb-id');
            if (!id) return;

            mouseEvent.preventDefault();

            this._state.draggedId = id;
            this._state.ghostElement = this._createGhostElement(mouseEvent);

            if (config.onDragStart) {
                config.onDragStart(id);
            }

            document.addEventListener('dragover', this._handleDragOver);
            document.addEventListener('drop', this._handleDrop);
            document.addEventListener('dragend', this._handleDragEnd);
        };

        container.addEventListener('mousedown', handleDragStart);

        this._cleanup.push(() => {
            container.removeEventListener('mousedown', handleDragStart);
        });
    }

    /**
     * Cleanup and remove event listeners.
     */
    destroy(): void {
        // Remove document listeners
        document.removeEventListener('dragover', this._handleDragOver);
        document.removeEventListener('drop', this._handleDrop);
        document.removeEventListener('dragend', this._handleDragEnd);

        // Cleanup container listeners
        for (const cleanup of this._cleanup) {
            cleanup();
        }
        this._cleanup = [];

        // Clear state
        this._state = {
            draggedId: null,
            targetId: null,
            position: null,
            ghostElement: null
        };
        this._config = null;
    }

    /**
     * Handle drag over.
     */
    private _handleDragOver = (e: DragEvent): void => {
        e.preventDefault();

        if (!this._config || !this._state.draggedId) return;

        const target = e.target as HTMLElement;
        const dropTarget = target.closest('[data-fb-id]') as HTMLElement;

        if (!dropTarget) {
            this._clearDropTarget();
            return;
        }

        const targetId = dropTarget.getAttribute('data-fb-id');
        if (!targetId || targetId === this._state.draggedId) {
            this._clearDropTarget();
            return;
        }

        // Calculate drop position
        const rect = dropTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        let position: DropPosition = null;

        // Determine position based on Y coordinate
        if (y < height * 0.25) {
            position = 'before';
        } else if (y > height * 0.75) {
            position = 'after';
        } else if (this._config.allowNesting) {
            position = 'inside';
        }

        this._state.targetId = targetId;
        this._state.position = position;

        // Update ghost element position
        this._updateGhostPosition(rect, position);
    };

    /**
     * Handle drop.
     */
    private _handleDrop = (e: DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();

        if (!this._config || !this._state.draggedId) return;

        if (this._config.onDrop) {
            this._config.onDrop({ ...this._state });
        }

        this._endDrag();
    };

    /**
     * Handle drag end.
     */
    private _handleDragEnd = (): void => {
        if (this._config && this._config.onDragEnd) {
            this._config.onDragEnd(this._state);
        }

        this._endDrag();
    };

    /**
     * End drag operation.
     */
    private _endDrag(): void {
        // Remove ghost element
        if (this._state.ghostElement) {
            this._state.ghostElement.remove();
            this._state.ghostElement = null;
        }

        // Clear drop target
        this._clearDropTarget();

        // Clear state
        this._state.draggedId = null;
        this._state.targetId = null;
        this._state.position = null;

        // Remove document listeners
        document.removeEventListener('dragover', this._handleDragOver);
        document.removeEventListener('drop', this._handleDrop);
        document.removeEventListener('dragend', this._handleDragEnd);
    }

    /**
     * Create ghost element for drag feedback.
     */
    private _createGhostElement(e: MouseEvent): HTMLDivElement {
        const ghost = document.createElement('div');
        ghost.className = 'fb-drag-ghost';
        ghost.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 10000;
            opacity: 0.8;
            background: rgba(59, 130, 246, 0.1);
            border: 2px dashed #3b82f6;
            border-radius: 4px;
            transition: all 0.15s ease-out;
        `;

        // Get dragged element dimensions
        const target = e.target as HTMLElement;
        const rect = target.getBoundingClientRect();

        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.style.left = `${rect.left}px`;
        ghost.style.top = `${rect.top}px`;

        document.body.appendChild(ghost);

        return ghost;
    }

    /**
     * Update ghost element position.
     */
    private _updateGhostPosition(targetRect: DOMRect, position: DropPosition): void {
        if (!this._state.ghostElement) return;

        const ghost = this._state.ghostElement;

        switch (position) {
            case 'before':
                ghost.style.left = `${targetRect.left}px`;
                ghost.style.top = `${targetRect.top - 4}px`;
                ghost.style.height = '4px';
                ghost.style.width = `${targetRect.width}px`;
                break;
            case 'after':
                ghost.style.left = `${targetRect.left}px`;
                ghost.style.top = `${targetRect.bottom - 4}px`;
                ghost.style.height = '4px';
                ghost.style.width = `${targetRect.width}px`;
                break;
            case 'inside':
                ghost.style.left = `${targetRect.left}px`;
                ghost.style.top = `${targetRect.top}px`;
                ghost.style.width = `${targetRect.width}px`;
                ghost.style.height = `${targetRect.height}px`;
                break;
            default:
                ghost.style.display = 'none';
        }
    }

    /**
     * Clear drop target styling.
     */
    private _clearDropTarget(): void {
        // Remove drop target styling
        const dropTargets = document.querySelectorAll('.fb-drop-target');
        for (const target of Array.from(dropTargets)) {
            target.classList.remove('fb-drop-target', 'fb-drop-before', 'fb-drop-after', 'fb-drop-inside');
        }

        if (this._state.ghostElement) {
            this._state.ghostElement.style.display = 'none';
        }
    }
}

/**
 * Setup drag and drop for a component element.
 *
 * @param element - Element to make draggable
 * @param id - Component ID
 */
export function makeDraggable(element: HTMLElement, id: string): void {
    element.setAttribute('data-fb-draggable', 'true');
    element.setAttribute('data-fb-id', id);
    element.setAttribute('draggable', 'true');
    element.style.cursor = 'move';
}

/**
 * Setup drop zone for a container.
 *
 * @param container - Container element
 * @param callbacks - Drop event callbacks
 */
export function setupDropZone(
    container: HTMLElement,
    callbacks: {
        onDrop?: (draggedId: string, targetId: string, position: DropPosition) => void;
        onDragOver?: (e: DragEvent, position: DropPosition) => void;
    }
): void {
    container.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();

        const target = e.target as HTMLElement;
        const dropTarget = target.closest('[data-fb-id]') as HTMLElement;

        if (!dropTarget) return;

        const targetId = dropTarget.getAttribute('data-fb-id');
        if (!targetId) return;

        // Calculate drop position
        const rect = dropTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        let position: DropPosition = null;

        if (y < height * 0.25) {
            position = 'before';
        } else if (y > height * 0.75) {
            position = 'after';
        } else {
            position = 'inside';
        }

        // Update styling
        dropTarget.classList.remove('fb-drop-before', 'fb-drop-after', 'fb-drop-inside');
        if (position) {
            dropTarget.classList.add(`fb-drop-${position}`);
        }

        if (callbacks.onDragOver) {
            callbacks.onDragOver(e, position);
        }
    });

    container.addEventListener('dragleave', (e: DragEvent) => {
        const target = e.target as HTMLElement;
        target.classList.remove('fb-drop-target', 'fb-drop-before', 'fb-drop-after', 'fb-drop-inside');
    });

    container.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();

        const draggedId = e.dataTransfer?.getData('text/plain');
        const target = e.target as HTMLElement;
        const dropTarget = target.closest('[data-fb-id]') as HTMLElement;

        if (!draggedId || !dropTarget) return;

        const targetId = dropTarget.getAttribute('data-fb-id');
        if (!targetId || targetId === draggedId) return;

        // Calculate drop position
        const rect = dropTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        let position: DropPosition = null;

        if (y < height * 0.25) {
            position = 'before';
        } else if (y > height * 0.75) {
            position = 'after';
        } else {
            position = 'inside';
        }

        // Clear styling
        dropTarget.classList.remove('fb-drop-before', 'fb-drop-after', 'fb-drop-inside');

        if (callbacks.onDrop && position) {
            callbacks.onDrop(draggedId, targetId, position);
        }
    });
}

/**
 * Calculate new index for a drop operation.
 *
 * @param components - Component array
 * @param targetId - Target component ID
 * @param position - Drop position
 * @param draggedId - Dragged component ID
 * @returns New index for dragged component
 */
export function calculateDropIndex(
    components: PageComponent[],
    targetId: string,
    position: DropPosition,
    draggedId: string
): number {
    const targetIndex = components.findIndex(c => c.id === targetId);
    const draggedIndex = components.findIndex(c => c.id === draggedId);

    if (targetIndex === -1) return components.length;

    switch (position) {
        case 'before':
            // Insert before target
            return targetIndex;
        case 'after':
            // Insert after target
            return targetIndex + 1;
        case 'inside':
            // This would require adding as child - return -1 to signal this
            return -1;
        default:
            return components.length;
    }
}

/**
 * Validate if a drop operation is allowed.
 *
 * @param draggedId - Dragged component ID
 * @param targetId - Target component ID
 * @param position - Drop position
 * @param components - Component array
 * @returns True if drop is allowed
 */
export function validateDrop(
    draggedId: string,
    targetId: string,
    position: DropPosition,
    components: PageComponent[]
): boolean {
    // Can't drop on self
    if (draggedId === targetId) return false;

    // Can't drop inside own descendants
    if (position === 'inside') {
        const dragged = components.find(c => c.id === draggedId);
        const target = components.find(c => c.id === targetId);

        if (dragged && target) {
            const isDescendant = (parent: PageComponent, childId: string): boolean => {
                if (parent.id === childId) return true;
                if (parent.children) {
                    return parent.children.some(c => isDescendant(c, childId));
                }
                return false;
            };

            if (isDescendant(dragged, targetId)) {
                return false;
            }
        }
    }

    return true;
}
