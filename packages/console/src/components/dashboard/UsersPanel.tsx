import React from 'react';
import { UserContactConfigPanel } from './UserContactConfigPanel';
import { UserStatsCards } from './UserStatsCards';
import { UserManagementTable } from './UserManagementTable';
import { RLSPoliciesPanel } from './RLSPoliciesPanel';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthFormsList } from './AuthFormsList';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';
import { AuthProviderDialog } from './AuthProviderDialog';

export function UsersPanel() {
  const { isConfigured, config, saveConfig } = useUserContactConfig();
  const [configureOpen, setConfigureOpen] = React.useState(false);

  const handleProviderSelected = (accountId: string) => {
    const newConfig = config
      ? { ...config, authDataSourceId: accountId }
      : {
          contactsTable: '',
          columnMapping: { authUserIdColumn: '', contactIdColumn: '', contactTypeColumn: '', permissionLevelColumn: '' },
          contactTypes: {},
          permissionLevels: {},
          enabled: false,
          authDataSourceId: accountId,
        };
    saveConfig(newConfig);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">
            Manage your application users and sync their contact data with auth providers.
          </p>
        </div>
        <Button onClick={() => setConfigureOpen(true)}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Configure Auth
        </Button>
      </div>

      <Tabs defaultValue="users-config" className="w-full space-y-6">
        <TabsList>
          <TabsTrigger value="users-config">Users Configuration</TabsTrigger>
          <TabsTrigger value="authentication">Authentication</TabsTrigger>
          <TabsTrigger value="access-rule">Access Rule</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="users-config" className="space-y-6">
          <UserContactConfigPanel />
        </TabsContent>

        <TabsContent value="authentication">
          <AuthFormsList />
        </TabsContent>

        <TabsContent value="access-rule">
          <RLSPoliciesPanel />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <UserStatsCards />
          {isConfigured && <UserManagementTable />}
        </TabsContent>
      </Tabs>

      {/* Unified Auth Provider Dialog */}
      <AuthProviderDialog
        open={configureOpen}
        onOpenChange={setConfigureOpen}
        currentProviderId={config?.authDataSourceId}
        onProviderSelected={handleProviderSelected}
      />
    </div>
  );
}
