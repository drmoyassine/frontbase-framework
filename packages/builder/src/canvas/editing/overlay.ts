/**
 * Editing Overlay - Selection and editing UI for the canvas
 * 
 * Provides SVG-based selection overlays and editing controls that
 * are embedded in the canvas HTML.
 */

export interface SelectionBox {
  componentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayConfig {
  showBorders?: boolean;
  showLabels?: boolean;
  highlightColor?: string;
  borderWidth?: number;
}

/**
 * Generate SVG overlay HTML for component selection.
 */
export function generateSelectionOverlay(
  selections: Map<string, SelectionBox>,
  config: OverlayConfig = {}
): string {
  const {
    showBorders = true,
    showLabels = true,
    highlightColor = '#3b82f6',
    borderWidth = 2
  } = config;

  const overlays: string[] = [];

  for (const [id, box] of selections) {
    const overlay = `
      <g data-fb-selection="${id}" class="fb-selection-group">
        ${showBorders ? `
          <rect
            x="${box.x}"
            y="${box.y}"
            width="${box.width}"
            height="${box.height}"
            fill="none"
            stroke="${highlightColor}"
            stroke-width="${borderWidth}"
            class="fb-selection-border"
          />
        ` : ''}
        
        ${showLabels ? `
          <text
            x="${box.x}"
            y="${box.y - 4}"
            fill="${highlightColor}"
            font-size="12"
            font-family="system-ui, sans-serif"
            class="fb-selection-label"
          >${id}</text>
        ` : ''}
        
        <!-- Resize handles -->
        <circle
          cx="${box.x + box.width}"
          cy="${box.y + box.height}"
          r="6"
          fill="${highlightColor}"
          class="fb-resize-handle"
          data-handle="se"
        />
        <circle
          cx="${box.x}"
          cy="${box.y + box.height}"
          r="6"
          fill="${highlightColor}"
          class="fb-resize-handle"
          data-handle="sw"
        />
        <circle
          cx="${box.x + box.width}"
          cy="${box.y}"
          r="6"
          fill="${highlightColor}"
          class="fb-resize-handle"
          data-handle="ne"
        />
        <circle
          cx="${box.x}"
          cy="${box.y}"
          r="6"
          fill="${highlightColor}"
          class="fb-resize-handle"
          data-handle="nw"
        />
      </g>
    `;
    overlays.push(overlay);
  }

  return `
    <svg
      id="fb-editing-overlay"
      style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;"
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>
        .fb-selection-group { pointer-events: auto; cursor: pointer; }
        .fb-selection-border { vector-effect: non-scaling-stroke; }
        .fb-resize-handle { cursor: pointer; pointer-events: auto; }
        .fb-resize-handle:hover { fill-opacity: 0.7; }
      </style>
      ${overlays.join('')}
    </svg>
  `;
}

/**
 * Generate hover highlight overlay.
 */
export function generateHoverOverlay(
  componentId: string,
  box: SelectionBox,
  config: OverlayConfig = {}
): string {
  const {
    highlightColor = '#3b82f6',
    borderWidth = 2
  } = config;

  return `
    <g data-fb-hover="${componentId}" class="fb-hover-group">
      <rect
        x="${box.x}"
        y="${box.y}"
        width="${box.width}"
        height="${box.height}"
        fill="none"
        stroke="${highlightColor}"
        stroke-width="${borderWidth}"
        stroke-dasharray="5,5"
        class="fb-hover-border"
        style="pointer-events:none;"
      />
    </g>
  `;
}

/**
 * Generate drag ghost overlay during component movement.
 */
export function generateDragGhost(
  componentId: string,
  box: SelectionBox,
  deltaX: number,
  deltaY: number
): string {
  return `
    <g data-fb-drag-ghost="${componentId}" class="fb-drag-ghost">
      <rect
        x="${box.x + deltaX}"
        y="${box.y + deltaY}"
        width="${box.width}"
        height="${box.height}"
        fill="rgba(59, 130, 246, 0.2)"
        stroke="#3b82f6"
        stroke-width="2"
        class="fb-drag-ghost-rect"
      />
    </g>
  `;
}

/**
 * Clear all overlays from the SVG.
 */
export function clearOverlays(): string {
  return `
    <svg
      id="fb-editing-overlay"
      style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;"
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>
        .fb-selection-group { pointer-events: auto; cursor: pointer; }
        .fb-resize-handle { cursor: pointer; pointer-events: auto; }
      </style>
    </svg>
  `;
}

/**
 * Get the bounding box of a DOM element relative to the viewport.
 */
export function getElementBoundingBox(element: HTMLElement): SelectionBox {
  const rect = element.getBoundingClientRect();
  return {
    componentId: element.dataset.fbId || '',
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  };
}

/**
 * Calculate selection boxes for all selected components.
 */
export function calculateSelectionBoxes(
  componentIds: string[],
  container: HTMLElement
): Map<string, SelectionBox> {
  const boxes = new Map<string, SelectionBox>();
  
  for (const id of componentIds) {
    const element = container.querySelector(`[data-fb-id="${id}"]`) as HTMLElement;
    if (element) {
      const box = getElementBoundingBox(element);
      box.componentId = id;
      boxes.set(id, box);
    }
  }
  
  return boxes;
}
