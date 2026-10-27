/**
 * Agent Catalogue API client.
 *
 * Fetches the global catalogue of MCP servers, skills, and core tools for
 * the settings modal. Used to populate the exclusion toggles.
 */
import { agentIntegrationsGetAgentCatalogue } from '@/client';
import type { CatalogueResponse } from '../types/agentSettings';

export const agentCatalogueApi = {
  /** Global catalogue of available MCP servers, skills, and core tools. */
  get: async (): Promise<CatalogueResponse> => {
    const { data } = await agentIntegrationsGetAgentCatalogue({ throwOnError: true });
    return data as unknown as CatalogueResponse;
  },
};
