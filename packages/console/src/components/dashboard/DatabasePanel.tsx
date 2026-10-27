import React, { useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, ExternalLink, AlertCircle, CheckCircle, Plus, Settings, Trash2 } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { SupabaseConnectionModal } from './SupabaseConnectionModal';
import { SimpleDataTableView } from '@/components/admin/SimpleDataTableView';
import { useToast } from '@/hooks/use-toast';
import api from '@/services/api-service';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export const DatabasePanel: React.FC = () => {
  const { connections, setSupabaseModalOpen, fetchConnections } = useDashboardStore();
  const { toast } = useToast();

  // Initialize data-binding when dashboard is connected
  const { connected: bindingConnected, initialize } = useDataBindingStore();

  // Check if we have a Supabase connection from the connections array
  const supabaseConnection = connections?.supabase || { connected: false, url: '' };

  useEffect(() => {
    if (supabaseConnection.connected && !bindingConnected) {
      initialize();
    }
  }, [supabaseConnection.connected, bindingConnected, initialize]);

  const handleDisconnectSupabase = async () => {
    try {
      const response = await api.delete('/api/database/disconnect-supabase');

      if (response.data?.success) {
        toast({
          title: "Disconnected",
          description: "Supabase connection has been removed",
        });
        // Refresh connections after disconnect
        await fetchConnections();
      } else {
        toast({
          title: "Error",
          description: response.data?.message || response.data?.error || "Failed to disconnect",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Disconnect error:', error);
      toast({
        title: "Connection Error",
        description: error?.response?.data?.detail || error?.message || "Failed to disconnect",
        variant: "destructive"
      });
    }
  };

  const openSupabaseProject = () => {
    if (supabaseConnection.url) {
      window.open(supabaseConnection.url, '_blank');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-full overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Database Providers</h1>
        <p className="text-muted-foreground">
          Connect and manage your database providers
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Supabase Provider Card */}
        <Card className="relative">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <Database className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Supabase</CardTitle>
                  <CardDescription className="text-sm">
                    PostgreSQL database with real-time features
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={supabaseConnection.connected ? "default" : "secondary"}>
                {supabaseConnection.connected ? (
                  <>
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Connected
                  </>
                ) : (
                  <>
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Not Connected
                  </>
                )}
              </Badge>
              {supabaseConnection.connected && supabaseConnection.url && (
                <Badge variant="outline">
                  {new URL(supabaseConnection.url).hostname}
                </Badge>
              )}
            </div>

            {supabaseConnection.connected ? (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Your Supabase database is connected and ready to use.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={openSupabaseProject}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Project
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSupabaseModalOpen(true)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Supabase?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove your Supabase connection. You can reconnect anytime.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDisconnectSupabase} className="bg-destructive text-destructive-foreground">
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Connect your Supabase project to enable database features, authentication, and real-time functionality.
                </div>
                <Button onClick={() => setSupabaseModalOpen(true)} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Connect Supabase
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Xano Provider Card - Coming Soon */}
        <Card className="relative opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                  <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Xano</CardTitle>
                  <CardDescription className="text-sm">
                    No-code backend with APIs
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="secondary">Coming Soon</Badge>
            <div className="text-sm text-muted-foreground">
              Connect to Xano for powerful no-code backend functionality.
            </div>
            <Button disabled className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Connect Xano
            </Button>
          </CardContent>
        </Card>

        {/* Generic SQL Provider Card - Coming Soon */}
        <Card className="relative opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                  <Database className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Custom SQL</CardTitle>
                  <CardDescription className="text-sm">
                    Connect to any SQL database
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="secondary">Coming Soon</Badge>
            <div className="text-sm text-muted-foreground">
              Connect to MySQL, PostgreSQL, or other SQL databases.
            </div>
            <Button disabled className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Connect Database
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Data Tables Section - Only show when connected */}
      {supabaseConnection.connected && bindingConnected && (
        <div className="mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Database Tables</h2>
            <p className="text-muted-foreground">
              View and manage your Supabase database tables
            </p>
          </div>
          <SimpleDataTableView />
        </div>
      )}

      <SupabaseConnectionModal />
    </div>
  );
};