/**
 * WordPress Connection Step Component
 *
 * This component handles the initial connection to a WordPress site,
 * including plugin status check and authentication.
 */

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface WordPressConnectionStepProps {
  /** Frontbase project ID */
  projectId: string;
  /** Callback when connection succeeds */
  onSuccess: (datasourceId: string) => void;
  /** Callback when cancelled */
  onCancel: () => void;
}

/**
 * Connection Status
 */
type ConnectionStatus = 'idle' | 'checking' | 'plugin_required' | 'auth_error' | 'success' | 'error';

export const WordPressConnectionStep: React.FC<WordPressConnectionStepProps> = ({
  projectId,
  onSuccess,
  onCancel,
}) => {
  const [siteUrl, setSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pluginInfo, setPluginInfo] = useState<any>(null);

  /**
   * Validate URL format
   */
  const isValidUrl = useCallback((url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Check connection and plugin status
   */
  const checkConnection = useCallback(async () => {
    if (!siteUrl || !isValidUrl(siteUrl)) {
      setError('Please enter a valid WordPress site URL');
      return;
    }

    if (!username || !appPassword) {
      setError('Please enter both username and application password');
      return;
    }

    setStatus('checking');
    setError(null);

    try {
      // Normalize URL
      const normalizedUrl = siteUrl.replace(/\/$/, '');

      // First, check if plugin is installed
      const infoResponse = await fetch(`${normalizedUrl}/wp-json/frontbase/v1/info`);
      const infoData = await infoResponse.json();

      if (infoResponse.ok) {
        setPluginInfo(infoData);

        // Now test authentication
        const authHeader = 'Basic ' + btoa(`${username}:${appPassword}`);
        const discoverResponse = await fetch(`${normalizedUrl}/wp-json/frontbase/v1/discover`, {
          headers: { 'Authorization': authHeader },
        });

        if (discoverResponse.ok) {
          // Create datasource (sync sub-app is mounted at /api/sync)
          const datasourceResponse = await fetch('/api/sync/datasources/', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${normalizedUrl.replace(/^https?:\/\//, '')}`,
              type: 'wordpress_plugin',
              project_id: projectId,
              api_url: normalizedUrl,
              username: username,
              api_key: appPassword,
              table_prefix: infoData.table_prefix || 'wp_',
            }),
          });

          if (datasourceResponse.ok) {
            const datasource = await datasourceResponse.json();
            setStatus('success');
            onSuccess(datasource.id);
          } else {
            throw new Error('Failed to create datasource');
          }
        } else if (discoverResponse.status === 403) {
          setStatus('auth_error');
          setError('Authentication failed. Please check your username and application password.');
        } else {
          setStatus('error');
          setError('Connection failed. Please try again.');
        }
      } else {
        setStatus('plugin_required');
        setError('The Frontbase Connector plugin is not installed on your WordPress site.');
      }
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Could not connect to your WordPress site. Please check the URL and try again.');
    }
  }, [siteUrl, username, appPassword, projectId, onSuccess, isValidUrl]);

  const isChecking = status === 'checking';
  const isPluginRequired = status === 'plugin_required';

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Connect to WordPress</CardTitle>
        <CardDescription>
          Enter your WordPress site URL and application password to connect
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Site URL */}
        <div className="space-y-2">
          <Label htmlFor="site-url">WordPress Site URL</Label>
          <Input
            id="site-url"
            type="url"
            placeholder="https://yoursite.com"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            disabled={isChecking}
            onKeyDown={(e) => e.key === 'Enter' && checkConnection()}
          />
        </div>

        {/* Username */}
        <div className="space-y-2">
          <Label htmlFor="username">WordPress Username</Label>
          <Input
            id="username"
            type="text"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isChecking}
            autoComplete="username"
            onKeyDown={(e) => e.key === 'Enter' && checkConnection()}
          />
        </div>

        {/* Application Password */}
        <div className="space-y-2">
          <Label htmlFor="app-password">Application Password</Label>
          <Input
            id="app-password"
            type="password"
            placeholder="abcd EFGH 1234 ijkl 5678 mnop"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            disabled={isChecking}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && checkConnection()}
          />
          <p className="text-xs text-muted-foreground">
            Create an application password in WordPress admin → Users → Profile → Application Passwords
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant={isPluginRequired ? 'default' : 'destructive'}>
            <AlertDescription>
              {error}
              {isPluginRequired && (
                <div className="mt-2">
                  <a
                    href="https://wordpress.org/plugins/frontbase-connector"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:no-underline"
                  >
                    Get Frontbase Connector Plugin →
                  </a>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Help Info */}
        {!isPluginRequired && (
          <div className="bg-muted rounded-lg p-4 text-sm">
            <p className="font-medium mb-2">How to create an Application Password:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Log in to your WordPress admin dashboard</li>
              <li>Go to Users → Your Profile</li>
              <li>Scroll down to Application Passwords</li>
              <li>Enter a name (e.g., "Frontbase")</li>
              <li>Click "Add New Application Password"</li>
              <li>Copy the generated password and paste it above</li>
            </ol>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onCancel} disabled={isChecking}>
          Cancel
        </Button>
        <Button onClick={checkConnection} disabled={isChecking || !siteUrl || !username || !appPassword}>
          {isChecking ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            'Connect'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};
