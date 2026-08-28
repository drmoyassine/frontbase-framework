import React, { useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { BuilderHeader } from './BuilderHeader';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { BuilderCanvas } from './BuilderCanvas';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { findComponent } from '@/lib/tree-utils';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Bot } from 'lucide-react';
import { WorkspaceAgentChat } from '../agent/WorkspaceAgentChat';
import { getSectionTemplate, expandTemplate } from './templates';
import { getDefaultProps } from '@/lib/componentDefaults';
import * as LucideIcons from 'lucide-react';
import './builder.css';

export const CustomBuilder: React.FC = () => {
  const {
    currentPageId,
    pages,
    isPreviewMode,
    deleteSelectedComponent,
    selectedComponentId,
    setSelectedComponentId,
    savePageToDatabase,
    moveComponent,
    currentViewport,
    setCurrentViewport,
    updateComponent,
  } = useBuilderStore(useShallow(s => ({
    currentPageId: s.currentPageId,
    pages: s.pages,
    isPreviewMode: s.isPreviewMode,
    deleteSelectedComponent: s.deleteSelectedComponent,
    selectedComponentId: s.selectedComponentId,
    setSelectedComponentId: s.setSelectedComponentId,
    savePageToDatabase: s.savePageToDatabase,
    moveComponent: s.moveComponent,
    currentViewport: s.currentViewport,
    setCurrentViewport: s.setCurrentViewport,
    updateComponent: s.updateComponent,
  })));

  // Keyboard shortcuts integration
  useKeyboardShortcuts({
    onSave: async () => {
      if (currentPageId) {
        try {
          await savePageToDatabase(currentPageId);
          toast.success('Page saved successfully!');
        } catch (error) {
          toast.error('Failed to save page');
        }
      }
    },
    onDeleteRequest: () => setShowDeleteDialog(true),
  });

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeItem, setActiveItem] = useState<any>(null);

  // Sidebar state (mobile uses open/close, desktop uses collapsed/expanded)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false); // Mobile
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false); // Mobile
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false); // Desktop
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false); // Desktop
  const [isMobile, setIsMobile] = useState(false);
  const [agentChatOpen, setAgentChatOpen] = useState(false);

  // Detect mobile screen size and auto-switch viewport
  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth;
      setIsMobile(width < 1024);

      // Auto-switch canvas viewport based on screen size
      if (width < 768) {
        setCurrentViewport('mobile');
      } else if (width >= 768 && width < 1024) {
        setCurrentViewport('tablet');
      } else {
        setCurrentViewport('desktop');
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [setCurrentViewport]);

  const currentPage = pages.find(page => page.id === currentPageId);

  // Configure drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px threshold to prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag start - store the active item for overlay
  const handleDragStart = (event: DragStartEvent) => {
    setActiveItem(event.active.data.current);
  };

  // Handle drag end - add component to canvas or reorder existing
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveItem(null);

    if (!over) return;

    const overData = over.data.current;
    const activeData = active.data.current;

    // Determine if this is an existing component being moved or new component from palette
    const isExistingComponent = activeData?.type === 'existing-component';
    const isNewComponent = activeData?.type && activeData.type !== 'existing-component';

    // Handle EXISTING component reordering on drop zones
    if (overData?.type === 'drop-zone' && isExistingComponent) {
      console.log('Reordering existing component to index:', overData.index);

      if (currentPageId && activeData.component) {
        moveComponent(
          currentPageId,
          activeData.component.id,  // Pass the component ID to move it
          activeData.component,
          overData.index,
          overData.parentId,
          activeData.parentId  // Source parent ID
        );
      }
      return;
    }

    // Handle NEW component drops on drop zones (from palette)
    if (overData?.type === 'drop-zone' && isNewComponent) {
      console.log('Dropped new component on drop zone:', overData.index);

      let newComponent;

      // If this is a template section, expand it
      if (activeData.isTemplate) {
        const template = getSectionTemplate(activeData.type);
        if (template) {
          newComponent = expandTemplate(template);
        }
      }

      // Fallback for non-template components
      if (!newComponent) {
        newComponent = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: activeData.type,
          props: getDefaultProps(activeData.type),
          styles: {},
          children: []
        };
      }

      if (currentPageId) {
        moveComponent(
          currentPageId,
          null,  // null means it's a new component
          newComponent,
          overData.index,
          overData.parentId
        );
        setSelectedComponentId(newComponent.id);
      }
      return;
    }

    // Handle drops INTO containers (Container, Row, Column)
    if (overData?.type === 'container' && isNewComponent) {
      console.log('Dropped component into container:', overData.componentId);

      let newComponent;

      // If this is a template section, expand it
      if (activeData.isTemplate) {
        const template = getSectionTemplate(activeData.type);
        if (template) {
          newComponent = expandTemplate(template);
        }
      }

      // Fallback for non-template components
      if (!newComponent) {
        newComponent = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: activeData.type,
          props: getDefaultProps(activeData.type),
          styles: {},
          children: []
        };
      }

      if (currentPageId) {
        // Add to end of container's children
        moveComponent(
          currentPageId,
          null,  // null means it's a new component
          newComponent,
          -1,  // -1 = append to end
          overData.componentId  // Parent container ID
        );
        setSelectedComponentId(newComponent.id);
      }
      return;
    }

    // Handle EXISTING component drops INTO containers
    if (overData?.type === 'container' && isExistingComponent) {
      console.log('Moving existing component into container:', overData.componentId);

      if (currentPageId && activeData.component) {
        moveComponent(
          currentPageId,
          activeData.component.id,
          activeData.component,
          -1,  // -1 = append to end
          overData.componentId,  // Target container
          activeData.parentId  // Source parent
        );
      }
      return;
    }

    // Handle drops on empty canvas
    if (over.id === 'canvas-drop-zone' && isNewComponent) {
      console.log('Dropped component on empty canvas:', activeData.type);

      let newComponent;

      // If this is a template section, expand it
      if (activeData.isTemplate) {
        const template = getSectionTemplate(activeData.type);
        if (template) {
          newComponent = expandTemplate(template);
        }
      }

      // Fallback for non-template components
      if (!newComponent) {
        newComponent = {
          id: `${Date.now()} -${Math.random()} `,
          type: activeData.type,
          props: getDefaultProps(activeData.type),
          styles: {},
          children: []
        };
      }

      if (currentPageId) {
        moveComponent(currentPageId, null, newComponent, 0);
        setSelectedComponentId(newComponent.id);
      }
    }

    // Handle FEATURE CARD drops (dragging cards between sections)
    if (activeData?.type === 'feature-card') {
      const sourceSectionId = activeData.sectionId;
      const sourceCardIndex = activeData.cardIndex;
      const cardData = activeData.card;

      // Check if dropped on a feature-section or its drop area
      if (overData?.type === 'feature-section') {
        const targetSectionId = overData.sectionId;

        // Find source and target sections
        const currentPage = pages.find(p => p.id === currentPageId);
        if (!currentPage?.layoutData?.content) return;

        const sourceSection = findComponent(currentPage.layoutData.content, sourceSectionId);
        const targetSection = findComponent(currentPage.layoutData.content, targetSectionId);

        if (sourceSection && targetSection) {
          // Remove from source
          const newSourceFeatures = [...(sourceSection.props?.features || [])];
          newSourceFeatures.splice(sourceCardIndex, 1);
          updateComponent(sourceSectionId, { features: newSourceFeatures });

          // Add to target
          const newTargetFeatures = [...(targetSection.props?.features || []), {
            ...cardData,
            id: `feature-${Date.now()}` // New ID for the moved card
          }];
          updateComponent(targetSectionId, { features: newTargetFeatures });

          toast.success('Card moved to section');
        }
      }
    }
  };

  // Keyboard event handling
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Save shortcut (Ctrl/Cmd + S)
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (currentPageId) {
          savePageToDatabase(currentPageId);
        }
        return;
      }

      // Delete component (Delete or Backspace)
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedComponentId) {
        // Only delete if not in an input field
        const activeElement = document.activeElement;
        const isInInput = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.hasAttribute('contenteditable')
        );

        if (!isInInput) {
          event.preventDefault();
          setShowDeleteDialog(true);
        }
        return;
      }

      // Escape to deselect
      if (event.key === 'Escape' && selectedComponentId) {
        setSelectedComponentId(null);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentPageId, selectedComponentId, savePageToDatabase, deleteSelectedComponent, setSelectedComponentId]);

  if (!currentPage) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">No Page Selected</h2>
          <p className="text-muted-foreground">Create or select a page to start building.</p>
        </div>
      </div>
    );
  }

  const handleDeleteConfirm = () => {
    deleteSelectedComponent();
    setShowDeleteDialog(false);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen flex flex-col bg-background">
        <BuilderHeader
          isMobile={isMobile}
          onToggleLeftSidebar={() => setLeftSidebarOpen(!leftSidebarOpen)}
          onToggleRightSidebar={() => setRightSidebarOpen(!rightSidebarOpen)}
        />

        <div className={`builder-layout ${isPreviewMode ? 'preview-mode' : 'design-mode'}`}>
          {/* Mobile backdrop - only show when a drawer is open */}
          {isMobile && (leftSidebarOpen || rightSidebarOpen) && (
            <div
              className="builder-backdrop"
              onClick={() => {
                setLeftSidebarOpen(false);
                setRightSidebarOpen(false);
              }}
            />
          )}

          {/* Left Sidebar - Components & Layers */}
          {!isPreviewMode && (
            <>
              <div className={cn(
                "builder-sidebar left-sidebar",
                isMobile && leftSidebarOpen && "open",
                !isMobile && leftSidebarCollapsed && "collapsed"
              )}>
                <LeftSidebar />
              </div>
              {/* Desktop collapse toggle for left sidebar */}
              {!isMobile && (
                <button
                  onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
                  className="flex-shrink-0 w-5 h-full flex items-center justify-center bg-card border-r border-border hover:bg-accent transition-colors order-1"
                  aria-label={leftSidebarCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
                >
                  {leftSidebarCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              )}
            </>
          )}

          {/* Center - Canvas */}
          <div className="builder-canvas">
            <BuilderCanvas page={currentPage} />
          </div>

          {/* Right Sidebar - Properties & Styling */}
          {!isPreviewMode && (
            <>
              {/* Desktop collapse toggle for right sidebar */}
              {!isMobile && (
                <button
                  onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
                  className="flex-shrink-0 w-5 h-full flex items-center justify-center bg-card border-l border-border hover:bg-accent transition-colors order-3"
                  aria-label={rightSidebarCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
                >
                  {rightSidebarCollapsed ? (
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              )}
              <div className={cn(
                "builder-sidebar right-sidebar",
                isMobile && rightSidebarOpen && "open",
                !isMobile && rightSidebarCollapsed && "collapsed"
              )}>
                <RightSidebar />
              </div>
            </>
          )}
        </div>

        <DeleteConfirmationDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDeleteConfirm}
        />

        {/* Floating Edge Buttons - Mobile only */}
        {isMobile && !isPreviewMode && (
          <>
            {/* Left edge - Hamburger for Components/Layers */}
            <button
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              className="fixed left-0 top-1/2 -translate-y-1/2 z-50 w-12 h-16 bg-card border-r border-t border-b border-border rounded-r-lg shadow-md hover:shadow-lg transition-shadow flex items-center justify-center"
              aria-label="Toggle Components"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            {/* Right edge - Wrench for Properties/Styling */}
            <button
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className="fixed right-0 top-1/2 -translate-y-1/2 z-50 w-12 h-16 bg-card border-l border-t border-b border-border rounded-l-lg shadow-md hover:shadow-lg transition-shadow flex items-center justify-center"
              aria-label="Toggle Properties"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
              </svg>
            </button>
          </>
        )}
        
        {/* Floating AI Agent Button */}
        <button
          onClick={() => setAgentChatOpen(!agentChatOpen)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105"
          aria-label="Toggle Agent Chat"
        >
          <Bot className="w-6 h-6" />
        </button>

        <WorkspaceAgentChat 
          isOpen={agentChatOpen} 
          onClose={() => setAgentChatOpen(false)} 
        />
      </div>

      {/* Drag Overlay - Shows custom preview while dragging */}
      {/* CRITICAL: dropAnimation={null} prevents snap-back! */}
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          activeItem.type === 'feature-card' && activeItem.card ? (
            // Card-like preview for feature cards
            <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-4 border-2 border-blue-500 opacity-95 min-w-[180px]">
              <div className="flex flex-col items-center gap-2 text-center">
                {/* Icon */}
                {(() => {
                  const IconComponent = (LucideIcons as any)[activeItem.card.icon];
                  return IconComponent ? (
                    <IconComponent className="w-8 h-8 text-primary" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-primary-100 dark:bg-primary-900/30" />
                  );
                })()}
                {/* Title */}
                <span className="font-bold text-sm">{activeItem.card.title || 'Feature Card'}</span>
                {/* Description preview */}
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {activeItem.card.description?.slice(0, 50) || ''}
                </span>
              </div>
            </div>
          ) : (
            // Default component preview
            <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-3 border-2 border-primary-500 opacity-90">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-600 dark:text-primary-400">
                    {activeItem.type?.charAt(0) || 'C'}
                  </span>
                </div>
                <span className="font-bold text-sm">{activeItem.type || 'Component'}</span>
              </div>
            </div>
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};