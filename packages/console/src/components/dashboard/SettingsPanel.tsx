/**
 * SettingsPanel
 * 
 * Dashboard settings page with tabs for General, Team & Emails, and Privacy.
 * Edge Infrastructure tabs have been moved to /edge (EdgeInfrastructurePanel).
 * 
 * Supports deep linking via URL search params:
 *   /settings?tab=general
 *   /settings?tab=team
 *   /settings?tab=privacy
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Users } from 'lucide-react';
import { PrivacySettingsForm } from './settings/shared/PrivacySettingsForm';
import { ProjectDetailsForm } from './settings/shared/ProjectDetailsForm';
import { AdminInviteForm } from './settings/shared/AdminInviteForm';
import { EdgeAPIKeysForm } from './settings/shared/EdgeAPIKeysForm';
import { EdgeProvidersSection } from './settings/shared/EdgeProvidersSection';
import { SecuritySettingsForm } from './settings/shared/SecuritySettingsForm';
import { PlanUsageSection } from './settings/shared/PlanUsageSection';
import { TenantTeamPanel } from './settings/shared/TenantTeamPanel';
import { isCloud } from '@/lib/edition';

const CLOUD = isCloud();
const VALID_TABS: string[] = CLOUD
  ? ['general', 'plan', 'team', 'privacy', 'keys', 'accounts', 'security']
  : ['general', 'team', 'privacy', 'keys', 'accounts', 'security'];
type SettingsTab = string;

export const SettingsPanel: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: SettingsTab = rawTab && VALID_TABS.includes(rawTab)
    ? rawTab
    : 'general';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your project settings and integrations
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className={`grid w-full ${CLOUD ? 'grid-cols-7 lg:w-[1050px]' : 'grid-cols-6 lg:w-[900px]'}`}>
          <TabsTrigger value="general">General</TabsTrigger>
          {CLOUD && <TabsTrigger value="plan">Plan & Usage</TabsTrigger>}
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="privacy">Privacy & Tracking</TabsTrigger>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="accounts">Connected Accounts</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6 mt-6">
          <ProjectDetailsForm withCard />

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive">
                Delete Project
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plan & Usage Tab (cloud only) */}
        {CLOUD && (
          <TabsContent value="plan" className="space-y-6 mt-6">
            <PlanUsageSection />
          </TabsContent>
        )}

        {/* Team Tab */}
        <TabsContent value="team" className="space-y-6 mt-6">
          {CLOUD ? (
            <TenantTeamPanel />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Management
                </CardTitle>
                <CardDescription>
                  Invite colleagues to collaborate on this project.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <AdminInviteForm />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Privacy & Tracking Tab */}
        <TabsContent value="privacy" className="space-y-6 mt-6">
          <PrivacySettingsForm withCard />
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="keys" className="space-y-6 mt-6">
          <EdgeAPIKeysForm withCard />
        </TabsContent>

        {/* Connected Accounts Tab */}
        <TabsContent value="accounts" className="space-y-6 mt-6">
          <EdgeProvidersSection />
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6 mt-6">
          <SecuritySettingsForm withCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};
