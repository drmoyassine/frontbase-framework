import React, { useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay, DragOverEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Search,
  MoreHorizontal,
  Trash2,
  Copy,
  GripVertical,
  Edit2
} from 'lucide-react';
import { ComponentData } from '@/stores/builder';
import { cn } from '@/lib/utils';
import { findComponentWithParent, removeComponentFromTree, insertComponentIntoTree } from '@/lib/tree-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const LayersPanel: React.FC = () => {
  const {
    currentPageId,
    pages,
    selectedComponentId,
    setSelectedComponentId,
    updatePage,
    removeComponent,
    duplicateComponent,
    updateComponent
  } = useBuilderStore(useShallow(s => ({
    currentPageId: s.currentPageId,
    pages: s.pages,
    selectedComponentId: s.selectedComponentId,
    setSelectedComponentId: s.setSelectedComponentId,
    updatePage: s.updatePage,
    removeComponent: s.removeComponent,
    duplicateComponent: s.duplicateComponent,
    updateComponent: s.updateComponent
  })));

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const currentPage = pages.find(page => page.id === currentPageId);
  const components = currentPage?.layoutData?.content || [];

  // Expand all containers with children by default on page load
  React.useEffect(() => {
    if (components && components.length > 0) {
      const parentIds = new Set<string>();
      const collectParents = (items: ComponentData[]) => {
        items.forEach(item => {
          if (item.children && item.children.length > 0) {
            parentIds.add(item.id);
            collectParents(item.children);
          }
        });
      };
      collectParents(components);
      
      setExpandedComponents(prev => {
        const newSet = new Set(prev);
        parentIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  }, [currentPageId]); // Run once when page loads/changes

  // Sensors for drag and drop - add activation distance to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required to start drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleExpanded = (componentId: string) => {
    const newExpanded = new Set(expandedComponents);
    if (newExpanded.has(componentId)) {
      newExpanded.delete(componentId);
    } else {
      newExpanded.add(componentId);
    }
    setExpandedComponents(newExpanded);
  };

  const getComponentIcon = (type: string) => {
    const iconMap: Record<string, string> = {
      'Button': '🔘',
      'Text': '📝',
      'Heading': '📋',
      'Container': '📦',
      'Card': '🃏',
      'Image': '🖼️',
      'Link': '🔗',
      'Input': '📝',
      'Textarea': '📄',
      'Select': '📋',
      'Checkbox': '☑️',
      'Switch': '🔘',
      'Form': '📋',
      'DataTable': '📊',
    };
    return iconMap[type] || '🔲';
  };

  // Find component in tree for drag overlay
  const findActiveComponent = (id: string): ComponentData | null => {
    const result = findComponentWithParent(components, id);
    return result?.component || null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !currentPage || !currentPageId) {
      return;
    }

    const content = currentPage.layoutData?.content || [];

    // Find both components in the tree (works for nested components)
    const activeResult = findComponentWithParent(content, String(active.id));
    const overResult = findComponentWithParent(content, String(over.id));

    if (!activeResult || !overResult) {
      return;
    }

    // Only allow reordering within the same parent (same level)
    const activeParentId = activeResult.parent?.id ?? null;
    const overParentId = overResult.parent?.id ?? null;

    if (activeParentId !== overParentId) {
      // Different parents - don't allow cross-parent moves for now
      console.log('Cannot move between different parents');
      return;
    }

    // Same parent - reorder within siblings
    const siblings = activeResult.siblings;
    const activeIndex = activeResult.index;
    const overIndex = overResult.index;

    // Create deep copy of content and reorder
    const deepClone = (arr: ComponentData[]): ComponentData[] =>
      arr.map(c => ({ ...c, children: c.children ? deepClone(c.children) : undefined }));

    let newContent = deepClone(content);

    if (activeParentId === null) {
      // Top-level reorder
      newContent = arrayMove(newContent, activeIndex, overIndex);
    } else {
      // Nested reorder - find parent and reorder its children
      const updateChildren = (items: ComponentData[]): ComponentData[] => {
        return items.map(item => {
          if (item.id === activeParentId && item.children) {
            return { ...item, children: arrayMove(item.children, activeIndex, overIndex) };
          }
          if (item.children) {
            return { ...item, children: updateChildren(item.children) };
          }
          return item;
        });
      };
      newContent = updateChildren(newContent);
    }

    // Update page with new component order
    updatePage(currentPageId, {
      layoutData: {
        ...currentPage.layoutData,
        content: newContent
      }
    });

    // Reset drag state
    setActiveId(null);
    setOverId(null);
  };

  const filteredComponents = components.filter(component =>
    component.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search layers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Layers List */}
      <div className="flex-1 overflow-auto p-2">
        {filteredComponents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No layers found</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={filteredComponents.map(c => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredComponents.map((component, index) => (
                <SortableLayerItem
                  key={component.id}
                  component={component}
                  index={index}
                  depth={0}
                  isSelected={selectedComponentId === component.id}
                  isExpanded={expandedComponents.has(component.id)}
                  expandedComponents={expandedComponents}
                  onSelect={() => setSelectedComponentId(component.id)}
                  onToggleExpand={() => toggleExpanded(component.id)}
                  onSelectChild={(id: string) => setSelectedComponentId(id)}
                  onToggleExpandChild={(id: string) => toggleExpanded(id)}
                  getComponentIcon={getComponentIcon}
                  onDelete={(id) => removeComponent(id)}
                  onDuplicate={(id) => duplicateComponent(id)}
                  updateComponent={updateComponent}
                />
              ))}
            </SortableContext>

            {/* Drag Overlay - shows visual preview snapped to mouse */}
            <DragOverlay>
              {activeId ? (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-accent border-2 border-primary shadow-lg opacity-90">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{getComponentIcon(findActiveComponent(activeId)?.type || '')}</span>
                  <span className="text-sm font-medium">{findActiveComponent(activeId)?.type || 'Component'}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
};

interface SortableLayerItemProps {
  component: ComponentData;
  index: number;
  depth?: number;
  isSelected: boolean;
  isExpanded: boolean;
  expandedComponents: Set<string>;
  onSelect: () => void;
  onToggleExpand: () => void;
  onSelectChild: (id: string) => void;
  onToggleExpandChild: (id: string) => void;
  getComponentIcon: (type: string) => string;
  onDelete: (componentId: string) => void;
  onDuplicate: (componentId: string) => void;
  updateComponent: (id: string, propsUpdates: Record<string, any>) => void;
  isDropTarget?: boolean;
  isBeingDragged?: boolean;
}

const SortableLayerItem: React.FC<SortableLayerItemProps> = ({
  component,
  index,
  depth = 0,
  isSelected,
  isExpanded,
  expandedComponents,
  onSelect,
  onToggleExpand,
  onSelectChild,
  onToggleExpandChild,
  getComponentIcon,
  onDelete,
  onDuplicate,
  updateComponent,
  isDropTarget = false,
  isBeingDragged = false
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver
  } = useSortable({ id: component.id });

  const [isEditing, setIsEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(component.props?._layerName || component.type);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const hasChildren = component.children && component.children.length > 0;

  return (
    <>
      {/* Drop zone indicator above item */}
      {isOver && !isDragging && (
        <div className="h-0.5 bg-primary rounded-full mx-2 my-0.5" />
      )}
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "group flex items-center gap-2 px-2 py-1.5 rounded transition-all",
          "hover:bg-accent",
          isSelected && "bg-accent border-l-2 border-primary",
          isDragging && "ring-2 ring-primary/30 bg-muted"
        )}
      >
        {/* Indentation for depth */}
        {depth > 0 && <div style={{ width: depth * 16 }} />}

        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Expand/Collapse */}
        {hasChildren ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            className="h-5 w-5 p-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        ) : (
          <div className="w-5" />
        )}

        {/* Icon & Name */}
        <div
          className="flex-1 flex items-center gap-2 cursor-pointer min-w-0"
          onClick={onSelect}
          onDoubleClick={() => {
            setEditName(component.props?._layerName || component.type);
            setIsEditing(true);
          }}
        >
          <span className="text-sm shrink-0">{getComponentIcon(component.type)}</span>
          {isEditing ? (
            <Input
              value={editName}
              autoFocus
              className="h-6 py-0 px-1 text-sm bg-background"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIsEditing(false);
                  updateComponent(component.id, { _layerName: editName });
                } else if (e.key === 'Escape') {
                  setIsEditing(false);
                  setEditName(component.props?._layerName || component.type);
                }
              }}
              onBlur={() => {
                setIsEditing(false);
                updateComponent(component.id, { _layerName: editName });
              }}
            />
          ) : (
            <span className="text-sm font-medium truncate">
              {component.props?._layerName || component.type}
            </span>
          )}
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {
              setEditName(component.props?._layerName || component.type);
              setIsEditing(true);
            }}>
              <Edit2 className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(component.id)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(component.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Render children when expanded */}
      {isExpanded && hasChildren && (
        <div className="ml-2">
          <SortableContext
            items={component.children!.map(c => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {component.children!.map((child, childIndex) => (
              <SortableLayerItem
                key={child.id}
                component={child}
                index={childIndex}
                depth={depth + 1}
                isSelected={useBuilderStore.getState().selectedComponentId === child.id}
                isExpanded={expandedComponents.has(child.id)}
                expandedComponents={expandedComponents}
                onSelect={() => onSelectChild(child.id)}
                onToggleExpand={() => onToggleExpandChild(child.id)}
                onSelectChild={onSelectChild}
                onToggleExpandChild={onToggleExpandChild}
                getComponentIcon={getComponentIcon}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                updateComponent={updateComponent}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </>
  );
};