import React, { useState } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { findComponent } from '@/lib/tree-utils';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2 } from 'lucide-react';
import { Repeat } from 'lucide-react';
import { canConvertToRepeater, convertToRepeaterMode } from '@/lib/builder/canConvertToRepeater';
import { applyConvertToRepeater } from '@/lib/builder/convertToRepeater';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataTablePropertiesPanel } from '@/components/builder/data-table/DataTablePropertiesPanel';
import { FormPropertiesPanel } from './form/FormPropertiesPanel';
import { VariableInput } from './VariableInput';
import { VisibilityConditionEditor } from './VisibilityConditionEditor';
import { ActionConfigurator, ActionBinding } from '@/components/actions';

// Basic Components
import {
  ButtonProperties,
  SelectProperties,
  ChartProperties,
  GridProperties,
  KPICardProperties,
  RepeaterProperties,
} from './properties/basic';

// Landing Components
import { NavbarProperties, FooterProperties, PricingProperties } from './properties/landing';

// Section Components
import { LogoCloudProperties } from './properties/LogoCloudProperties';
import { FeatureSectionProperties } from './properties/FeatureSectionProperties';
import { DisplayProperties } from './properties/DisplayProperties';

// Schema-driven property rendering (simple components)
import { getPropertySchema, type PropertySchema, type PropertyTab } from './registry/propertySchemas';
import { SchemaDrivenProperties } from './SchemaDrivenProperties';
// Framework registry descriptor (single source of truth when reachable)
import {
  useRegistryDescriptor,
  mapComponentPropsToFields,
} from '@/lib/builder/registryDescriptor';

// Helper to find component recursively — now imported from @/lib/tree-utils.

/**
 * Component types whose bespoke panels MUST stay — they own non-schema UX the
 * framework descriptor can't express (data binding, project integration,
 * array/column editors, action + icon composition). Every OTHER type whose
 * framework descriptor is present is rendered schema-driven; types absent from
 * the descriptor fall through to the product-local schema, then this switch.
 */
const KEEP_BESPOKE_PANEL = new Set<string>([
  'DataTable', 'Chart', 'Grid', 'KPICard', 'Repeater', // data-bound
  'Navbar', 'Footer', 'Pricing', 'LogoCloud', 'FeatureSection', // landing
  'Form', 'InfoList', // FormPropertiesPanel (multi-field)
  'Button', // ActionProperties + icon composition
  'Select', // options array editor
  'Card', // DisplayProperties fallback
  'Container', // styling-only hint
]);

export const PropertiesPanel = () => {
  const {
    selectedComponentId,
    pages,
    currentPageId,
    updateComponent,
    removeComponent,
    project
  } = useBuilderStore(useShallow(s => ({
    selectedComponentId: s.selectedComponentId,
    pages: s.pages,
    currentPageId: s.currentPageId,
    updateComponent: s.updateComponent,
    removeComponent: s.removeComponent,
    project: s.project,
  })));

  const { setComponentBinding, initialize } = useDataBindingStore();

  // Framework registry descriptor — single source of truth for editable props
  // when the worker is reachable. null while loading / on fetch failure
  // (PropertiesPanel then falls back to product-local schemas + bespoke panels).
  const registryDescriptor = useRegistryDescriptor();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Initialize data binding store when panel opens
  React.useEffect(() => {
    initialize();
  }, [initialize]);

  // Reset tab to 'general' when component changes
  React.useEffect(() => {
    setActiveTab('general');
  }, [selectedComponentId]);

  if (!selectedComponentId || !currentPageId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Select a component to view its properties.
      </div>
    );
  }

  const currentPage = pages.find(p => p.id === currentPageId);
  const selectedComponent = currentPage?.layoutData?.content
    ? findComponent(currentPage.layoutData.content, selectedComponentId)
    : null;

  if (!selectedComponent) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Component not found.
      </div>
    );
  }

  const updateComponentProp = (key: string, value: any) => {
    updateComponent(selectedComponentId, { [key]: value });
  };

  const deleteComponent = () => {
    removeComponent(selectedComponentId);
    setShowDeleteDialog(false);
  };

  const renderPropertyFields = (tab: string) => {
    const { type, props } = selectedComponent;

    // ── Tier 1: Framework registry descriptor (source of truth) ───────────
    // When the descriptor is reachable AND the component isn't in the
    // keep-bespoke set, render its editable.props via the schema engine.
    // styleTarget='stylesData' props are filtered out by the mapper (they
    // belong on the Styling tab). The framework schema has no product tabs,
    // so everything renders on 'general'; 'options'/'actions' yield null and
    // the tab wrapper still shows the Visibility / Action editors.
    if (registryDescriptor && type && !KEEP_BESPOKE_PANEL.has(type)) {
      const componentDescriptor = registryDescriptor.components[type];
      if (componentDescriptor) {
        if (tab !== 'general') return null;
        const fields = mapComponentPropsToFields(componentDescriptor);
        if (fields.length === 0) {
          return (
            <p className="text-muted-foreground text-sm">
              {componentDescriptor.displayName} is configured via the Styling tab.
            </p>
          );
        }
        return (
          <SchemaDrivenProperties
            fields={fields}
            props={props}
            updateProp={updateComponentProp}
          />
        );
      }
    }

    // ── Tier 2: Product-local schema (offline fallback for simple types) ───
    // Simple components declare their fields via a PropertySchema (see
    // registry/propertySchemas.ts). If a schema exists, render its fields for
    // the requested tab and return. Tabs the schema doesn't define yield null,
    // so the shared Visibility/Action editors (rendered by the tab wrapper)
    // still show.
    const schema = type ? getPropertySchema(type) : undefined;
    if (schema) {
      const fields = schema[tab as PropertyTab];
      if (!fields || fields.length === 0) return null;
      return (
        <SchemaDrivenProperties
          fields={fields}
          props={props}
          updateProp={updateComponentProp}
        />
      );
    }

    // ── Tier 3: Bespoke panels (complex / non-schema UX) ──────────────────
    const isMultiTabComponent = ['DataTable', 'Chart', 'Grid', 'KPICard', 'Form', 'InfoList', 'Button'].includes(type);
    if (!isMultiTabComponent && tab !== 'general') {
      return null;
    }

    switch (type) {
      // === CONTAINER ===
      case 'Container':
        return (
          <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-md">
            Use the Styling Panel (palette icon) to customize layout, spacing, and background.
          </div>
        );

      // === LANDING SECTIONS ===
      case 'LogoCloud':
        return <LogoCloudProperties componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} />;

      case 'FeatureSection':
        return <FeatureSectionProperties componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} />;

      case 'Navbar':
        return <NavbarProperties componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} project={project} />;

      case 'Footer':
        return <FooterProperties componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} project={project} />;

      case 'Pricing':
        return <PricingProperties componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} />;

      // === ACTIONS ===
      case 'Button':
        return <ButtonProperties activeTab={tab} componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} />;

      // === FORM INPUTS ===
      case 'Select':
        return <SelectProperties props={props} updateComponentProp={updateComponentProp} />;

      // === DATA ===
      case 'Chart':
        return (
          <ChartProperties
            activeTab={tab}
            componentId={selectedComponentId!}
            binding={selectedComponent?.props?.binding}
            onBindingUpdate={(binding) => {
              setComponentBinding(selectedComponentId!, binding);
              updateComponentProp('binding', binding);
            }}
            props={props}
            updateComponentProp={updateComponentProp}
          />
        );

      case 'Grid':
        return (
          <GridProperties
            activeTab={tab}
            componentId={selectedComponentId!}
            binding={selectedComponent?.props?.binding}
            onBindingUpdate={(binding) => {
              setComponentBinding(selectedComponentId!, binding);
              updateComponentProp('binding', binding);
            }}
            props={props}
            updateComponentProp={updateComponentProp}
          />
        );

      case 'Repeater':
        return (
          <RepeaterProperties
            activeTab={tab}
            componentId={selectedComponentId!}
            binding={selectedComponent?.props?.binding}
            onBindingUpdate={(binding) => {
              setComponentBinding(selectedComponentId!, binding);
              updateComponentProp('binding', binding);
            }}
            props={props}
            updateComponentProp={updateComponentProp}
          />
        );

      case 'KPICard':
        return (
          <KPICardProperties
            activeTab={tab}
            componentId={selectedComponentId!}
            binding={selectedComponent?.props?.binding}
            onBindingUpdate={(binding) => {
              setComponentBinding(selectedComponentId!, binding);
              updateComponentProp('binding', binding);
            }}
            props={props}
            updateComponentProp={updateComponentProp}
          />
        );

      case 'DataTable':
        const dataTableBinding = selectedComponent?.props?.binding;
        return (
          <DataTablePropertiesPanel
            activeTab={tab}
            componentId={selectedComponentId!}
            binding={dataTableBinding}
            onBindingUpdate={(binding) => {
              setComponentBinding(selectedComponentId!, binding);
              updateComponentProp('binding', binding);
            }}
          />
        );

      case 'Form':
        return <FormPropertiesPanel activeTab={tab} componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} type="Form" />;

      case 'InfoList':
        return <FormPropertiesPanel activeTab={tab} componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} type="InfoList" />;

      // === DISPLAY PROPERTIES (fallback) ===
      // Card stays bespoke; Embed falls back here OFFLINE only (when the
      // framework descriptor is unreachable). Online, Embed is rendered
      // schema-driven from its framework editable.props (tier 1 above).
      case 'Card':
      case 'Embed':
        return <DisplayProperties type={type} props={props} updateComponentProp={updateComponentProp} />;

      default:
        return (
          <p className="text-muted-foreground text-sm">
            No properties available for {type} component.
          </p>
        );
    }
  };

  const DeleteConfirmationDialog = ({ open, onOpenChange, onConfirm }: any) => (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the selected component.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="border-b border-border pb-4 mb-4 flex justify-between items-center gap-2">
        <h2 className="font-semibold text-foreground">Properties <span className="text-muted-foreground font-normal">{selectedComponent.type}</span></h2>
        <div className="flex items-center gap-1">
          {canConvertToRepeater(selectedComponent) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5 h-8"
              title={convertToRepeaterMode(selectedComponent) === 'wrap-template'
                ? 'Wrap this as a template and repeat it for each row of a table'
                : 'Convert this grid into a Repeater with a card template'}
              onClick={() => applyConvertToRepeater(selectedComponent)}
            >
              <Repeat className="h-3.5 w-3.5" />
              {convertToRepeaterMode(selectedComponent) === 'wrap-template' ? 'Repeat for each row' : 'Convert to Repeater'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="options">Options</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="component-title" className="text-sm font-medium">Component Title <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
              <VariableInput
                value={selectedComponent.props.title || ''}
                onChange={(value) => updateComponentProp('title', value)}
                syntaxContext="output"
                placeholder="Enter component title"
              />
            </div>

            {renderPropertyFields('general')}
          </TabsContent>

          <TabsContent value="options" className="space-y-4">
            {renderPropertyFields('options')}
            <VisibilityConditionEditor
              value={selectedComponent.visibilityCondition || ''}
              onChange={(value) => updateComponent(selectedComponentId, { visibilityCondition: value })}
            />
          </TabsContent>

          <TabsContent value="actions" className="space-y-4">
            {renderPropertyFields('actions')}
            <ActionConfigurator
              componentId={selectedComponentId || ''}
              componentType={selectedComponent.type}
              bindings={selectedComponent.props.actionBindings || []}
              onBindingsChange={(bindings: ActionBinding[]) => updateComponentProp('actionBindings', bindings)}
              availableTriggers={['onClick', 'onHover']}
            />
          </TabsContent>
        </Tabs>
      </div>

      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={deleteComponent}
      />
    </div>
  );
};
