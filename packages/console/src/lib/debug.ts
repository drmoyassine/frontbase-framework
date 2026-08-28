/**
 * Debug utility for conditional logging based on environment
 * Streamlines logging while keeping critical points for production debugging
 */

const isDevelopment = import.meta.env.DEV || process.env.NODE_ENV === 'development';

export const debug = {
  /**
   * Debug logging - only in development
   */
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Warning logs - always shown but with context
   */
  warn: (context: string, ...args: any[]) => {
    console.warn(`[WARN:${context}]`, ...args);
  },

  /**
   * Error logs - always shown
   */
  error: (context: string, ...args: any[]) => {
    console.error(`[ERROR:${context}]`, ...args);
  },

  /**
   * Critical business logic logs - always shown for production debugging
   */
  critical: (context: string, ...args: any[]) => {
    console.log(`[CRITICAL:${context}]`, ...args);
  },

  /**
   * Performance monitoring - only in development
   */
  perf: (label: string, fn: () => void) => {
    if (isDevelopment) {
      console.time(`[PERF] ${label}`);
      fn();
      console.timeEnd(`[PERF] ${label}`);
    } else {
      fn();
    }
  },

  /**
   * Authentication context logs - streamlined for production
   */
  auth: {
    success: (context: string, userId?: string) => {
      console.log(`[AUTH:${context}] Success${userId ? ` - User: ${userId}` : ''}`);
    },
    failure: (context: string, reason?: string) => {
      console.log(`[AUTH:${context}] Failed${reason ? ` - ${reason}` : ''}`);
    },
    recovery: (context: string, userId: string) => {
      console.log(`[AUTH:${context}] Session recovered - User: ${userId}`);
    }
  }
};