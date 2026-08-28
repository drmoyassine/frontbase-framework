/**
 * Request deduplication utility to prevent duplicate API calls
 * Maintains a cache of ongoing requests and reuses promises
 */

interface RequestCache {
  [key: string]: Promise<any>;
}

class RequestDeduplicator {
  private cache: RequestCache = {};
  private timeouts: { [key: string]: NodeJS.Timeout } = {};
  
  /**
   * Execute a request with deduplication
   * If the same request is already in flight, return the existing promise
   */
  async dedupe<T>(key: string, requestFn: () => Promise<T>, ttl: number = 5000): Promise<T> {
    // If request is already in progress, return existing promise
    if (this.cache[key]) {
      return this.cache[key];
    }

    // Create new request
    const requestPromise = requestFn().finally(() => {
      // Clean up cache when request completes
      delete this.cache[key];
      if (this.timeouts[key]) {
        clearTimeout(this.timeouts[key]);
        delete this.timeouts[key];
      }
    });

    // Cache the promise
    this.cache[key] = requestPromise;

    // Set timeout to clean up stuck requests
    this.timeouts[key] = setTimeout(() => {
      delete this.cache[key];
      delete this.timeouts[key];
    }, ttl);

    return requestPromise;
  }

  /**
   * Clear specific request from cache
   */
  invalidate(key: string): void {
    if (this.cache[key]) {
      delete this.cache[key];
    }
    if (this.timeouts[key]) {
      clearTimeout(this.timeouts[key]);
      delete this.timeouts[key];
    }
  }

  /**
   * Clear all cached requests
   */
  clear(): void {
    Object.keys(this.timeouts).forEach(key => {
      clearTimeout(this.timeouts[key]);
    });
    this.cache = {};
    this.timeouts = {};
  }
}

export const requestDeduplicator = new RequestDeduplicator();

/**
 * Generate consistent request keys for deduplication
 */
export const generateRequestKey = (endpoint: string, params?: Record<string, any>): string => {
  const paramString = params ? JSON.stringify(params) : '';
  return `${endpoint}:${paramString}`;
};