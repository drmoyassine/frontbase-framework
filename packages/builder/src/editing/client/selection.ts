/**
 * Selection Utilities — DOM selection utilities for the builder.
 *
 * This module provides utility functions for:
 * - Finding components in the DOM
 * - Calculating component positions
 * - Managing selection state
 * - Handling DOM traversal
 */

import type { PageComponent } from '@frontbase/edge-core';

/**
 * Component position in the DOM.
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

/**
 * Find a component element by ID in the iframe.
 *
 * @param iframe - Target iframe
 * @param id - Component ID to find
 * @returns Element if found, null otherwise
 */
export function findComponentById(iframe: HTMLIFrameElement, id: string): HTMLElement | null {
    const doc = iframe.contentDocument;
    if (!doc) return null;

    return doc.querySelector(`[data-fb-id="${id}"]`) as HTMLElement | null;
}

/**
 * Find all component elements in the iframe.
 *
 * @param iframe - Target iframe
 * @returns Array of component elements with their IDs and types
 */
export function findAllComponents(iframe: HTMLIFrameElement): Array<{ id: string; type: string; element: HTMLElement }> {
    const doc = iframe.contentDocument;
    if (!doc) return [];

    const elements = doc.querySelectorAll('[data-fb-id]');
    const result: Array<{ id: string; type: string; element: HTMLElement }> = [];

    elements.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;

        const id = el.getAttribute('data-fb-id');
        const type = el.getAttribute('data-fb-component');

        if (id && type) {
            result.push({ id, type, element: el });
        }
    });

    return result;
}

/**
 * Query component positions from the iframe.
 *
 * @param iframe - Target iframe
 * @returns Array of component positions
 */
export function queryComponentPositions(iframe: HTMLIFrameElement): ComponentPosition[] {
    const components = findAllComponents(iframe);
    const positions: ComponentPosition[] = [];

    for (const { id, type, element } of components) {
        const rect = element.getBoundingClientRect();
        const depth = calculateDepth(element);
        const parentId = findParentId(element);

        positions.push({
            id,
            type,
            rect: DOMRectReadOnly.fromRect(rect),
            parentId,
            depth
        });
    }

    return positions;
}

/**
 * Calculate the nesting depth of an element.
 *
 * @param element - Element to calculate depth for
 * @returns Depth value (0 for top-level)
 */
export function calculateDepth(element: HTMLElement): number {
    let depth = 0;
    let current = element.parentElement;

    while (current) {
        if (current.hasAttribute('data-fb-id')) {
            depth++;
        }
        current = current.parentElement;
    }

    return depth;
}

/**
 * Find the parent component ID for an element.
 *
 * @param element - Element to find parent for
 * @returns Parent component ID or undefined
 */
export function findParentId(element: HTMLElement): string | undefined {
    const parent = element.parentElement?.closest('[data-fb-id]') as HTMLElement | undefined;
    return parent?.getAttribute('data-fb-id') || undefined;
}

/**
 * Get component ID from an element (handles nested components).
 *
 * @param element - Element to get ID from
 * @returns Component ID or null
 */
export function getComponentId(element: HTMLElement): string | undefined {
    const el = element.closest('[data-fb-id]') as HTMLElement | null;
    return el?.getAttribute('data-fb-id') || undefined;
}

/**
 * Get component type from an element.
 *
 * @param element - Element to get type from
 * @returns Component type or null
 */
export function getComponentType(element: HTMLElement): string | null {
    const el = element.closest('[data-fb-component]') as HTMLElement | null;
    return el?.getAttribute('data-fb-component') || null;
}

/**
 * Check if an element is a component.
 *
 * @param element - Element to check
 * @returns True if element is a component
 */
export function isComponent(element: HTMLElement): boolean {
    return element.hasAttribute('data-fb-id') && element.hasAttribute('data-fb-component');
}

/**
 * Get the closest component ancestor.
 *
 * @param element - Element to start from
 * @returns Closest component element or null
 */
export function getClosestComponent(element: HTMLElement): HTMLElement | undefined {
    return element.closest('[data-fb-id]') as HTMLElement | undefined;
}

/**
 * Get component path (array of IDs from root to component).
 *
 * @param iframe - Target iframe
 * @param id - Component ID
 * @returns Array of component IDs
 */
export function getComponentPath(iframe: HTMLIFrameElement, id: string): string[] {
    const element = findComponentById(iframe, id);
    if (!element) return [];

    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current) {
        const currentId = current.getAttribute('data-fb-id');
        if (currentId) {
            path.unshift(currentId);
        }
        current = current.parentElement?.closest('[data-fb-id]') as HTMLElement | null;
    }

    return path;
}

/**
 * Find common ancestor component ID for two components.
 *
 * @param iframe - Target iframe
 * @param id1 - First component ID
 * @param id2 - Second component ID
 * @returns Common ancestor ID or null
 */
export function findCommonAncestor(iframe: HTMLIFrameElement, id1: string, id2: string): string | undefined {
    const path1 = getComponentPath(iframe, id1);
    const path2 = getComponentPath(iframe, id2);

    let commonId: string | undefined = undefined;

    for (let i = 0; i < Math.min(path1.length, path2.length); i++) {
        if (path1[i] === path2[i]) {
            commonId = path1[i];
        } else {
            break;
        }
    }

    return commonId;
}

/**
 * Create a selection highlight element.
 *
 * @param rect - Component rectangle
 * @param id - Component ID
 * @param type - Component type
 * @param isSelected - Whether this is the selected component
 * @returns Highlight element
 */
export function createHighlightElement(
    rect: DOMRect,
    id: string,
    type: string,
    isSelected: boolean = true
): HTMLDivElement {
    const highlight = document.createElement('div');
    highlight.className = `fb-highlight ${isSelected ? 'fb-selected' : 'fb-hovered'}`;
    highlight.setAttribute('data-highlight-id', id);

    const borderColor = isSelected ? '#3b82f6' : 'rgba(59, 130, 246, 0.5)';
    const backgroundColor = isSelected ? 'transparent' : 'rgba(59, 130, 246, 0.1)';
    const zIndex = isSelected ? 1000 : 999;

    highlight.style.cssText = `
        position: absolute;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: ${isSelected ? '2px' : '1px'} solid ${borderColor};
        background-color: ${backgroundColor};
        pointer-events: none;
        z-index: ${zIndex};
        transition: all 0.15s ease-out;
        box-sizing: border-box;
    `;

    // Add label
    const label = document.createElement('div');
    label.className = 'fb-highlight-label';
    label.textContent = `${type} (${id})`;
    label.style.cssText = `
        position: absolute;
        top: -24px;
        left: 0;
        background: ${isSelected ? '#3b82f6' : '#6b7280'};
        color: white;
        padding: 2px 6px;
        font-size: 11px;
        font-family: system-ui, -apple-system, sans-serif;
        border-radius: 3px;
        white-space: nowrap;
        pointer-events: none;
    `;

    highlight.appendChild(label);

    return highlight;
}

/**
 * Highlight a component in the overlay.
 *
 * @param overlay - Overlay element
 * @param rect - Component rectangle
 * @param id - Component ID
 * @param type - Component type
 * @param isSelected - Whether this is the selected component
 * @returns Highlight element
 */
export function highlightComponent(
    overlay: HTMLElement,
    rect: DOMRect,
    id: string,
    type: string,
    isSelected: boolean = true
): HTMLDivElement {
    // Remove existing highlight for this component
    const existing = overlay.querySelector(`[data-highlight-id="${id}"]`);
    if (existing) {
        existing.remove();
    }

    const highlight = createHighlightElement(rect, id, type, isSelected);
    overlay.appendChild(highlight);

    return highlight;
}

/**
 * Clear a component highlight.
 *
 * @param overlay - Overlay element
 * @param id - Component ID to clear
 */
export function clearHighlight(overlay: HTMLElement, id: string): void {
    const highlight = overlay.querySelector(`[data-highlight-id="${id}"]`);
    if (highlight) {
        highlight.remove();
    }
}

/**
 * Clear all highlights.
 *
 * @param overlay - Overlay element
 * @param keepSelected - Whether to keep the selected highlight
 */
export function clearAllHighlights(overlay: HTMLElement, keepSelected: boolean = false): void {
    const highlights = overlay.querySelectorAll('.fb-highlight');
    for (const highlight of Array.from(highlights)) {
        if (keepSelected && highlight.classList.contains('fb-selected')) {
            continue;
        }
        highlight.remove();
    }
}

/**
 * Calculate insertion index for drop position.
 *
 * @param components - Component array
 * @param targetId - Target component ID
 * @param position - Drop position ('before', 'after', 'inside')
 * @returns Index to insert at
 */
export function calculateInsertIndex(
    components: PageComponent[],
    targetId: string,
    position: 'before' | 'after' | 'inside'
): number {
    const targetIndex = components.findIndex(c => c.id === targetId);

    if (targetIndex === -1) return components.length;

    switch (position) {
        case 'before':
            return targetIndex;
        case 'after':
            return targetIndex + 1;
        case 'inside':
            // Insert inside the target (at end of its children)
            return -1; // Special value for "inside"
        default:
            return components.length;
    }
}

/**
 * Convert DOM coordinates to iframe-local coordinates.
 *
 * @param iframe - Target iframe
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns Coordinates relative to iframe
 */
export function domToIframeCoordinates(iframe: HTMLIFrameElement, x: number, y: number): { x: number; y: number } {
    const rect = iframe.getBoundingClientRect();
    return {
        x: x - rect.left,
        y: y - rect.top
    };
}

/**
 * Check if a point is inside a component rectangle.
 *
 * @param point - Point coordinates
 * @param rect - Component rectangle
 * @returns True if point is inside rectangle
 */
export function isPointInRect(point: { x: number; y: number }, rect: DOMRect): boolean {
    return (
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom
    );
}

/**
 * Find component at point in iframe.
 *
 * @param iframe - Target iframe
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns Component ID and type if found, null otherwise
 */
export function findComponentAtPoint(iframe: HTMLIFrameElement, x: number, y: number): { id: string; type: string } | null {
    const coords = domToIframeCoordinates(iframe, x, y);

    const doc = iframe.contentDocument;
    if (!doc) return null;

    const element = doc.elementFromPoint(coords.x, coords.y);
    if (!element) return null;

    const component = getClosestComponent(element as HTMLElement);
    if (!component) return null;

    const id = component.getAttribute('data-fb-id');
    const type = component.getAttribute('data-fb-component');

    if (id && type) {
        return { id, type };
    }

    return null;
}
