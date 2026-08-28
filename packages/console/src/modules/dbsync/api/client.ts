import axios from 'axios'
import { getFastApiBaseUrl } from '../../../lib/portConfig';
import { isCloud } from '@/lib/edition';
import { getAuthClient, isSupabaseAuth } from '@/lib/auth/AuthClientFactory';
import { useAuthStore } from '@/stores/auth';

const API_URL = getFastApiBaseUrl();

// Append /api/sync to the base URL for the sync microservice
const SYNC_API_URL = `${API_URL}/api/sync`.replace(/([^:]\/)\/+/g, "$1"); // Normalize slashes just in case

export const api = axios.create({
    baseURL: SYNC_API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
})

// Attach auth for Cloud SaaS mode — mirrors src/services/api-service.ts.
// The Data Studio (DBSync) UI talks to /api/sync/* through THIS instance; without
// the Bearer token, Supabase auth mode (JWT in localStorage, no session cookie)
// leaves every sync request unauthenticated, so the backend can't resolve the
// tenant → 401s / an empty Data Studio. Self-host (cookie) mode is unaffected:
// withCredentials sends the session cookie same-origin and the block is skipped.
api.interceptors.request.use(
  async (config) => {
    if (isCloud()) {
      let token: string | null = null;

      if (isSupabaseAuth()) {
        // Supabase manages the JWT via its SDK — pull the live token.
        try {
          token = await getAuthClient().getToken();
        } catch (error) {
          console.warn('[Sync API] Failed to get token from AuthClient:', error);
        }
      } else {
        // SuperTokens: token is mirrored into the auth store by the backend.
        token = useAuthStore.getState().token;
      }

      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }

      // Multi-project: target the active project (kept in localStorage to avoid a
      // circular import with the project store).
      const activeProjectId = localStorage.getItem('activeProjectId');
      if (activeProjectId) {
        config.headers['X-Project-Id'] = activeProjectId;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);
