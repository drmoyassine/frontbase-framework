import { ComponentData } from '@/stores/builder';

export interface DropZone {
  id: string;
  type: 'first' | 'between' | 'last';
  index: number;
  label: string;
}

export interface DropZoneContext {
  draggedComponentId: string;
  siblingComponents: ComponentData[];
  parentId?: string;
}

/**
 * Calculate valid drop zones for a dragged component within a container
 * Eliminates redundant zones (current position and adjacent positions)
 */
export function calculateValidDropZones(context: DropZoneContext): DropZone[] {
  const { draggedComponentId, siblingComponents, parentId } = context;
  const dropZones: DropZone[] = [];
  
  // Find the current index of the dragged component
  const draggedIndex = siblingComponents.findIndex(comp => comp.id === draggedComponentId);
  const isDraggedFromSameParent = draggedIndex !== -1;
  
  // If container is empty or dragged component is from different parent
  if (siblingComponents.length === 0 || !isDraggedFromSameParent) {
    return [{
      id: 'first',
      type: 'first',
      index: 0,
      label: 'Drop at beginning'
    }];
  }
  
  // Generate drop zones, skipping invalid positions
  for (let i = 0; i <= siblingComponents.length; i++) {
    const isCurrentPosition = i === draggedIndex;
    const isAdjacentAfter = i === draggedIndex + 1;
    
    // Skip current position and adjacent position after
    if (isCurrentPosition || isAdjacentAfter) {
      continue;
    }
    
    // Adjust index if dropping after the dragged component was removed
    let adjustedIndex = i;
    if (isDraggedFromSameParent && i > draggedIndex) {
      adjustedIndex = i - 1;
    }
    
    if (i === 0) {
      // Drop at first position (only if not already first)
      if (draggedIndex !== 0) {
        dropZones.push({
          id: `first-${adjustedIndex}`,
          type: 'first',
          index: adjustedIndex,
          label: 'Drop at beginning'
        });
      }
    } else if (i === siblingComponents.length) {
      // Drop at last position (only if not already last)
      if (draggedIndex !== siblingComponents.length - 1) {
        dropZones.push({
          id: `last-${adjustedIndex}`,
          type: 'last',
          index: adjustedIndex,
          label: 'Drop at end'
        });
      }
    } else {
      // Drop between components
      const beforeComponent = siblingComponents[i - 1];
      const afterComponent = siblingComponents[i];
      dropZones.push({
        id: `between-${beforeComponent.id}-${afterComponent.id}`,
        type: 'between',
        index: adjustedIndex,
        label: `Drop between ${beforeComponent.type} and ${afterComponent.type}`
      });
    }
  }
  
  return dropZones;
}

/**
 * Check if a drop zone should be rendered for a specific component
 */
export function shouldRenderDropZone(
  componentId: string,
  componentIndex: number,
  draggedComponentId: string | null,
  siblingComponents: ComponentData[],
  zoneType: 'above' | 'after'
): boolean {
  const isLastComponent = componentIndex === siblingComponents.length - 1;

  // Always apply smart validation logic for both palette and existing component drags
  if (!draggedComponentId) {
    // For palette drags, apply smart validation to prevent visual clutter
    // Show first drop zone only for first component
    if (zoneType === 'above' && componentIndex === 0) {
      return true;
    }
    // Show between zones (above non-first components)
    if (zoneType === 'above' && componentIndex > 0) {
      return true;
    }
    // Show last zone only for last component
    if (zoneType === 'after') {
      return isLastComponent;
    }
    return false;
  }
  
  const context: DropZoneContext = {
    draggedComponentId,
    siblingComponents,
  };
  
  const validZones = calculateValidDropZones(context);
  
  if (zoneType === 'above') {
    // Check if there's a valid drop zone at this component's index
    return validZones.some(zone => zone.index === componentIndex);
  } else {
    // CRITICAL FIX: Only show 'after' zone if this is the last component AND there's a valid 'last' zone AND it's not the dragged component itself
    if (!isLastComponent) {
      return false;
    }
    
    const hasValidLastZone = validZones.some(zone => zone.type === 'last');
    const isDraggingThisComponent = draggedComponentId === componentId;
    
    return hasValidLastZone && !isDraggingThisComponent;
  }
}

/**
 * Get visual styling for different drop zone types
 */
export function getDropZoneStyle(type: 'first' | 'between' | 'last', isActive: boolean) {
  const baseClasses = 'transition-all duration-200 rounded';
  const hoverClasses = 'hover:bg-primary/10';
  
  if (isActive) {
    const activeClasses = 'border-2 border-primary border-dashed';
    switch (type) {
      case 'first':
        return `${baseClasses} ${activeClasses} bg-green-500/20 h-6`;
      case 'last':
        return `${baseClasses} ${activeClasses} bg-orange-500/20 h-6`;
      case 'between':
        return `${baseClasses} ${activeClasses} bg-primary/30 h-4`;
    }
  }
  
  switch (type) {
    case 'first':
    case 'last':
      return `${baseClasses} ${hoverClasses} h-6`;
    case 'between':
      return `${baseClasses} ${hoverClasses} h-4`;
  }
}