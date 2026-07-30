/**
 * Builder Canvas - eSSR-based visual editor
 *
 * Uses renderPage from @frontbase/edge-core for rendering,
 * with an editing layer (selection, property panel) on top.
 * No React - pure vanilla TypeScript.
 */

import { renderPage } from '@frontbase/edge-core';
import type { PageLayoutData, PageComponent, TemplateContext } from '@frontbase/edge-core';
import { generateSelectionOverlay, calculateSelectionBoxes } from './editing/overlay.js';
import { CanvasEventManager, type CanvasEvent } from './editing/events.js';

export interface BuilderCanvasConfig {
  container: HTMLElement | string;
  context?: TemplateContext;
  onSelectionChange?: (componentIds: string[]) => void;
  onComponentUpdate?: (canvas: PageLayoutData) => void;
}

export interface BuilderCanvasState {
  canvas: PageLayoutData;
  selectedIds: string[];
  hoveredId: string | null;
}

export class BuilderCanvas {
  private config: BuilderCanvasConfig;
  private state: BuilderCanvasState;
  private container: HTMLElement;
  private eventManager: CanvasEventManager | null = null;
  private overlaySvg: SVGElement | null = null;

  constructor(config: BuilderCanvasConfig) {
    this.config = config;
    if (typeof config.container === 'string') {
      const element = document.getElementById(config.container);
      if (!element) {
        throw new Error('Container not found');
      }
      this.container = element;
    } else {
      this.container = config.container;
    }
    this.state = {
      canvas: { content: [] },
      selectedIds: [],
      hoveredId: null
    };
    this.initialize();
  }

  private initialize(): void {
    this.container.innerHTML = '';
    const canvasWrapper = document.createElement('div');
    canvasWrapper.id = 'fb-canvas-wrapper';
    canvasWrapper.style.position = 'relative';
    canvasWrapper.style.width = '100%';
    canvasWrapper.style.height = '100%';
    canvasWrapper.style.overflow = 'auto';
    this.container.appendChild(canvasWrapper);
    const canvasElement = document.createElement('div');
    canvasElement.id = 'fb-canvas';
    canvasElement.className = 'fb-canvas';
    canvasElement.style.position = 'relative';
    canvasElement.style.minHeight = '100%';
    this.container.appendChild(canvasElement);
    this.eventManager = new CanvasEventManager({
      container: this.container,
      onEvent: (event) => this.handleCanvasEvent(event)
    });
  }

  public async loadCanvas(canvas: PageLayoutData): Promise<void> {
    this.state.canvas = canvas;
    await this.render();
  }

  public getCanvas(): PageLayoutData {
    return this.state.canvas;
  }

  public setSelection(componentIds: string[]): void {
    this.state.selectedIds = componentIds;
    this.updateOverlay();
    if (this.config.onSelectionChange) {
      this.config.onSelectionChange(componentIds);
    }
    if (this.eventManager) {
      this.eventManager.setSelection(componentIds);
    }
  }

  public getSelection(): string[] {
    return this.state.selectedIds;
  }

  public updateComponentProps(componentId: string, props: Record<string, unknown>): void {
    const component = this.findComponent(componentId);
    if (component) {
      component.props = { ...component.props, ...props };
      this.render();
      if (this.config.onComponentUpdate) {
        this.config.onComponentUpdate(this.state.canvas);
      }
    }
  }

  public updateComponentStyles(componentId: string, styles: Record<string, unknown>): void {
    const component = this.findComponent(componentId);
    if (component) {
      if (!component.styles) {
        component.styles = {};
      }
      component.styles = { ...component.styles, ...styles };
      this.render();
      if (this.config.onComponentUpdate) {
        this.config.onComponentUpdate(this.state.canvas);
      }
    }
  }

  public addComponent(component: PageComponent, parentId: string | null = null, index?: number): void {
    const newComponent = { ...component };
    if (!newComponent.id) {
      newComponent.id = this.generateId();
    }
    if (parentId === null) {
      if (index !== undefined && index >= 0 && index <= this.state.canvas.content.length) {
        this.state.canvas.content.splice(index, 0, newComponent);
      } else {
        this.state.canvas.content.push(newComponent);
      }
    } else {
      const parent = this.findComponent(parentId);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        if (index !== undefined && index >= 0 && index <= parent.children.length) {
          parent.children.splice(index, 0, newComponent);
        } else {
          parent.children.push(newComponent);
        }
      }
    }
    this.render();
    if (this.config.onComponentUpdate) {
      this.config.onComponentUpdate(this.state.canvas);
    }
  }

  public removeComponent(componentId: string): void {
    this.findAndRemove(this.state.canvas.content, componentId);
    this.render();
    if (this.config.onComponentUpdate) {
      this.config.onComponentUpdate(this.state.canvas);
    }
  }

  private async render(): Promise<void> {
    const canvasElement = this.container.querySelector('#fb-canvas') as HTMLElement;
    if (!canvasElement) return;
    const context = this.config.context || this.getDefaultContext();
    const html = await renderPage(this.state.canvas, context);
    canvasElement.innerHTML = html;
    this.updateOverlay();
  }

  private getDefaultContext(): TemplateContext {
    return {
      page: {
        id: 'builder-preview',
        title: 'Builder Preview',
        url: '',
        slug: '',
        description: '',
        published: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        image: '',
        type: 'website',
        custom: {}
      },
      user: null,
      visitor: {
        ip: '',
        country: '',
        city: '',
        timezone: 'UTC',
        device: 'desktop',
        browser: '',
        os: '',
        language: 'en',
        referrer: '',
        isBot: false
      },
      url: {},
      system: {
        date: (new Date().toISOString().split('T')[0]) ?? '',
        time: (new Date().toISOString().split('T')[1]) ?? '',
        datetime: new Date().toISOString(),
        timestamp: Date.now(),
        year: new Date().getUTCFullYear(),
        month: new Date().getUTCMonth() + 1,
        day: new Date().getUTCDate(),
        env: 'development'
      },
      cookies: {},
      local: {},
      session: {},
      app: {}
    };
  }

  private updateOverlay(): void {
    if (!this.overlaySvg) {
      this.overlaySvg = this.createOverlaySvg();
      this.container.appendChild(this.overlaySvg);
    }
    const canvasElement = this.container.querySelector('#fb-canvas') as HTMLElement;
    if (!canvasElement) return;
    const boxes = calculateSelectionBoxes(this.state.selectedIds, canvasElement);
    const overlayHtml = generateSelectionOverlay(boxes);
    if (this.overlaySvg) {
      this.overlaySvg.outerHTML = overlayHtml;
      this.overlaySvg = this.container.querySelector('#fb-editing-overlay') as SVGElement;
    }
  }

  private createOverlaySvg(): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'fb-editing-overlay';
    svg.style.position = 'fixed';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '9998';
    return svg;
  }

  private handleCanvasEvent(event: CanvasEvent): void {
    switch (event.type) {
      case 'select':
        if (event.data && typeof event.data === 'object' && 'selectedIds' in event.data) {
          const ids = event.data.selectedIds as string[];
          this.setSelection(ids);
        }
        break;
      case 'hover':
        this.state.hoveredId = event.componentId;
        break;
      case 'delete':
        this.removeComponent(event.componentId);
        break;
      case 'drag-end':
        console.log('Drag ended');
        break;
    }
  }

  private findComponent(id: string): PageComponent | null {
    return this.searchComponent(this.state.canvas.content, id);
  }

  private searchComponent(components: PageComponent[], id: string): PageComponent | null {
    for (const component of components) {
      if (component.id === id) {
        return component;
      }
      if (component.children) {
        const found = this.searchComponent(component.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  private findAndRemove(components: PageComponent[], id: string): boolean {
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      if (!component) continue;
      if (component.id === id) {
        components.splice(i, 1);
        return true;
      }
      if (component.children) {
        if (this.findAndRemove(component.children, id)) {
          return true;
        }
      }
    }
    return false;
  }

  private generateId(): string {
    return 'comp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  public destroy(): void {
    if (this.eventManager) {
      this.eventManager.destroy();
      this.eventManager = null;
    }
    if (this.overlaySvg && this.overlaySvg.parentNode) {
      this.overlaySvg.parentNode.removeChild(this.overlaySvg);
      this.overlaySvg = null;
    }
    this.container.innerHTML = '';
  }
}
