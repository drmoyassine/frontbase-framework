import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { getDefaultProps } from '@/lib/componentDefaults';
import { getSectionTemplate, expandTemplate } from './templates';
import {
  Search,
  MousePointer,
  Type,
  Layout,
  BarChart,
  Table,
  CheckSquare,
  Image,
  Calendar,
  Globe,
  FileText,
  Menu,
  DollarSign,
  HelpCircle,
  Sparkles,
  // Layout component icons
  Square,
  Rows3,
  Columns3,
  CreditCard,
  LayoutGrid,
  AlignJustify,
  Minus,
  PanelTop,
  ChevronDown,
  Star,
  Code,
  Repeat
} from 'lucide-react';

const componentCategories = {
  basic: {
    icon: Layout,
    label: 'Basic',
    components: [
      // Basic Components separator (NEW)
      { name: '_separator_basic', icon: MousePointer, description: 'Basic Components', section: 'separator' },

      // Basic Components (Container REMOVED)
      { name: 'Button', icon: MousePointer, description: 'Interactive button', section: 'basic' },
      { name: 'Text', icon: Type, description: 'Text content', section: 'basic' },
      { name: 'Heading', icon: Type, description: 'Headings (H1-H6)', section: 'basic' },
      { name: 'Link', icon: Globe, description: 'Navigation link', section: 'basic' },
      { name: 'Image', icon: Image, description: 'Image display', section: 'basic' },
      { name: 'Icon', icon: Star, description: 'Icon/emoji display', section: 'basic' },
      { name: 'Badge', icon: Star, description: 'Status badge with optional icon', section: 'basic' },
      { name: 'Embed', icon: Code, description: 'Embed iframe or script', section: 'basic' },

      // Layout separator
      { name: '_separator_layout', icon: Layout, description: 'Layout Components', section: 'separator' },

      // Layout Components (Container MOVED HERE)
      { name: 'Container', icon: Square, description: 'Layout container', section: 'layout' },
      { name: 'Row', icon: Rows3, description: 'Horizontal flex row', section: 'layout' },
      { name: 'Column', icon: Columns3, description: 'Vertical flex column', section: 'layout' },
      { name: 'Card', icon: CreditCard, description: 'Content card', section: 'layout' },
      { name: 'Flex', icon: AlignJustify, description: 'Flex container', section: 'layout' },
      { name: 'Separator', icon: Minus, description: 'Visual separator', section: 'layout' },
      { name: 'Tabs', icon: PanelTop, description: 'Tabbed content', section: 'layout' },
      { name: 'Accordion', icon: ChevronDown, description: 'Collapsible content', section: 'layout' },
    ]
  },
  data: {
    icon: Table,
    label: 'Data',
    components: [
      // Record Components separator
      { name: '_separator_record', icon: CheckSquare, description: 'Record Components', section: 'separator' },

      // Form/Record Components (Smart Blocks)
      { name: 'Form', icon: FileText, description: 'Schema-driven form', section: 'forms' },
      { name: 'InfoList', icon: CheckSquare, description: 'Read-only record display', section: 'forms' },

      // Lists Components separator
      { name: '_separator_lists', icon: Table, description: 'Lists Components', section: 'separator' },

      // Data/Lists Components
      { name: 'DataTable', icon: Table, description: 'Advanced data table', section: 'data' },
      { name: 'Grid', icon: LayoutGrid, description: 'Card grid from a table', section: 'data' },
      { name: 'Repeater', icon: Repeat, description: 'Pixel-perfect repeating template', section: 'data' },
      { name: 'KPICard', icon: BarChart, description: 'KPI display card', section: 'data' },
      { name: 'Chart', icon: BarChart, description: 'Data visualization', section: 'data' },
      { name: 'Progress', icon: BarChart, description: 'Progress indicator', section: 'data' },
      { name: 'Avatar', icon: MousePointer, description: 'User avatar', section: 'data' },
    ]
  },
  sections: {
    icon: Sparkles,
    label: 'Sections',
    components: [
      // Landing Page Sections - these expand into child components
      { name: '_separator_landing', icon: Layout, description: 'Landing Page Sections', section: 'separator' },

      { name: 'Hero', icon: Layout, description: 'Hero section with CTA', section: 'landing', isTemplate: true },
      { name: 'Features', icon: Layout, description: 'Feature cards grid', section: 'landing', isTemplate: true },
      { name: 'Pricing', icon: DollarSign, description: 'Pricing table', section: 'landing' },
      { name: 'CTA', icon: MousePointer, description: 'Call to action banner', section: 'landing', isTemplate: true },
      { name: 'Navbar', icon: Menu, description: 'Navigation bar', section: 'landing', isTemplate: true },
      { name: 'FAQ', icon: HelpCircle, description: 'FAQ accordion', section: 'landing', isTemplate: true },
      { name: 'LogoCloud', icon: Image, description: 'Partner logos', section: 'landing', isTemplate: true },
      { name: 'Footer', icon: Layout, description: 'Page footer', section: 'landing', isTemplate: true },

      // Page Templates separator
      { name: '_separator_templates', icon: Sparkles, description: 'Full Page Templates', section: 'separator' },
      { name: 'FrontbaseHomepage', icon: Sparkles, description: 'Complete Frontbase homepage', section: 'template', isTemplate: true },
    ]
  }
};

// Draggable component item using @dnd-kit
const DraggableComponentItem: React.FC<{ component: any }> = ({ component }) => {
  const { currentPageId, moveComponent, setSelectedComponentId } = useBuilderStore(useShallow(s => ({
    currentPageId: s.currentPageId,
    moveComponent: s.moveComponent,
    setSelectedComponentId: s.setSelectedComponentId
  })));

  // Render separator
  if (component.section === 'separator') {
    return (
      <div className="col-span-3 flex items-center gap-2 my-2">
        <div className="flex-1 border-t border-border"></div>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {component.description}
        </span>
        <div className="flex-1 border-t border-border"></div>
      </div>
    );
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${component.name}`,
    data: {
      type: component.name,
      name: component.name,
      isTemplate: component.isTemplate
    }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = component.icon;

  const handleDoubleClick = () => {
    if (currentPageId) {
      let newComponent;

      // If this is a template section, expand it into child components
      if (component.isTemplate) {
        const template = getSectionTemplate(component.name);
        if (template) {
          newComponent = expandTemplate(template);
        }
      }

      // Fallback for non-template components
      // Fallback for non-template components
      if (!newComponent) {
        newComponent = {
          id: `${Date.now()}-${Math.random()}`,
          type: component.name,
          props: getDefaultProps(component.name),
          styles: {},
          children: []
        };
      }

      moveComponent(currentPageId, null, newComponent, 999);
      setSelectedComponentId(newComponent.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={handleDoubleClick}
      className="flex flex-col items-center justify-center p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 cursor-move transition-all group"
      title={`${component.description} (Double-click to add)`}
    >
      <Icon className="h-5 w-5 mb-1.5 text-muted-foreground group-hover:text-primary transition-colors" />
      <span className="text-xs text-center font-medium leading-tight">
        {component.name}
      </span>
    </div>
  );
};

export const ComponentPalette: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const allComponents = Object.entries(componentCategories).flatMap(([category, data]) =>
    data.components.map(comp => ({ ...comp, category }))
  );

  const filteredComponents = allComponents.filter(comp => {
    const matchesSearch = comp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comp.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'all' || comp.category === activeCategory;
    return matchesSearch && matchesCategory && comp.section !== 'separator';
  });

  const getCategoryComponents = (category: string) => {
    if (category === 'all') {
      return allComponents;
    }
    return componentCategories[category as keyof typeof componentCategories]?.components || [];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search components..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory} className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b border-border justify-between px-4 gap-2">
          <TabsTrigger value="all" className="relative px-4">
            All
          </TabsTrigger>
          {Object.entries(componentCategories).map(([key, cat]) => {
            const Icon = cat.icon;
            return (
              <TabsTrigger key={key} value={key} className="relative px-4">
                <Icon className="h-3.5 w-3.5 mr-1.5" />
                {cat.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="flex-1 overflow-auto">
          <TabsContent value="all" className="mt-0 p-4">
            {searchTerm ? (
              <div className="grid grid-cols-3 gap-2">
                {filteredComponents.map((component) => (
                  <DraggableComponentItem key={component.name} component={component} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {allComponents.map((component) => (
                  <DraggableComponentItem key={component.name} component={component} />
                ))}
              </div>
            )}
          </TabsContent>

          {Object.entries(componentCategories).map(([key, cat]) => (
            <TabsContent key={key} value={key} className="mt-0 p-4">
              <div className="grid grid-cols-3 gap-2">
                {getCategoryComponents(key).map((component) => (
                  <DraggableComponentItem key={component.name} component={component} />
                ))}
              </div>
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
};
