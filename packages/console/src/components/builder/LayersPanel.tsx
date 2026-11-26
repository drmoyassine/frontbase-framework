import React, { useState } from 'react';
import { DndContext, useDroppable, useDndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {wrapLayout} from '@/lib/builder/wrapLayout';
import {builderCollisionDetection} from '@/lib/builder/collisionDetection';
import {CONTAINER_TYPES} from '@/lib/builder/iframeTypes';
import { CSS } from '@dnd-kit/utilities';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { findComponentWithParent } from '@/lib/tree-utils';
import {resolveBlockTree} from '@frontbase/edge-core/block-versions';
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
    removeComponent,
    duplicateComponent,
    updateComponent
  } = useBuilderStore(useShallow(s => ({
    currentPageId: s.currentPageId,
    pages: s.pages,
    selectedComponentId: s.selectedComponentId,
    setSelectedComponentId: s.setSelectedComponentId,
    removeComponent: s.removeComponent,
    duplicateComponent: s.duplicateComponent,
    updateComponent: s.updateComponent
  })));

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [placement, setPlacement] = useState<'before' | 'after' | 'inside'>('before');
  const [moveMessage, setMoveMessage] = useState('');
  const dragScope = React.useRef<{pageId: string | null; versions: Readonly<Record<string, string>>} | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const focusLayer = (id: string) => {
    const grips = panelRef.current?.querySelectorAll<HTMLButtonElement>('button[data-layer-grip]');
    if (grips) Array.from(grips).find(grip => grip.dataset.layerGrip === id)?.focus();
  };
  const selections=useBuilderStore(state=>state.editingVersions);
  const move=useBuilderStore(state=>state.moveComponent);

  const currentPage = pages.find(page => page.id === currentPageId);
  const components = resolveBlockTree(currentPage?.layoutData?.content || [],()=>undefined,selections);

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
    dragScope.current = {pageId: currentPageId, versions: selections};
    setActiveId(String(event.active.id));
  };

  const handleDragCancel = () => {
    dragScope.current = null;
    setActiveId(null);
  };

  const moveLayer = (id: string, targetId: string, placement?: 'before' | 'after' | 'inside') => {
    if (!currentPage?.layoutData || !currentPageId || id === targetId) return false;
    const source=findComponentWithParent(components,id);
    const target=findComponentWithParent(components,targetId);
    if (!source || !target) return false;
    const isContainer = CONTAINER_TYPES.has(target.component.type);
    const place = placement ?? (isContainer ? 'inside' : 'before');
    if (place === 'inside' && !isContainer) return false;
    const parentId=place==='inside'?targetId:target.parent?.id;
    const index=place==='inside'?-1:target.index+(place==='after'?1:0);
    move(currentPageId,id,source.component,index,parentId,source.parent?.id);
    const next = useBuilderStore.getState().pages.find(page => page.id === currentPageId)?.layoutData;
    if (!next || next === currentPage.layoutData) return false;
    if(parentId)setExpandedComponents(previous=>new Set([...previous,parentId]));
    const moved = findComponentWithParent(resolveBlockTree(next.content, () => undefined, selections), id);
    setSelectedComponentId(id);
    setMoveMessage(`Moved ${source.component.props?._layerName || source.component.type} to position ${(moved?.index ?? 0) + 1} of ${moved?.siblings.length ?? 1}.`);
    requestAnimationFrame(() => focusLayer(id));
    return true;
  };

  const handleDragEnd = ({active,over}: DragEndEvent) => {
    setActiveId(null);
    const start = dragScope.current;
    dragScope.current = null;
    if (start && (start.pageId !== currentPageId || start.versions !== selections)) return;
    if (!over) return;
    const targetId=String(over.data.current?.componentId ?? over.id);
    moveLayer(String(active.id),targetId,over.data.current?.placement);
  };

  const targets: { id: string; label: string; container: boolean }[] = [];
  const collectTargets = (nodes: ComponentData[], prefix = '') => {
    for (const node of nodes) {
      if (node.id === moveId) continue;
      const label = prefix + (node.props?._layerName || node.type);
      targets.push({ id: node.id, label, container: CONTAINER_TYPES.has(node.type) });
      if (node.children) collectTargets(node.children, label + ' / ');
    }
  };
  if (moveId) collectTargets(components);

  const filteredComponents = components.filter(component =>
    component.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div ref={panelRef} className="h-full flex flex-col bg-background">
      <p className="sr-only" role="status" aria-atomic="true">{moveMessage}</p>
      <Dialog open={!!moveId} onOpenChange={open => { if (!open) setMoveId(null); }}>
        <DialogContent onCloseAutoFocus={event => {
          event.preventDefault();
          const id = useBuilderStore.getState().selectedComponentId;
          if (id) focusLayer(id);
        }}>
          <DialogHeader><DialogTitle>Move layer</DialogTitle>
            <DialogDescription>Choose a destination and where to place this layer.</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1">Destination
            <select className="rounded border bg-background p-2" value={destination} onChange={event => {
              setDestination(event.target.value); setPlacement('before'); setMoveMessage('');
            }}>
              <option value="">Select a layer</option>
              {targets.map(target => <option key={target.id} value={target.id}>{target.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Placement
            <select className="rounded border bg-background p-2" value={placement} onChange={event =>
              setPlacement(event.target.value as typeof placement)}>
              <option value="before">Before</option><option value="after">After</option>
              {targets.find(target => target.id === destination)?.container && <option value="inside">Inside</option>}
            </select>
          </label>
          {moveMessage && <p role="status">{moveMessage}</p>}
          <Button disabled={!destination} onClick={() => {
            if (moveId && moveLayer(moveId, destination, placement)) setMoveId(null);
            else setMoveMessage('Choose a different position in the current Block Version.');
          }}>Move</Button>
        </DialogContent>
      </Dialog>
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
            collisionDetection={builderCollisionDetection}
            onDragStart={handleDragStart}
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
                  onMove={id => {setSelectedComponentId(id);setDestination('');setPlacement('before');setMoveMessage('');setMoveId(id);}}
                  onWrap={(id,type) => {const wrapper=wrapLayout(id,type);if(wrapper)setExpandedComponents(previous=>new Set([...previous,wrapper]));}}
                  updateComponent={updateComponent}
                />
              ))}
            </SortableContext>

            {/* Drag Overlay - shows visual preview snapped to mouse */}
            <DragOverlay dropAnimation={null}>
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
  onMove: (componentId: string) => void;
  onWrap: (componentId:string,type:'Row'|'Column') => void;
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
  onMove,
  onWrap,
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
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "relative group flex items-center gap-2 px-2 py-1.5 rounded motion-reduce:!transition-none",
          "hover:bg-accent",
          isSelected && "bg-accent border-l-2 border-primary",
          isDragging && "ring-2 ring-primary/30 bg-muted"
        )}
      >
        <LayerDrop component={component} placement="before" />
        {CONTAINER_TYPES.has(component.type) && <LayerDrop component={component} placement="inside" />}
        <LayerDrop component={component} placement="after" />
        {/* Indentation for depth */}
        {depth > 0 && <div style={{ width: depth * 16 }} />}

        {/* Drag Handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${component.props?._layerName || component.type}`}
          data-layer-grip={component.id}
          className="grid h-7 w-7 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 shrink-0 place-items-center touch-none select-none rounded cursor-grab active:cursor-grabbing focus-visible:outline"
        >
          <GripVertical aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Expand/Collapse */}
        {hasChildren ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${component.props?._layerName || component.type}`}
            aria-expanded={isExpanded}
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
              aria-label={`Actions for ${component.props?._layerName || component.type}`}
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:opacity-100"
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
            <DropdownMenuItem onSelect={() => onMove(component.id)}>Move to…</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onWrap(component.id,'Row')}>Wrap in Row</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onWrap(component.id,'Column')}>Wrap in Column</DropdownMenuItem>
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
                onMove={onMove}
                onWrap={onWrap}
                updateComponent={updateComponent}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </>
  );
};

/** Explicit thirds keep nesting distinct from sibling ordering. */
function LayerDrop({component,placement}:{component:ComponentData;placement:'before'|'inside'|'after'}) {
  const {active}=useDndContext();
  const {setNodeRef,isOver}=useDroppable({id:'layer-'+placement+'-'+component.id,data:{componentId:component.id,placement}});
  if(!active || active.id===component.id)return null;
  return <div ref={setNodeRef} style={{position:'absolute',left:0,right:0,height:placement==='inside'?'50%':'25%',top:placement==='before'?0:placement==='inside'?'25%':'75%',pointerEvents:'none',zIndex:10}}
    className={cn(isOver && (placement==='inside'?'ring-2 ring-blue-500 bg-blue-500/20':placement==='before'?'border-t-2 border-blue-500':'border-b-2 border-blue-500'))}>
    {isOver && <span className="absolute right-0 bg-blue-600 text-white text-[10px] px-1 rounded">{placement==='inside'?'Nest inside': 'Insert '+placement}</span>}
  </div>;
}
