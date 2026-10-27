import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface BackendConfig {
  type: 'express' | 'fastapi';
  baseUrl: string;
}

const BackendStatus: React.FC = () => {
  const [config, setConfig] = useState<BackendConfig>({
    type: 'express',
    baseUrl: 'http://localhost:3001',
  });
  const [status, setStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load config from localStorage or default
    const savedConfig = localStorage.getItem('backendConfig');
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
    }
    
    // Check backend status
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.baseUrl}/health`);
      if (response.ok) {
        setStatus('online');
      } else {
        setStatus('offline');
      }
    } catch (error) {
      setStatus('offline');
    } finally {
      setLoading(false);
    }
  };

  const switchToFastAPI = () => {
    const newConfig = {
      type: 'fastapi' as const,
      baseUrl: 'http://localhost:8000',
    };
    localStorage.setItem('backendConfig', JSON.stringify(newConfig));
    setConfig(newConfig);
    setStatus('unknown');
    // Reload the page to apply the new backend
    window.location.reload();
  };

  const switchToExpress = () => {
    const newConfig = {
      type: 'express' as const,
      baseUrl: 'http://localhost:3001',
    };
    localStorage.setItem('backendConfig', JSON.stringify(newConfig));
    setConfig(newConfig);
    setStatus('unknown');
    // Reload the page to apply the new backend
    window.location.reload();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Backend Status</CardTitle>
        <CardDescription>
          Current backend configuration and status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <span>Backend Type:</span>
          <span className="font-semibold">{config.type}</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Base URL:</span>
          <span className="font-mono text-sm">{config.baseUrl}</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Status:</span>
          <span className={`font-semibold ${status === 'online' ? 'text-green-600' : status === 'offline' ? 'text-red-600' : 'text-yellow-600'}`}>
            {status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Unknown'}
          </span>
        </div>
        <div className="flex space-x-2">
          <Button 
            onClick={switchToFastAPI} 
            disabled={config.type === 'fastapi' || loading}
            variant={config.type === 'fastapi' ? 'default' : 'outline'}
            className="flex-1"
          >
            FastAPI
          </Button>
          <Button 
            onClick={switchToExpress} 
            disabled={config.type === 'express' || loading}
            variant={config.type === 'express' ? 'default' : 'outline'}
            className="flex-1"
          >
            Express
          </Button>
        </div>
        <Button onClick={checkBackendStatus} disabled={loading} className="w-full">
          {loading ? 'Checking...' : 'Check Status'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default BackendStatus;