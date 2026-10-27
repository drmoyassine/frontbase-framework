/**
 * Tenant / user-side Workspace Agent settings — TypeScript types.
 *
 * Mirrors `app/schemas/agent_settings.py`. Backs the gear-icon settings modal
 * in the Workspace Agent widget.
 */

export interface AgentSettingsGeneral {
  /** 0.0 – 2.0 */
  temperature: number;
  /** 1 – 200000, or null = inherit model / profile default */
  max_tokens: number | null;
  /** 0.0 – 1.0 */
  top_p: number;
  /** 10 – 600 seconds */
  timeout_seconds: number;
}

export interface AgentSettingsSystem {
  /** List of MCP server IDs to disable (global catalogue IDs). */
  disabled_mcp_servers: string[];
  /** List of skill slugs to disable (global catalogue slugs). */
  disabled_skills: string[];
  /** List of tool names to disable (e.g., 'pages_update', 'queryDatasource'). */
  disabled_tools: string[];
}

export interface AgentSettings {
  general: AgentSettingsGeneral;
  system: AgentSettingsSystem;
}

/**
 * Most specific layer that contributed to the effective settings returned by
 * GET /api/agent/settings.
 */
export type SettingsSource = 'user' | 'tenant' | 'profile' | 'default';

export interface SettingsResponse {
  settings: AgentSettings;
  inherited_from: SettingsSource;
  /** True when the caller may write tenant-wide (user_id IS NULL) settings. */
  can_modify_tenant: boolean;
}

export interface SettingsUpdateRequest {
  general: AgentSettingsGeneral;
  system: AgentSettingsSystem;
  scope: 'user' | 'tenant';
}

/** Global catalogue item for the settings modal. */
export interface CatalogueMcpServer {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  disabled: boolean;
}

/** Global catalogue skill for the settings modal. */
export interface CatalogueSkill {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  isBuiltin: boolean;
  disabled: boolean;
}

/** Core tool for the settings modal. */
export interface CatalogueCoreTool {
  name: string;
  label: string;
  category: string;
  disabled: boolean;
}

/** Response from GET /api/agent-catalogue. */
export interface CatalogueResponse {
  mcpServers: CatalogueMcpServer[];
  skills: CatalogueSkill[];
  coreTools: CatalogueCoreTool[];
}
