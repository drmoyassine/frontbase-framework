import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { AuthProviderSelector } from './AuthProviderSelector';
import { DatabaseProviderSelector } from './DatabaseProviderSelector';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useDashboardStore } from '@/stores/dashboard';
import { useBuilderStore } from '@/stores/builder';
import { toast } from 'sonner';
import { Settings, Save, RotateCcw, Plus, Trash2, HelpCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Page } from '@/types/builder';
import { PROVIDER_CONFIGS } from '@/components/dashboard/settings/shared/edgeConstants';
import { useEdgeProviders } from '@/hooks/useEdgeInfrastructure';
import { datasourcesApi } from '@/modules/dbsync/api/datasources';

// Helper for Key-Value editors with internal state to prevent focus loss
function KeyValueEditor({ title, description, data, onChange }: { title: string, description: string, data: Record<string, string>, onChange: (d: Record<string, string>) => void }) {
  // Convert Record to Array for stable editing
  const [items, setItems] = useState<{ id: string, key: string, label: string }[]>([]);

  useEffect(() => {
    // Only sync from props if the length changes or it's empty (initial load)
    // This avoids cursor jumping if we synced on every keystroke roundtrip
    // Ideally we should have a more robust sync, but for now this fixes the focus loss
    const newItems = Object.entries(data).map(([k, v], i) => ({
      id: `item-${i}-${k}`, // Stable ID
      key: k,
      label: v
    }));

    // Simple check to avoid loop - if we have same number of items and keys match, assume local state is fresher
    // Actually, let's just use local state as source of truth while editing, and push up on change
    if (items.length === 0 && newItems.length > 0) {
      setItems(newItems);
    }
  }, [data, items.length]);

  const updateParent = (currentItems: typeof items) => {
    const newRecord: Record<string, string> = {};
    currentItems.forEach(item => {
      if (item.key) newRecord[item.key] = item.label;
    });
    onChange(newRecord);
  };

  const addItem = () => {
    const newItem = { id: `new-${Date.now()}`, key: `new_type_${items.length + 1}`, label: 'New Type' };
    const newItems = [...items, newItem];
    setItems(newItems);
    updateParent(newItems);
  };

  const updateItem = (id: string, field: 'key' | 'label', value: string) => {
    const newItems = items.map(item => item.id === id ? { ...item, [field]: value } : item);
    setItems(newItems);
    updateParent(newItems);
  };

  const removeItem = (id: string) => {
    const newItems = items.filter(item => item.id !== id);
    setItems(newItems);
    updateParent(newItems);
  };

  return (
    <div className="space-y-3 border p-4 rounded-md bg-slate-50/50">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="text-sm font-medium flex items-center gap-2">
            {title}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent className="max-w-xs">{description}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h4>
        </div>
        <Button variant="outline" size="sm" onClick={addItem} className="h-8">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      <div className="grid grid-cols-[1fr,1.5fr,auto] gap-2 px-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
        <div>Value (DB)</div>
        <div>Label (UI)</div>
        <div className="w-8"></div>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr,1.5fr,auto] gap-2 items-center">
            <Input
              className="h-8 text-sm"
              value={item.key}
              onChange={(e) => updateItem(item.id, 'key', e.target.value)}
              placeholder="e.g. admin"
            />
            <Input
              className="h-8 text-sm"
              value={item.label}
              onChange={(e) => updateItem(item.id, 'label', e.target.value)}
              placeholder="e.g. Administrator"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 italic">No items defined</p>}
      </div>
    </div>
  );
}

// Special Editor for Contact Types that includes Home Page selection
function ContactTypeEditor({
  title,
  description,
  data,
  homePageMapping,
  availablePages,
  onChange,
  onHomePageChange
}: {
  title: string,
  description: string,
  data: Record<string, string>,
  homePageMapping: Record<string, string>,
  availablePages: Page[],
  onChange: (d: Record<string, string>) => void,
  onHomePageChange: (mapping: Record<string, string>) => void
}) {
  const [items, setItems] = useState<{ id: string, key: string, label: string, homePageId: string }[]>([]);

  useEffect(() => {
    const newItems = Object.entries(data).map(([k, v], i) => ({
      id: `item-${i}-${k}`,
      key: k,
      label: v,
      homePageId: homePageMapping[k] || ''
    }));

    if (items.length === 0 && newItems.length > 0) {
      setItems(newItems);
    }
  }, [data, homePageMapping, items.length]);

  const updateParent = (currentItems: typeof items) => {
    const newRecord: Record<string, string> = {};
    const newMapping: Record<string, string> = {};

    currentItems.forEach(item => {
      if (item.key) {
        newRecord[item.key] = item.label;
        if (item.homePageId) {
          newMapping[item.key] = item.homePageId;
        }
      }
    });

    onChange(newRecord);
    onHomePageChange(newMapping);
  };

  const addItem = () => {
    const newItem = { id: `new-${Date.now()}`, key: `new_type_${items.length + 1}`, label: 'New Type', homePageId: '' };
    const newItems = [...items, newItem];
    setItems(newItems);
    updateParent(newItems);
  };

  const updateItem = (id: string, field: 'key' | 'label' | 'homePageId', value: string) => {
    const newItems = items.map(item => item.id === id ? { ...item, [field]: value } : item);
    setItems(newItems);
    updateParent(newItems);
  };

  const removeItem = (id: string) => {
    const newItems = items.filter(item => item.id !== id);
    setItems(newItems);
    updateParent(newItems);
  };

  const publicPages = availablePages.filter(p => p.isPublic || p.isHomepage);

  return (
    <div className="space-y-3 border p-4 rounded-md bg-slate-50/50">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="text-sm font-medium flex items-center gap-2">
            {title}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent className="max-w-xs">{description}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h4>
        </div>
        <Button variant="outline" size="sm" onClick={addItem} className="h-8">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      <div className="grid grid-cols-[1fr,1.5fr,1.5fr,auto] gap-2 px-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
        <div>Value (DB)</div>
        <div>Label (UI)</div>
        <div>Gated Homepage</div>
        <div className="w-8"></div>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr,1.5fr,1.5fr,auto] gap-2 items-center">
            <Input
              className="h-8 text-sm"
              value={item.key}
              onChange={(e) => updateItem(item.id, 'key', e.target.value)}
              placeholder="e.g. admin"
            />
            <Input
              className="h-8 text-sm"
              value={item.label}
              onChange={(e) => updateItem(item.id, 'label', e.target.value)}
              placeholder="e.g. Administrator"
            />
            <Select
              value={item.homePageId}
              onValueChange={(val) => updateItem(item.id, 'homePageId', val)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select Page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_default_">Default Dashboard</SelectItem>
                {publicPages.map(page => (
                  <SelectItem key={page.id} value={page.id}>
                    {page.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 italic">No items defined</p>}
      </div>
    </div>
  );
}

export function UserContactConfigPanel() {
  const { config, setConfig, setContactsTable, resetConfig } = useUserContactConfig();
  const { schemas, loadTableSchema, initialize, connected, connectionError } = useDataBindingStore();
  const { fetchConnections } = useDashboardStore();
  const pages = useBuilderStore(s => s.pages);


  const { data: allProviders = [] } = useEdgeProviders();

  // Local state for form
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState({
    authUserIdColumn: '',
    contactIdColumn: '',
    contactTypeColumn: '',
    permissionLevelColumn: '',
    createdAtColumn: '',
  });
  const [enabled, setEnabledState] = useState(true);
  const [authProviderId, setAuthProviderId] = useState<string | null>(null);
  const [contactsDbId, setContactsDbId] = useState<string | null>(null);
  const [contactTypes, setContactTypes] = useState<Record<string, string>>({});
  const [contactTypeHomePages, setContactTypeHomePages] = useState<Record<string, string>>({});
  const [permissionLevels, setPermissionLevels] = useState<Record<string, string>>({});

  // Derive auth provider type for auto-suggesting a matching datasource
  const authProviderType = React.useMemo(() => {
    if (!authProviderId) return undefined;
    const provider = allProviders.find(p => p.id === authProviderId);
    if (!provider) return undefined;
    const config = PROVIDER_CONFIGS[provider.provider];
    return config?.capabilities?.includes('database') ? provider.provider : undefined;
  }, [authProviderId, allProviders]);

  // Initialize data binding store
  useEffect(() => {
    const initializeStores = async () => {
      await fetchConnections();
      initialize();
    };
    initializeStores();
  }, [fetchConnections, initialize]);

  // Load initial config
  useEffect(() => {
    if (config) {
      setSelectedTable(config.contactsTable);
      setColumns({
        authUserIdColumn: config.columnMapping?.authUserIdColumn || '',
        contactIdColumn: config.columnMapping?.contactIdColumn || '',
        contactTypeColumn: config.columnMapping?.contactTypeColumn || '',
        permissionLevelColumn: config.columnMapping?.permissionLevelColumn || '',
        createdAtColumn: config.columnMapping?.createdAtColumn || '',
      });
      setContactTypes(config.contactTypes || {});
      setContactTypeHomePages(config.contactTypeHomePages || {});
      setPermissionLevels(config.permissionLevels || {});
      setEnabledState(config.enabled);
      setAuthProviderId(config.authDataSourceId || null);
      setContactsDbId(config.contactsDbId || config.authDataSourceId || null);

      if (config.contactsTable) {
        // If it's a datasource-based table, we might need a different loader eventually
        // for now loadTableSchema in data-binding-simple is for primary Supabase
        loadTableSchema(config.contactsTable);
      }
    }
  }, [config, loadTableSchema]);

  // Fetch schema from the contacts datasource
  const { data: datasourceSchema } = useQuery({
    queryKey: ['datasource-table-schema', contactsDbId, selectedTable],
    queryFn: async () => {
      if (!contactsDbId || !selectedTable) return null;
      const res = await datasourcesApi.getTableSchema(contactsDbId, selectedTable);
      return res.data;
    },
    enabled: !!contactsDbId && !!selectedTable,
  });

  const tableSchema = contactsDbId
    ? (datasourceSchema ? { columns: datasourceSchema.columns.map((c: any) => ({ name: c.name, type: c.type })) } : null)
    : (selectedTable ? schemas.get(selectedTable) : null);

  // Deduplicate and filter columns
  const availableColumns = React.useMemo(() => {
    if (!tableSchema?.columns) return [];
    const unique = new Map();
    tableSchema.columns.forEach(c => {
      if (!unique.has(c.name)) {
        unique.set(c.name, c);
      }
    });
    return Array.from(unique.values());
  }, [tableSchema]);

  const handleTableChange = async (tableName: string) => {
    setSelectedTable(tableName);
    if (tableName && !contactsDbId) {
      await loadTableSchema(tableName);
    }
  };

  const handleSave = () => {
    if (!selectedTable || !columns.authUserIdColumn || !columns.contactIdColumn || !columns.contactTypeColumn || !columns.permissionLevelColumn) {
      toast.error('Missing Configuration', {
        description: 'Please select a table and all required columns (marked with *)',
      });
      return;
    }

    setConfig({
      contactsTable: selectedTable,
      authDataSourceId: authProviderId || undefined,
      contactsDbId: contactsDbId || undefined,
      columnMapping: {
        authUserIdColumn: columns.authUserIdColumn,
        contactIdColumn: columns.contactIdColumn,
        contactTypeColumn: columns.contactTypeColumn,
        permissionLevelColumn: columns.permissionLevelColumn,
        createdAtColumn: columns.createdAtColumn,
      },
      contactTypes,
      contactTypeHomePages,
      permissionLevels,
      enabled
    });
  };

  const ColumnSelect = ({ label, field, required = false }: { label: string, field: keyof typeof columns, required?: boolean }) => (
    <div>
      <Label className="text-xs font-medium mb-1.5 block">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Select value={columns[field]} onValueChange={(val) => setColumns(prev => ({ ...prev, [field]: val }))}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Select column" />
        </SelectTrigger>
        <SelectContent>
          {availableColumns.map((c) => (
            <SelectItem key={c.name} value={c.name}>{c.name} <span className="text-muted-foreground text-xs ml-1">({c.type})</span></SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          User Contact Data Configuration
        </CardTitle>
        <CardDescription>
          Map your database table to system user roles and permissions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center space-x-2">
          <Switch id="enable-user-sync" checked={enabled} onCheckedChange={setEnabledState} />
          <Label htmlFor="enable-user-sync">Enable user contact data sync</Label>
        </div>

        {!connected && (
          <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg text-sm text-amber-800">
            {connectionError || 'Database not connected. Please configure your Supabase connection first.'}
          </div>
        )}

        <div className="space-y-6">
          <AuthProviderSelector
            value={authProviderId || undefined}
            onValueChange={setAuthProviderId}
          />

          <DatabaseProviderSelector
            value={contactsDbId || undefined}
            onValueChange={setContactsDbId}
            autoSuggestProviderType={authProviderType}
          />

          <Separator />

          <div>
            <Label htmlFor="contacts-table" className="text-sm font-medium mb-1.5 block">Contacts Table</Label>
            <TableSelector
              value={selectedTable}
              onValueChange={handleTableChange}
              dataSourceId={contactsDbId || undefined}
              placeholder="Select contact table"
              disabled={!contactsDbId && !connected}
            />
          </div>

          {selectedTable && (
            <div className="space-y-6">
              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  Column Mapping
                  <span className="text-xs font-normal text-muted-foreground px-2 py-0.5 rounded-full bg-slate-100">Required</span>
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <ColumnSelect label="Contact ID (Primary Key)" field="contactIdColumn" required />
                  <ColumnSelect label="Auth User ID (Foreign Key)" field="authUserIdColumn" required />
                  <ColumnSelect label="Contact Type Column" field="contactTypeColumn" required />
                  <ColumnSelect label="Permission Level Column" field="permissionLevelColumn" required />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium text-sm">Definitions</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2 lg:col-span-1">
                    <ContactTypeEditor
                      title="Contact Types"
                      description="Define the types of users in your system (e.g. Vendor, Customer, Team Member) and their landing page."
                      data={contactTypes}
                      homePageMapping={contactTypeHomePages}
                      availablePages={pages}
                      onChange={setContactTypes}
                      onHomePageChange={setContactTypeHomePages}
                    />
                  </div>
                  <div className="md:col-span-2 lg:col-span-1">
                    <KeyValueEditor
                      title="Permission Levels"
                      description="Define access levels (e.g. read_only, editor, admin). These can apply to any Contact Type, creating a matrix of roles."
                      data={permissionLevels}
                      onChange={setPermissionLevels}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <Button variant="outline" onClick={resetConfig}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!selectedTable}>
            <Save className="h-4 w-4 mr-2" />
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
