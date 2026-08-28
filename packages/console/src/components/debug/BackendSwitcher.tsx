import React, { useState, useEffect } from 'react';
import { updateApiInstance } from '../../services/api-service';
import { PORT_CONFIG } from '../../lib/portConfig';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';

// Get debug mode - only log when explicitly enabled
const isDebugEnabled = () => {
  return localStorage.getItem('enableBackendDebug') === 'true';
};

const debugLog = (...args: any[]) => {
  if (isDebugEnabled()) {
    console.log('[BackendSwitcher]', ...args);
  }
};

const debugWarn = (...args: any[]) => {
  if (isDebugEnabled()) {
    console.warn('[BackendSwitcher]', ...args);
  }
};

const debugError = (...args: any[]) => {
  if (isDebugEnabled()) {
    console.error('[BackendSwitcher]', ...args);
  }
};

interface BackendConfig {
  type: 'express' | 'fastapi';
  baseUrl: string;
}

const BackendSwitcher: React.FC = () => {
  const [config, setConfig] = useState<BackendConfig>({
    type: 'fastapi', // Default to FastAPI for testing
    baseUrl: PORT_CONFIG.fastapi.baseUrl, // FastAPI backend
  });
  const [isSaving, setIsSaving] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    // Load config from localStorage or default
    const savedConfig = localStorage.getItem('backendConfig');
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
    }

    // Check backend connectivity on mount
    checkBackendStatus(config.baseUrl);
  }, []);

  // Check backend connectivity
  const checkBackendStatus = async (baseUrl: string) => {
    setBackendStatus('checking');
    try {
      // Direct health check fetch
      const response = await fetch(`${baseUrl}/health`).catch(() => null);
      setBackendStatus(response?.ok ? 'connected' : 'disconnected');
    } catch (error) {
      setBackendStatus('disconnected');
    }
  };

  const handleSave = async () => {
    debugLog('Switching backend to:', config.type);

    setIsSaving(true);
    setIsSwitching(true);

    try {
      // Step 1: Save new backend configuration
      localStorage.setItem('backendConfig', JSON.stringify(config));

      // Step 2: Update the API instance
      updateApiInstance();

      // Step 3: Check connectivity of new backend
      const response = await fetch(`${config.baseUrl}/health`).catch(() => null);
      const isConnected = response?.ok || false;
      setBackendStatus(isConnected ? 'connected' : 'disconnected');

      if (isConnected) {
        debugLog('Backend configuration updated successfully');
      } else {
        debugWarn('Backend switched to', config.type, 'but connectivity check failed');
      }
    } catch (error: any) {
      debugError('Backend switch failed:', error.message);
      setBackendStatus('disconnected');
    } finally {
      setIsSaving(false);
      setIsSwitching(false);
    }
  };

  const handleConfigChange = (newConfig: BackendConfig) => {
    debugLog('Updating config:', newConfig.type);
    setConfig(newConfig);
    checkBackendStatus(newConfig.baseUrl);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Backend Switcher</CardTitle>
        <CardDescription>
          Switch between Express.js and FastAPI backends for testing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="backend-type">Backend Type</Label>
          <Select
            value={config.type}
            onValueChange={(value: 'express' | 'fastapi') =>
              handleConfigChange({
                ...config,
                type: value,
                baseUrl: value === 'express' ? PORT_CONFIG.express.baseUrl : PORT_CONFIG.fastapi.baseUrl,
              })
            }
            disabled={isSwitching}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select backend type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="express">Express.js</SelectItem>
              <SelectItem value="fastapi">FastAPI (Test)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="base-url">Base URL</Label>
          <input
            id="base-url"
            type="text"
            value={config.baseUrl}
            onChange={(e) =>
              handleConfigChange({ ...config, baseUrl: e.target.value })
            }
            className="w-full p-2 border rounded"
            aria-label="Backend Base URL"
            placeholder="Enter backend URL"
            disabled={isSwitching}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Status: {config.type} at {config.baseUrl}
          </span>
          <div className="flex items-center gap-2">
            {isSwitching && (
              <span className="text-blue-600 animate-pulse">🔄 Switching...</span>
            )}
            {backendStatus === 'connected' && (
              <span className="text-green-600">🟢 Connected</span>
            )}
            {backendStatus === 'disconnected' && (
              <span className="text-red-600">🔴 Disconnected</span>
            )}
            {backendStatus === 'checking' && (
              <span className="text-yellow-600">🟡 Checking...</span>
            )}
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving || isSwitching} className="w-full">
          {isSaving ? 'Saving...' : isSwitching ? 'Switching Backend...' : 'Save and Reload'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default BackendSwitcher;
