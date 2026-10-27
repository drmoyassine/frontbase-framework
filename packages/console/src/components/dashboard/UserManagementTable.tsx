import React, { useState } from 'react';
import { DataTable } from '@frontbase/datatable';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Settings2, UserPlus, Users } from 'lucide-react';
import { CompactColumnConfigurator } from '@/components/builder/data-table/CompactColumnConfigurator';
import { FilterConfigurator } from '@/components/builder/data-table/FilterConfigurator';
import { useFilterOptions } from '@/hooks/dashboard/useFilterOptions';
import { useUserTableBinding } from '@/hooks/dashboard/useUserTableBinding';
import { InviteUserDialog } from '@/components/dashboard/users/InviteUserDialog';
import { ManageUsersDialog } from '@/components/dashboard/users/ManageUsersDialog';

export const UserManagementTable = () => {
  const { config, isConfigured, saveConfig } = useUserContactConfig();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Use custom hooks for logic
  const filterOptions = useFilterOptions(config, isConfigured);
  const binding = useUserTableBinding(config, isConfigured, filterOptions);

  // Auth Columns Definition (Virtual)
  const authColumns = [
    { name: 'auth_email', type: 'text' },
    { name: 'auth_created_at', type: 'date' },
    { name: 'last_sign_in_at', type: 'date' }
  ];

  const handleUpdateColumnOverrides = (overrides: any) => {
    if (!config) return;
    saveConfig({ ...config, columnOverrides: overrides });
  };

  const handleUpdateColumnOrder = (order: string[]) => {
    if (!config) return;
    saveConfig({ ...config, columnOrder: order });
  };

  const handleUpdateFilters = (filters: any[]) => {
    if (!config) return;
    saveConfig({ ...config, frontendFilters: filters });
  };


  if (!isConfigured || !binding) {
    return <div className="p-4 text-center text-muted-foreground">User Management not configured</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Users Table</h2>

        <div className="flex items-center gap-2">
          {/* App-user (GoTrue) management actions */}
          <Button variant="default" size="sm" className="gap-2" onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4" />
            Invite User
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setManageOpen(true)}>
            <Users className="w-4 h-4" />
            Manage Users
          </Button>

          {/* Configuration Dialog */}
          <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="w-4 h-4" />
                Configure Table
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Configure User Table</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="columns" className="flex-1 overflow-hidden flex flex-col">
              <TabsList>
                <TabsTrigger value="columns">Columns</TabsTrigger>
                <TabsTrigger value="filters">Filters</TabsTrigger>
              </TabsList>

              <TabsContent value="columns" className="flex-1 overflow-y-auto p-1">
                {/* Note: CompactColumnConfigurator is also slated for refactoring next */}
                <CompactColumnConfigurator
                  tableName={config.contactsTable}
                  columnOverrides={config.columnOverrides || {}}
                  columnOrder={config.columnOrder}
                  onColumnOverridesChange={handleUpdateColumnOverrides}
                  onColumnOrderChange={handleUpdateColumnOrder}
                  additionalColumns={authColumns}
                />
              </TabsContent>

              <TabsContent value="filters" className="flex-1 overflow-y-auto p-1">
                <FilterConfigurator
                  tableName={config.contactsTable}
                  filters={config.frontendFilters || []}
                  onFiltersChange={handleUpdateFilters}
                  columnOrder={config.columnOrder}
                />
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
        </div>

        <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
        <ManageUsersDialog open={manageOpen} onOpenChange={setManageOpen} />
      </div>

      <div className="border rounded-md">
        <DataTable mode="builder" componentId="user-management-table" binding={binding} title="" />
      </div>
    </div>
  );
};
