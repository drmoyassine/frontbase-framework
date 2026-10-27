/**
 * Canvas Model - Pure functions for canvas manipulation
 * 
 * These functions are framework-agnostic and work with the PageComponent
 * tree structure from @frontbase/edge-core.
 */

import type { PageComponent, PageLayoutData } from '@frontbase/edge-core';

/**
 * Generate a unique ID for a component.
 */
export function generateId(prefix: string = 'comp'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an empty canvas with default structure.
 */
export function emptyCanvas(): PageLayoutData {
  return {
    content: [],
    root: {
      className: 'fb-canvas',
      containerStyles: {
        values: {
          minHeight: '100vh',
          padding: '0',
          margin: '0'
        }
      }
    }
  };
}

/**
 * Find a component by ID in the component tree.
 */
export function findComponentById(
  components: PageComponent[],
  id: string
): PageComponent | null {
  for (const component of components) {
    if (component.id === id) {
      return component;
    }
    if (component.children) {
      const found = findComponentById(component.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Add a node to the canvas.
 * 
 * @param canvas - The current canvas layout
 * @param parentId - ID of the parent component (null for root level)
 * @param component - The component to add
 * @param index - Optional index to insert at (defaults to end)
 * @returns Updated canvas layout
 */
export function addNode(
  canvas: PageLayoutData,
  parentId: string | null,
  component: PageComponent,
  index?: number
): PageLayoutData {
  const newCanvas = JSON.parse(JSON.stringify(canvas)) as PageLayoutData;
  
  // Ensure the component has an ID
  if (!component.id) {
    component.id = generateId(component.type);
  }

  if (parentId === null) {
    // Add to root level
    if (index !== undefined && index >= 0 && index <= newCanvas.content.length) {
      newCanvas.content.splice(index, 0, component);
    } else {
      newCanvas.content.push(component);
    }
  } else {
    // Add to parent's children
    const parent = findComponentById(newCanvas.content, parentId);
    if (parent) {
      if (!parent.children) {
        parent.children = [];
      }
      if (index !== undefined && index >= 0 && index <= parent.children.length) {
        parent.children.splice(index, 0, component);
      } else {
        parent.children.push(component);
      }
    }
  }

  return newCanvas;
}

/**
 * Move a node to a new parent or position.
 * 
 * @param canvas - The current canvas layout
 * @param componentId - ID of the component to move
 * @param newParentId - ID of the new parent (null for root level)
 * @param newIndex - Optional new index
 * @returns Updated canvas layout
 */
export function moveNode(
  canvas: PageLayoutData,
  componentId: string,
  newParentId: string | null,
  newIndex?: number
): PageLayoutData {
  const newCanvas = JSON.parse(JSON.stringify(canvas)) as PageLayoutData;
  
  // Find and remove the component from its current location
  const component = findAndRemove(newCanvas.content, componentId);
  
  if (!component) {
    return canvas; // Component not found
  }

  // Add it to the new location
  return addNode(newCanvas, newParentId, component, newIndex);
}

/**
 * Remove a node from the canvas.
 * 
 * @param canvas - The current canvas layout
 * @param componentId - ID of the component to remove
 * @returns Updated canvas layout
 */
export function removeNode(
  canvas: PageLayoutData,
  componentId: string
): PageLayoutData {
  const newCanvas = JSON.parse(JSON.stringify(canvas)) as PageLayoutData;
  findAndRemove(newCanvas.content, componentId);
  return newCanvas;
}

/**
 * Update component properties.
 * 
 * @param canvas - The current canvas layout
 * @param componentId - ID of the component to update
 * @param props - New props to merge
 * @returns Updated canvas layout
 */
export function updateProps(
  canvas: PageLayoutData,
  componentId: string,
  props: Record<string, unknown>
): PageLayoutData {
  const newCanvas = JSON.parse(JSON.stringify(canvas)) as PageLayoutData;
  const component = findComponentById(newCanvas.content, componentId);
  
  if (component) {
    component.props = { ...component.props, ...props };
  }

  return newCanvas;
}

/**
 * Update component styles.
 * 
 * @param canvas - The current canvas layout
 * @param componentId - ID of the component to update
 * @param styles - New styles to merge
 * @returns Updated canvas layout
 */
export function updateStyles(
  canvas: PageLayoutData,
  componentId: string,
  styles: Record<string, unknown>
): PageLayoutData {
  const newCanvas = JSON.parse(JSON.stringify(canvas)) as PageLayoutData;
  const component = findComponentById(newCanvas.content, componentId);
  
  if (component) {
    if (!component.styles) {
      component.styles = {};
    }
    component.styles = { ...component.styles, ...styles };
  }

  return newCanvas;
}

/**
 * Select a component (returns the component for display in property panel).
 * 
 * @param canvas - The current canvas layout
 * @param componentId - ID of the component to select
 * @returns The component or null
 */
export function selectNode(
  canvas: PageLayoutData,
  componentId: string
): PageComponent | null {
  return findComponentById(canvas.content, componentId);
}

/**
 * Get all components of a specific type.
 */
export function getComponentsByType(
  canvas: PageLayoutData,
  type: string
): PageComponent[] {
  const results: PageComponent[] = [];
  
  function search(components: PageComponent[]) {
    for (const component of components) {
      if (component.type === type) {
        results.push(component);
      }
      if (component.children) {
        search(component.children);
      }
    }
  }
  
  search(canvas.content);
  return results;
}

/**
 * Get the path to a component (array of parent IDs).
 */
export function getComponentPath(
  canvas: PageLayoutData,
  componentId: string
): string[] {
  const path: string[] = [];
  
  function search(components: PageComponent[], targetId: string): boolean {
    for (const component of components) {
      if (component.id === targetId) {
        return true;
      }
      if (component.children && search(component.children, targetId)) {
        path.unshift(component.id);
        return true;
      }
    }
    return false;
  }
  
  search(canvas.content, componentId);
  return path;
}

// Helper function to find and remove a component
function findAndRemove(
  components: PageComponent[],
  id: string
): PageComponent | null {
  for (let i = 0; i < components.length; i++) {
    const component = components[i];
    if (!component) continue;
    if (component.id === id) {
      const removed = components.splice(i, 1)[0];
      return removed ?? null;
    }
    if (component.children) {
      const found = findAndRemove(component.children, id);
      if (found) return found;
    }
  }
  return null;
}
