/**
 * Event Handlers - Canvas editing event management
 */

import type { PageComponent } from '@frontbase/edge-core';
import type { SelectionBox } from './overlay.js';

export type CanvasEventHandler = (event: CanvasEvent) => void;

export interface CanvasEvent {
  type: 'select' | 'hover' | 'drag-start' | 'drag-move' | 'drag-end' | 'resize' | 'delete';
  componentId: string;
  data?: Record<string, unknown>;
}

export interface DragState {
  componentId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  initialBox: SelectionBox;
}

export interface EventManagerConfig {
  container: HTMLElement;
  onEvent: CanvasEventHandler;
}

/**
 * Event Manager for canvas interactions.
 */
export class CanvasEventManager {
  private config: EventManagerConfig;
  private dragState: DragState | null = null;
  private hoveredId: string | null = null;
  private selectedIds: Set<string> = new Set();
  private eventListeners: Map<string, Array<EventListener>> = new Map();

  constructor(config: EventManagerConfig) {
    this.config = config;
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const container = this.config.container;
    const clickHandler = (e: Event) => this.handleClick(e as MouseEvent);
    container.addEventListener('click', clickHandler);
    this.eventListeners.set('click', [clickHandler]);
    const moveHandler = (e: Event) => this.handleMouseMove(e as MouseEvent);
    container.addEventListener('mousemove', moveHandler);
    this.eventListeners.set('mousemove', [moveHandler]);
    const downHandler = (e: Event) => this.handleMouseDown(e as MouseEvent);
    container.addEventListener('mousedown', downHandler);
    this.eventListeners.set('mousedown', [downHandler]);
    const upHandler = (e: Event) => this.handleMouseUp(e as MouseEvent);
    window.addEventListener('mouseup', upHandler);
    this.eventListeners.set('mouseup', [upHandler]);
    const keyHandler = (e: Event) => this.handleKeyDown(e as KeyboardEvent);
    window.addEventListener('keydown', keyHandler);
    this.eventListeners.set('keydown', [keyHandler]);
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const componentId = this.findComponentId(target);

    if (componentId) {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey) {
        if (this.selectedIds.has(componentId)) {
          this.selectedIds.delete(componentId);
        } else {
          this.selectedIds.add(componentId);
        }
      } else {
        this.selectedIds.clear();
        this.selectedIds.add(componentId);
      }
      this.emitEvent({
        type: 'select',
        componentId,
        data: { selectedIds: Array.from(this.selectedIds) }
      });
    } else {
      this.selectedIds.clear();
      this.emitEvent({
        type: 'select',
        componentId: '',
        data: { selectedIds: [] }
      });
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const componentId = this.findComponentId(target);

    if (componentId !== this.hoveredId) {
      this.hoveredId = componentId;
      if (componentId) {
        this.emitEvent({
          type: 'hover',
          componentId,
          data: { mouseX: event.clientX, mouseY: event.clientY }
        });
      }
    }

    if (this.dragState) {
      const deltaX = event.clientX - this.dragState.startX;
      const deltaY = event.clientY - this.dragState.startY;
      this.dragState.currentX = event.clientX;
      this.dragState.currentY = event.clientY;
      this.emitEvent({
        type: 'drag-move',
        componentId: this.dragState.componentId,
        data: { deltaX, deltaY }
      });
    }
  }

  private handleMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    if (target.classList.contains('fb-resize-handle')) {
      const selectionGroup = target.closest('[data-fb-selection]');
      if (selectionGroup) {
        const componentId = selectionGroup.getAttribute('data-fb-selection');
        if (componentId) {
          this.emitEvent({
            type: 'resize',
            componentId,
            data: { 
              handle: target.getAttribute('data-handle'),
              startX: event.clientX,
              startY: event.clientY
            }
          });
          return;
        }
      }
    }

    const componentId = this.findComponentId(target);
    if (componentId && this.selectedIds.has(componentId)) {
      event.preventDefault();
      const element = this.config.container.querySelector('[data-fb-id="' + componentId + '"]') as HTMLElement;
      if (element) {
        const rect = element.getBoundingClientRect();
        this.dragState = {
          componentId,
          startX: event.clientX,
          startY: event.clientY,
          currentX: event.clientX,
          currentY: event.clientY,
          initialBox: {
            componentId,
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          }
        };
        this.emitEvent({
          type: 'drag-start',
          componentId,
          data: { startX: event.clientX, startY: event.clientY }
        });
      }
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (this.dragState) {
      const deltaX = event.clientX - this.dragState.startX;
      const deltaY = event.clientY - this.dragState.startY;
      this.emitEvent({
        type: 'drag-end',
        componentId: this.dragState.componentId,
        data: { deltaX, deltaY }
      });
      this.dragState = null;
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedIds.size > 0) {
        event.preventDefault();
        for (const id of this.selectedIds) {
          this.emitEvent({
            type: 'delete',
            componentId: id
          });
        }
        this.selectedIds.clear();
      }
    }
  }

  private findComponentId(element: HTMLElement | null): string | null {
    if (!element) return null;
    if (element.dataset.fbId) {
      return element.dataset.fbId;
    }
    let current = element;
    while (current && current !== this.config.container) {
      if (current.dataset.fbId) {
        return current.dataset.fbId;
      }
      current = current.parentElement as HTMLElement;
    }
    return null;
  }

  private emitEvent(event: CanvasEvent): void {
    this.config.onEvent(event);
  }

  public setSelection(ids: string[]): void {
    this.selectedIds = new Set(ids);
  }

  public getSelection(): string[] {
    return Array.from(this.selectedIds);
  }

  public destroy(): void {
    const container = this.config.container;
    for (const [eventType, listeners] of this.eventListeners) {
      for (const listener of listeners) {
        if (eventType === 'mouseup' || eventType === 'keydown') {
          window.removeEventListener(eventType, listener);
        } else {
          container.removeEventListener(eventType, listener);
        }
      }
    }
    this.eventListeners.clear();
  }
}
