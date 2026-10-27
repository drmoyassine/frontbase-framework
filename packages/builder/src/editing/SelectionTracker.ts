/**
 * SelectionTracker — Click-to-select logic for the builder canvas.
 *
 * This class handles:
 * - Finding component positions in the iframe
 * - Drawing selection rectangles
 * - Handling clicks and hover events
 * - Tracking hover state
 *
 * RULE 1: This is vanilla TypeScript, no React.
 * RULE 2: Uses data-fb-id attributes to find components in the rendered DOM.
 */

import type { PageComponent } from '@frontbase/edge-core';
import type { ComponentRect, SelectionHighlight, CanvasConfig, ComponentPosition } from './types.js';

/**
 * Selection configuration options.
 */
export interface SelectionTrackerOptions {
    /** Selection highlight color (default: blue) */
    highlightColor?: string;
    /** Selection border width (default: 2px) */
    borderWidth?: string;
    /** Hover highlight color (default: light blue) */
    hoverColor?: string;
    /** Whether to show component labels on hover (default: true) */
    showLabels?: boolean;
    /** Whether to allow nested selection (default: true) */
    allowNestedSelection?: boolean;
}

/**
 * SelectionTracker — Manages component selection in the canvas.
 *
 * Provides:
 * - Query component positions from the iframe
 * - Highlight selected component
 * - Handle click/hover events
 * - Track selection state
 */
export class SelectionTracker {
    /** Canvas configuration (iframe, overlay, container) */
    private _config: CanvasConfig | null;
    /** Current selection highlights */
    private _highlights: Map<string, SelectionHighlight>;
    /** Current selection ID */
    private _selectedId: string | null | undefined;
    /** Current hover ID */
    private _hoveredId: string | null;
    /** Selection callback */
    private _onSelect: (id: string | null) => void;
    /** Component cache for position queries */
    private _componentCache: Map<string, ComponentRect>;
    /** Configuration options */
    private _options: Required<SelectionTrackerOptions>;
    /** Hover timeout debouncing */
    private _hoverTimeout: number | null;
    /** Event listeners cleanup */
    private _cleanup: Array<() => void>;
    /** Mutation observer for DOM changes */
    private _mutationObserver: MutationObserver | null;

    /**
     * Create a new SelectionTracker instance.
     *
     * @param onSelect - Callback when selection changes
     * @param options - Configuration options
     */
    constructor(
        onSelect: (id: string | null) => void,
        options: SelectionTrackerOptions = {}
    ) {
        this._config = null;
        this._highlights = new Map();
        this._selectedId = null;
        this._hoveredId = null;
        this._onSelect = onSelect;
        this._componentCache = new Map();
        this._hoverTimeout = null;
        this._cleanup = [];
        this._mutationObserver = null;

        this._options = {
            highlightColor: options.highlightColor || '#3b82f6',
            borderWidth: options.borderWidth || '2px',
            hoverColor: options.hoverColor || 'rgba(59, 130, 246, 0.1)',
            showLabels: options.showLabels ?? true,
            allowNestedSelection: options.allowNestedSelection ?? true
        };
    }

    /**
     * Get the current selection ID.
     */
    get selectedId(): string | null | undefined {
        return this._selectedId;
    }

    /**
     * Get the current hover ID.
     */
    get hoveredId(): string | null {
        return this._hoveredId;
    }

    /**
     * Check if the tracker is attached to a canvas.
     */
    get isAttached(): boolean {
        return this._config !== null;
    }

    /**
     * Attach the tracker to a canvas configuration.
     *
     * @param config - Canvas configuration (iframe, overlay, container)
     */
    attachEventListeners(config: CanvasConfig): void {
        if (this._config) {
            throw new Error('Already attached to a canvas');
        }

        this._config = config;

        const { iframe, overlay } = config;

        // Wait for iframe to load
        if (iframe.contentDocument) {
            this._attachIframeListeners(iframe, overlay);
        } else {
            iframe.addEventListener('load', () => {
                this._attachIframeListeners(iframe, overlay);
            });
            this._cleanup.push(() => {
                iframe.removeEventListener('load', () => {
                    this._attachIframeListeners(iframe, overlay);
                });
            });
        }

        // Listen to overlay clicks (for selection highlights)
        overlay.addEventListener('click', this._handleOverlayClick);
        this._cleanup.push(() => {
            overlay.removeEventListener('click', this._handleOverlayClick);
        });

        // Setup mutation observer to track DOM changes
        this._setupMutationObserver(iframe);
    }

    /**
     * Query component positions from the iframe.
     *
     * @param iframe - Target iframe element
     * @param components - Optional component tree (for depth calculation)
     * @returns Array of component positions
     */
    queryComponentRects(iframe: HTMLIFrameElement, components?: PageComponent[]): ComponentPosition[] {
        const doc = iframe.contentDocument;
        if (!doc) return [];

        const positions: ComponentPosition[] = [];
        const elements = doc.querySelectorAll('[data-fb-id]');

        elements.forEach((el) => {
            if (!(el instanceof HTMLElement)) return;

            const id = el.getAttribute('data-fb-id');
            const type = el.getAttribute('data-fb-component');

            if (!id || !type) return;

            const rect = el.getBoundingClientRect();
            const depth = this._calculateDepth(el);

            positions.push({
                id,
                type,
                rect: DOMRectReadOnly.fromRect(rect),
                parentId: this._findParentId(el),
                depth
            });
        });

        // Update cache
        this._componentCache.clear();
        for (const pos of positions) {
            this._componentCache.set(pos.id, {
                id: pos.id,
                type: pos.type,
                rect: pos.rect as DOMRect,
                parentId: pos.parentId,
                depth: pos.depth
            });
        }

        return positions;
    }

    /**
     * Highlight a selected component.
     *
     * @param id - Component ID to highlight (null to clear selection)
     */
    highlightSelected(id: string | null | undefined): void {
        // Clear existing highlights
        this._clearHighlights();

        this._selectedId = id;

        if (id && this._config) {
            const rect = this._componentCache.get(id);
            if (rect) {
                this._createHighlight(id, rect, true);
            }
        }
    }

    /**
     * Handle hover over a component.
     *
     * @param id - Component ID being hovered (null to clear hover)
     */
    handleHover(id: string | null): void {
        if (this._hoverTimeout) {
            clearTimeout(this._hoverTimeout);
        }

        this._hoverTimeout = window.setTimeout(() => {
            this._hoveredId = id;
            if (id && id !== this._selectedId && this._config) {
                const rect = this._componentCache.get(id);
                if (rect) {
                    this._createHighlight(id, rect, false);
                }
            } else if (!id) {
                this._clearHoverHighlights();
            }
        }, 50);
    }

    /**
     * Detach event listeners and cleanup.
     */
    destroy(): void {
        // Clear all highlights
        this._clearHighlights();

        // Cleanup event listeners
        for (const cleanup of this._cleanup) {
            cleanup();
        }
        this._cleanup = [];

        // Clear mutation observer
        if (this._mutationObserver) {
            this._mutationObserver.disconnect();
            this._mutationObserver = null;
        }

        // Clear caches
        this._componentCache.clear();

        // Clear config
        this._config = null;

        // Clear hover timeout
        if (this._hoverTimeout) {
            clearTimeout(this._hoverTimeout);
        }
    }

    /**
     * Attach iframe event listeners.
     */
    private _attachIframeListeners(iframe: HTMLIFrameElement, overlay: HTMLElement): void {
        const doc = iframe.contentDocument;
        if (!doc) return;

        // Click handler for component selection
        const handleClick = (e: Event) => {
            const target = e.target as HTMLElement;
            const id = this._findComponentId(target);

            if (id) {
                this._onSelect(id);
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // Mouse move handler for hover
        const handleMouseMove = (e: Event) => {
            const target = (e.target as HTMLElement).closest('[data-fb-id]') as HTMLElement;
            const id = target?.getAttribute('data-fb-id') || null;
            this.handleHover(id);
        };

        // Use capture phase to intercept events
        doc.addEventListener('click', handleClick, true);
        doc.addEventListener('mousemove', handleMouseMove, true);

        this._cleanup.push(() => {
            doc.removeEventListener('click', handleClick, true);
            doc.removeEventListener('mousemove', handleMouseMove, true);
        });
    }

    /**
     * Find component ID from an element (handles nested components).
     */
    private _findComponentId(element: HTMLElement): string | null {
        const el = element.closest('[data-fb-id]') as HTMLElement;
        return el?.getAttribute('data-fb-id') || null;
    }

    /**
     * Find parent component ID for a given element.
     */
    private _findParentId(element: HTMLElement): string | undefined {
        const parent = element.parentElement?.closest('[data-fb-id]') as HTMLElement | undefined;
        return parent?.getAttribute('data-fb-id') || undefined;
    }

    /**
     * Calculate nesting depth of an element.
     */
    private _calculateDepth(element: HTMLElement): number {
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
     * Create a selection highlight element.
     */
    private _createHighlight(id: string, rect: ComponentRect, isSelected: boolean): void {
        if (!this._config) return;

        const { overlay } = this._config;

        const highlight = document.createElement('div');
        highlight.className = `fb-highlight ${isSelected ? 'fb-selected' : 'fb-hovered'}`;
        highlight.style.cssText = `
            position: absolute;
            left: ${rect.rect.left}px;
            top: ${rect.rect.top}px;
            width: ${rect.rect.width}px;
            height: ${rect.rect.height}px;
            border: ${isSelected ? this._options.borderWidth : '1px'} solid ${isSelected ? this._options.highlightColor : this._options.hoverColor};
            background-color: ${isSelected ? 'transparent' : this._options.hoverColor};
            pointer-events: none;
            z-index: ${isSelected ? 1000 : 999};
            transition: all 0.15s ease-out;
        `;

        // Add label for selected or if showLabels is enabled
        if (isSelected || this._options.showLabels) {
            const label = document.createElement('div');
            label.className = 'fb-highlight-label';
            label.textContent = `${rect.type} (${id})`;
            label.style.cssText = `
                position: absolute;
                top: -24px;
                left: 0;
                background: ${isSelected ? this._options.highlightColor : '#6b7280'};
                color: white;
                padding: 2px 6px;
                font-size: 11px;
                font-family: system-ui, -apple-system, sans-serif;
                border-radius: 3px;
                white-space: nowrap;
                pointer-events: none;
            `;
            highlight.appendChild(label);
        }

        overlay.appendChild(highlight);

        this._highlights.set(id, {
            id,
            element: highlight,
            rect
        });
    }

    /**
     * Clear all selection highlights.
     */
    private _clearHighlights(): void {
        for (const highlight of this._highlights.values()) {
            highlight.element.remove();
        }
        this._highlights.clear();
    }

    /**
     * Clear only hover highlights (keep selection).
     */
    private _clearHoverHighlights(): void {
        const toRemove: string[] = [];

        for (const [id, highlight] of this._highlights) {
            if (id !== this._selectedId) {
                highlight.element.remove();
                toRemove.push(id);
            }
        }

        for (const id of toRemove) {
            this._highlights.delete(id);
        }
    }

    /**
     * Setup mutation observer to detect DOM changes.
     */
    private _setupMutationObserver(iframe: HTMLIFrameElement): void {
        const doc = iframe.contentDocument;
        if (!doc) return;

        this._mutationObserver = new MutationObserver(() => {
            // Debounced re-query of component positions
            if (this._config) {
                this.queryComponentRects(iframe);
            }
        });

        this._mutationObserver.observe(doc.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-fb-id', 'data-fb-component']
        });
    }

    /**
     * Handle overlay click (clicking on selection highlights).
     */
    private _handleOverlayClick = (e: MouseEvent): void => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('fb-highlight') || target.classList.contains('fb-highlight-label')) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
}
