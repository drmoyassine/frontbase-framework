/**
 * Tenant / user-side Workspace Agent settings — API client.
 *
 * Wraps GET / PUT / DELETE /api/agent/settings via the generated client
 * (cookie/Bearer handling lives in lib/api-client.ts).
 */
import {
  agentSettingsGetAgentSettings,
  agentSettingsUpdateAgentSettings,
  agentSettingsResetAgentSettings,
} from '@/client';
import type {
  SettingsResponse,
  SettingsUpdateRequest,
} from '../types/agentSettings';

export const agentSettingsApi = {
  /** Effective merged settings the caller's next turn will use. */
  get: async (): Promise<SettingsResponse> => {
    const { data } = await agentSettingsGetAgentSettings({ throwOnError: true });
    return data as unknown as SettingsResponse;
  },

  /** Upsert the caller's user override (scope=user) or tenant default (scope=tenant). */
  update: async (request: SettingsUpdateRequest): Promise<{ message: string; scope: string }> => {
    const { data } = await agentSettingsUpdateAgentSettings({
      body: request as never,
      throwOnError: true,
    });
    return data as unknown as { message: string; scope: string };
  },

  /** Delete the override for the given scope (falls back to the lower layer). */
  reset: async (scope: 'user' | 'tenant' = 'user'): Promise<{ message: string; deleted: number }> => {
    const { data } = await agentSettingsResetAgentSettings({
      query: { scope },
      throwOnError: true,
    });
    return data as unknown as { message: string; deleted: number };
  },
};
