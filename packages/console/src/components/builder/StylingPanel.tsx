import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Trash2, Copy, Monitor, Tablet, Smartphone } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { StylesPanel } from '@/components/styles/StylesPanel';
import { ThemeSelector } from '@/components/builder/ThemeSelector';
import type { StylesData, ViewportType, VisibilitySettings } from '@/lib/styles/types';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';

const VIEWPORT_LABELS: Record<ViewportType, { label: string; icon: React.ElementType }> = {
  desktop: { label: 'Desktop', icon: Monitor },
  tablet: { label: 'Tablet', icon: Tablet },
  mobile: { label: 'Mobile', icon: Smartphone },
};

export const StylingPanel: React.FC = () => {
  const {
    selectedComponentId,
    currentPageId,
    currentViewport,
    pages,
    updatePage,
    updateComponentStylesData,
    setSelectedComponentId
  } = useBuilderStore(useShallow(s => ({
    selectedComponentId: s.selectedComponentId,
    currentPageId: s.currentPageId,
    currentViewport: s.currentViewport,
    pages: s.pages,
    updatePage: s.updatePage,
    updateComponentStylesData: s.updateComponentStylesData,
    setSelectedComponentId: s.setSelectedComponentId
  })));

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);


  const currentPage = pages.find(page => page.id === currentPageId);

  // Recursive function to find component by ID
  const findComponentById = (components: any[], id: string): any => {
    for (const comp of components) {
      if (comp.id === id) return comp;
      if (comp.children) {
        const found = findComponentById(comp.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedComponent = currentPage?.layoutData?.content ?
    findComponentById(currentPage.layoutData.content, selectedComponentId || '') : null;

  if (!selectedComponent) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-muted-foreground text-sm">No component selected</div>
          <div className="text-xs text-muted-foreground mt-1">
            Select a component to edit its styles
          </div>
        </div>
      </div>
    );
  }

  // Recursive function to update component in nested structure
  const updateComponentInContent = (components: any[], componentId: string, updates: any): any[] => {
    return components.map(comp => {
      if (comp.id === componentId) {
        return { ...comp, ...updates };
      }
      if (comp.children) {
        return {
          ...comp,
          children: updateComponentInContent(comp.children, componentId, updates)
        };
      }
      return comp;
    });
  };

  const deleteComponent = () => {
    if (!currentPage) return;

    const removeComponentFromContent = (components: any[], componentId: string): any[] => {
      return components.filter(comp => {
        if (comp.id === componentId) return false;
        if (comp.children) {
          comp.children = removeComponentFromContent(comp.children, componentId);
        }
        return true;
      });
    };

    const updatedContent = removeComponentFromContent(currentPage.layoutData.content, selectedComponentId!);

    updatePage(currentPage.id, {
      layoutData: {
        ...currentPage.layoutData,
        content: updatedContent
      }
    });

    setSelectedComponentId(null);
    setShowDeleteDialog(false);
  };

  // Get component styles in StylesData format (or create default)
  // For non-desktop viewports, merge base values with viewport overrides
  const getComponentStyles = (): StylesData => {
    const baseStyles: StylesData = selectedComponent.stylesData || {
      activeProperties: [],
      values: {},
      stylingMode: 'visual'
    };

    // For desktop, return base styles as-is
    if (currentViewport === 'desktop') {
      return baseStyles;
    }

    // For mobile/tablet, merge base values with viewport overrides
    const viewportOverrides = baseStyles.viewportOverrides?.[currentViewport] || {};

    // Collect active properties from both base and viewport overrides
    const overridePropertyIds = Object.keys(viewportOverrides);
    const allActiveProperties = [...new Set([
      ...baseStyles.activeProperties,
      ...overridePropertyIds
    ])];

    return {
      ...baseStyles,
      activeProperties: allActiveProperties,
      values: {
        ...baseStyles.values,
        ...viewportOverrides
      }
    };
  };

  // Update component with new StylesData
  // For desktop: update base values
  // For mobile/tablet: update viewportOverrides
  const handleStylesUpdate = (newStyles: StylesData) => {
    if (!currentPage || !selectedComponentId) return;

    const existingStyles: StylesData = selectedComponent.stylesData || {
      activeProperties: [],
      values: {},
      stylingMode: 'visual'
    };

    let updatedStylesData: StylesData;

    if (currentViewport === 'desktop') {
      // Desktop: update base values directly
      updatedStylesData = {
        ...existingStyles,
        activeProperties: newStyles.activeProperties || [],
        values: newStyles.values || {},
        stylingMode: newStyles.stylingMode || 'visual',
        rawCSS: newStyles.rawCSS || ''
      };
    } else {
      // Mobile/Tablet: store the edited values as the viewport override. (The
      // previous implementation noted it could diff against base to store only
      // changes, but in practice it stored the full edited set — preserved
      // verbatim to avoid a behavior change.)
      updatedStylesData = {
        ...existingStyles,
        viewportOverrides: {
          ...existingStyles.viewportOverrides,
          [currentViewport]: { ...newStyles.values }
        }
      };
    }

    updateComponentStylesData(selectedComponentId, updatedStylesData);
  };

  // Copy all styles from another viewport to the current viewport
  const copyStylesFromViewport = (sourceViewport: ViewportType) => {
    if (!currentPage || !selectedComponentId || !selectedComponent.stylesData) return;

    const existingStyles: StylesData = selectedComponent.stylesData;

    // Get source styles - either base values or viewport overrides
    const sourceStyles = sourceViewport === 'desktop'
      ? existingStyles.values || {}
      : { ...existingStyles.values, ...existingStyles.viewportOverrides?.[sourceViewport] || {} };

    let updatedStylesData: StylesData;

    if (currentViewport === 'desktop') {
      // Copy to desktop = replace base values
      updatedStylesData = {
        ...existingStyles,
        values: { ...sourceStyles }
      };
    } else {
      // Copy to mobile/tablet = replace viewport overrides
      updatedStylesData = {
        ...existingStyles,
        viewportOverrides: {
          ...existingStyles.viewportOverrides,
          [currentViewport]: { ...sourceStyles }
        }
      };
    }

    updateComponentStylesData(selectedComponentId, updatedStylesData);
  };

  // Reset a property to its inherited value (remove from viewport overrides)
  const resetPropertyToInherited = (propertyId: string) => {
    if (!currentPage || !selectedComponentId || currentViewport === 'desktop') return;

    const existingStyles: StylesData = selectedComponent.stylesData || {
      activeProperties: [],
      values: {},
      stylingMode: 'visual'
    };

    // Remove the property from current viewport overrides
    const currentOverrides = { ...existingStyles.viewportOverrides?.[currentViewport] || {} };
    delete currentOverrides[propertyId];

    const updatedStylesData: StylesData = {
      ...existingStyles,
      viewportOverrides: {
        ...existingStyles.viewportOverrides,
        [currentViewport]: currentOverrides
      }
    };

    updateComponentStylesData(selectedComponentId, updatedStylesData);
  };

  // Get visibility settings with defaults (all visible by default)
  const getVisibility = (): VisibilitySettings => {
    return selectedComponent.visibility || {
      mobile: true,
      tablet: true,
      desktop: true
    };
  };

  // Update visibility for a specific viewport
  const updateVisibility = (viewport: keyof VisibilitySettings, visible: boolean) => {
    if (!currentPage) return;

    const currentVisibility = getVisibility();
    const updatedContent = updateComponentInContent(
      currentPage.layoutData.content,
      selectedComponentId!,
      {
        visibility: {
          ...currentVisibility,
          [viewport]: visible
        }
      }
    );

    updatePage(currentPage.id, {
      layoutData: {
        ...currentPage.layoutData,
        content: updatedContent
      }
    });
  };

  const CurrentViewportIcon = VIEWPORT_LABELS[currentViewport].icon;
  const otherViewports = (['desktop', 'tablet', 'mobile'] as ViewportType[]).filter(v => v !== currentViewport);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-sm">{selectedComponent.type}</h3>
            <p className="text-xs text-muted-foreground">Component Styling</p>
          </div>
          <div className="flex items-center gap-1">
            {/* Copy from dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Copy className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {otherViewports.map(viewport => {
                  const ViewportIcon = VIEWPORT_LABELS[viewport].icon;
                  return (
                    <DropdownMenuItem key={viewport} onClick={() => copyStylesFromViewport(viewport)}>
                      <ViewportIcon className="h-4 w-4 mr-2" />
                      Copy from {VIEWPORT_LABELS[viewport].label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Delete button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Viewport badge */}
        <Badge variant="outline" className="text-xs mb-3">
          <CurrentViewportIcon className="h-3 w-3 mr-1" />
          Editing: {VIEWPORT_LABELS[currentViewport].label}
        </Badge>

        {/* Visibility per viewport */}
        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground">Visible on:</Label>
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <Checkbox
              checked={getVisibility().desktop}
              onCheckedChange={(checked) => updateVisibility('desktop', !!checked)}
            />
            <Monitor className="h-3 w-3 text-muted-foreground" />
          </label>
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <Checkbox
              checked={getVisibility().tablet}
              onCheckedChange={(checked) => updateVisibility('tablet', !!checked)}
            />
            <Tablet className="h-3 w-3 text-muted-foreground" />
          </label>
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <Checkbox
              checked={getVisibility().mobile}
              onCheckedChange={(checked) => updateVisibility('mobile', !!checked)}
            />
            <Smartphone className="h-3 w-3 text-muted-foreground" />
          </label>
        </div>
      </div>

      {/* Theme Selector (Only renders for Smart Blocks) */}
      <ThemeSelector
        componentType={selectedComponent.type}
        currentStyles={selectedComponent.stylesData}
        onApplyTheme={handleStylesUpdate}
      />

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-auto p-4">
        <StylesPanel
          styles={getComponentStyles()}
          onUpdate={handleStylesUpdate}
          title=""
          currentViewport={currentViewport}
          viewportOverrides={
            selectedComponent.stylesData?.viewportOverrides?.[currentViewport] || {}
          }
          onResetProperty={resetPropertyToInherited}
        />
      </div>

      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={deleteComponent}
      />
    </div>
  );
};
