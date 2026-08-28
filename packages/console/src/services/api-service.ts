import axios from 'axios';
import { PORT_CONFIG } from '../lib/portConfig';

// Get the current backend configuration
const getBackendConfig = () => {
  // In development, always use empty baseURL so Vite proxy handles routing
  if (import.meta.env.DEV) {
    return {
      type: 'vite-proxy',
      baseUrl: '', // Empty = relative URLs = goes through Vite proxy
    };
  }

  // In PRODUCTION: ALWAYS use relative URLs
  // This ensures Nginx can proxy correctly regardless of domain/protocol
  // We do NOT read from localStorage to avoid Mixed Content issues
  return {
    type: 'nginx-proxy',
    baseUrl: '', // Relative URL for Nginx reverse proxy
  };
};

// Create axios instance with dynamic baseURL
const createApiInstance = () => {
  const config = getBackendConfig();

  // Only log if debug is explicitly enabled
  if (localStorage.getItem('enableApiDebug') === 'true') {
    console.log('[API Service] Creating API instance with config:', config);
  }

  return axios.create({
    baseURL: config.baseUrl,
    timeout: 10_000, // 10s timeout — prevents request pile-up when backend is unresponsive
    headers: {
      'Content-Type': 'application/json',
    },
    withCredentials: true,
  });
};

// Create the initial API instance
let api = createApiInstance();

// Function to update API instance when backend config changes
export const updateApiInstance = () => {
  api = createApiInstance();

  // Only log if debug is explicitly enabled
  if (localStorage.getItem('enableApiDebug') === 'true') {
    console.log('[API Service] API instance updated with new backend config');
  }
};

import { useAuthStore } from '../stores/auth';
import { isCloud } from '@/lib/edition';
import { getAuthClient, isSupabaseAuth } from '@/lib/auth/AuthClientFactory';

// Request interceptor - automatically bundle Bearer token for Cloud SaaS mode
api.interceptors.request.use(
  async (config) => {
    // In cloud mode, the backend relies on JWT Bearer tokens instead of Cookies
    if (isCloud()) {
      let token: string | null = null;

      // For Supabase auth, get token from AuthClient (managed by Supabase SDK)
      if (isSupabaseAuth()) {
        try {
          const authClient = getAuthClient();
          token = await authClient.getToken();
        } catch (error) {
          console.warn('[API Service] Failed to get token from AuthClient:', error);
        }
      } else {
        // For SuperTokens, get token from auth store (managed by backend)
        const state = useAuthStore.getState();
        token = state.token;
      }

      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      // Multi-project: target the active project. Read from localStorage to avoid a
      // circular import with the project store; the store keeps this value in sync.
      const activeProjectId = localStorage.getItem('activeProjectId');
      if (activeProjectId) {
        config.headers['X-Project-Id'] = activeProjectId;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors and unpack response.data
api.interceptors.response.use(
  (response) => {
    // Return the full axios response so callers can access response.data
    // This maintains backward compatibility with existing code
    return response;
  },
  (error) => {
    // Standard error logging
    if (localStorage.getItem('enableApiDebug') === 'true') {
      console.error('[API Service] Response Error:', {
        url: error.config?.url,
        status: error.response?.status,
        message: error.message,
        data: error.response?.data
      });
    }
    return Promise.reject(error);
  }
);

export default api;