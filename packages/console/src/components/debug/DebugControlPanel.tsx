import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { 
  enableDebug, 
  disableDebug, 
  getAllDebugStatus, 
  enableAllDebug, 
  disableAllDebug,
  type DebugCategory 
} from '../../lib/debug-control';

interface DebugCategoryInfo {
  key: DebugCategory;
  label: string;
  description: string;
  enabled: boolean;
}

const DEBUG_CATEGORIES: Omit<DebugCategoryInfo, 'enabled'>[] = [
  { key: 'render', label: 'Component Rendering', description: 'Track component render cycles and performance' },
  { key: 'backend', label: 'Backend Operations', description: 'Backend switching, connectivity checks, session management' },
  { key: 'session', label: 'Session Management', description: 'Session cleanup, validation, and state management' },
  { key: 'auth', label: 'Authentication', description: 'Login, registration, and auth API calls' },
  { key: 'authStore', label: 'Auth Store', description: 'Auth store state changes and operations' },
  { key: 'api', label: 'API Service', description: 'API calls, responses, and request handling' },
  { key: 'port', label: 'Port Configuration', description: 'Port configuration and backend URL management' },
];

export const DebugControlPanel: React.FC = () => {
  const [categories, setCategories] = useState<DebugCategoryInfo[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Load current debug status
    const status = getAllDebugStatus();
    const categoriesWithStatus = DEBUG_CATEGORIES.map(cat => ({
      ...cat,
      enabled: status[cat.key]
    }));
    setCategories(categoriesWithStatus);

    // Check if debug panel should be visible (can be enabled via localStorage)
    const panelVisible = localStorage.getItem('debugPanelVisible') === 'true';
    setIsVisible(panelVisible);
  }, []);

  const toggleDebug = (category: DebugCategory, enabled: boolean) => {
    if (enabled) {
      enableDebug(category);
    } else {
      disableDebug(category);
    }

    // Update local state
    setCategories(prev => prev.map(cat => 
      cat.key === category ? { ...cat, enabled } : cat
    ));
  };

  const handleEnableAll = () => {
    enableAllDebug();
    setCategories(prev => prev.map(cat => ({ ...cat, enabled: true })));
  };

  const handleDisableAll = () => {
    disableAllDebug();
    setCategories(prev => prev.map(cat => ({ ...cat, enabled: false })));
  };

  const togglePanelVisibility = () => {
    const newVisibility = !isVisible;
    setIsVisible(newVisibility);
    localStorage.setItem('debugPanelVisible', newVisibility.toString());
  };

  // Show/hide panel based on localStorage or URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const showDebug = urlParams.get('debug') === 'true' || localStorage.getItem('debugPanelVisible') === 'true';
    setIsVisible(showDebug);
  }, []);

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={togglePanelVisibility}
          className="bg-gray-800 text-white border-gray-600 hover:bg-gray-700"
        >
          🛠️ Debug Panel
        </Button>
      </div>
    );
  }

  const enabledCount = categories.filter(cat => cat.enabled).length;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[80vh] overflow-y-auto">
      <Card className="bg-gray-900 text-white border-gray-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">🛠️ Debug Control Panel</CardTitle>
              <CardDescription className="text-gray-400">
                Enable/disable debug logging for specific categories
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePanelVisibility}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={enabledCount > 0 ? "default" : "secondary"}>
              {enabledCount} categories enabled
            </Badge>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnableAll}
                className="text-xs h-6 px-2"
              >
                All On
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisableAll}
                className="text-xs h-6 px-2"
              >
                All Off
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.map((category) => (
            <div key={category.key} className="flex items-start justify-between space-x-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Label 
                    htmlFor={`debug-${category.key}`}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {category.label}
                  </Label>
                  <Badge 
                    variant={category.enabled ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {category.enabled ? "ON" : "OFF"}
                  </Badge>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {category.description}
                </p>
              </div>
              <Switch
                id={`debug-${category.key}`}
                checked={category.enabled}
                onCheckedChange={(enabled) => toggleDebug(category.key, enabled)}
              />
            </div>
          ))}
          
          <div className="pt-3 border-t border-gray-700">
            <div className="text-xs text-gray-400 space-y-1">
              <p>💡 <strong>Tips:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Enable specific categories to debug issues</li>
                <li>Backend category shows connection errors</li>
                <li>Session category shows cleanup operations</li>
                <li>Use ?debug=true in URL to show this panel</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DebugControlPanel;