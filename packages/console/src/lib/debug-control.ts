/**
 * Debug Control Utility
 * 
 * Centralized control for all debug logging throughout the application.
 * This allows developers to enable/disable specific debug categories
 * without affecting production performance.
 */

export type DebugCategory = 
  | 'render' 
  | 'backend' 
  | 'session' 
  | 'auth' 
  | 'authStore' 
  | 'api' 
  | 'port';

interface DebugConfig {
  render: boolean;
  backend: boolean;
  session: boolean;
  auth: boolean;
  authStore: boolean;
  api: boolean;
  port: boolean;
}

// Default configuration - all disabled for clean console
const defaultConfig: DebugConfig = {
  render: false,
  backend: false,
  session: false,
  auth: false,
  authStore: false,
  api: false,
  port: false,
};

// Get current debug configuration
export const getDebugConfig = (): DebugConfig => {
  const config: DebugConfig = { ...defaultConfig };
  
  Object.keys(defaultConfig).forEach(key => {
    const category = key as DebugCategory;
    const stored = localStorage.getItem(`debug_${category}`);
    config[category] = stored === 'true';
  });
  
  return config;
};

// Enable a specific debug category
export const enableDebug = (category: DebugCategory): void => {
  localStorage.setItem(`debug_${category}`, 'true');
  console.log(`[DebugControl] Enabled debug for: ${category}`);
};

// Disable a specific debug category
export const disableDebug = (category: DebugCategory): void => {
  localStorage.setItem(`debug_${category}`, 'false');
  console.log(`[DebugControl] Disabled debug for: ${category}`);
};

// Check if a debug category is enabled
export const isDebugEnabled = (category: DebugCategory): boolean => {
  return localStorage.getItem(`debug_${category}`) === 'true';
};

// Get all debug categories status
export const getAllDebugStatus = (): Record<DebugCategory, boolean> => {
  const config = getDebugConfig();
  return config;
};

// Helper functions for consistent debug logging
export const createDebugLogger = (category: DebugCategory) => {
  const isEnabled = isDebugEnabled(category);
  
  return {
    log: (...args: any[]) => {
      if (isEnabled) {
        console.log(`[${category.toUpperCase()}]`, ...args);
      }
    },
    warn: (...args: any[]) => {
      if (isEnabled) {
        console.warn(`[${category.toUpperCase()}]`, ...args);
      }
    },
    error: (...args: any[]) => {
      if (isEnabled) {
        console.error(`[${category.toUpperCase()}]`, ...args);
      }
    },
    enabled: isEnabled
  };
};

// Suppress expected errors during backend switching
export const suppressExpectedError = (operation: string, error: any): boolean => {
  const expectedPatterns = [
    'Backend service unavailable',
    'Backend is not accessible',
    'Network Error',
    'Failed to fetch',
    'ECONNREFUSED',
    'timeout',
    'CORS',
    'Session validation failed'
  ];
  
  const errorMessage = error?.message || error?.toString() || '';
  const isExpected = expectedPatterns.some(pattern => 
    errorMessage.includes(pattern) || errorMessage.toLowerCase().includes(pattern.toLowerCase())
  );
  
  if (isExpected) {
    // Only log if backend debug is enabled
    if (isDebugEnabled('backend')) {
      console.log(`[ExpectedError] ${operation}: ${errorMessage}`);
    }
    return true;
  }
  
  return false;
};

// Quick enable/disable all debug categories
export const enableAllDebug = (): void => {
  Object.keys(defaultConfig).forEach(key => {
    enableDebug(key as DebugCategory);
  });
};

export const disableAllDebug = (): void => {
  Object.keys(defaultConfig).forEach(key => {
    disableDebug(key as DebugCategory);
  });
};

// Export individual debug loggers for convenience
export const debugRender = createDebugLogger('render');
export const debugBackend = createDebugLogger('backend');
export const debugSession = createDebugLogger('session');
export const debugAuth = createDebugLogger('auth');
export const debugAuthStore = createDebugLogger('authStore');
export const debugApi = createDebugLogger('api');
export const debugPort = createDebugLogger('port');