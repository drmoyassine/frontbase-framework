import {
    agentIntegrationsListMcpServers, agentIntegrationsCreateMcpServer,
    agentIntegrationsGetMcpServer, agentIntegrationsUpdateMcpServer,
    agentIntegrationsDeleteMcpServer, agentIntegrationsListMcpServerTools,
    agentIntegrationsTestMcpServer, agentIntegrationsListSkills,
    agentIntegrationsCreateSkill, agentIntegrationsUpdateSkill,
    agentIntegrationsDeleteSkill, agentIntegrationsGetAgentCatalogue,
    agentIntegrationsListProfileSkills, agentIntegrationsInstallSkill,
    agentIntegrationsUninstallSkill,
} from '@/client';

// =============================================================================
// MCP Servers
// =============================================================================

export interface McpServer {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    url: string;
    transport: string;
    authType: string | null;
    hasAuth: boolean;
    toolFilter: string[] | null;
    category: string | null;
    isPublic: boolean;
    isActive: boolean;
    tenantId: string | null;
    projectId: string | null;
    profileSlug: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface McpServerCreate {
    name: string;
    slug: string;
    description?: string;
    url: string;
    transport?: string;
    authType?: string;
    token?: string;
    toolFilter?: string[];
    category?: string;
    isActive?: boolean;
    profileSlug?: string;
}

export interface McpServerUpdate {
    name?: string;
    description?: string;
    url?: string;
    transport?: string;
    authType?: string;
    token?: string;
    toolFilter?: string[];
    category?: string;
    isActive?: boolean;
    profileSlug?: string;
}

export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: unknown;
}

export interface McpServerTestResult {
    reachable: boolean;
    serverId: string;
}

export interface McpServerToolsResult {
    tools: McpTool[];
    total: number;
}

export interface McpServersListResult {
    mcpServers: McpServer[];
    total: number;
}

// =============================================================================
// Skills
// =============================================================================

export interface AgentSkill {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    category: string | null;
    toolDefinitions: unknown[];
    version: string;
    isBuiltin: boolean;
    isActive: boolean;
    tenantId: string | null;
    projectId: string | null;
    profileSlug: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SkillCreate {
    slug: string;
    name: string;
    description?: string;
    category?: string;
    toolDefinitions: unknown[];
    version?: string;
    profileSlug?: string;
}

export interface SkillUpdate {
    name?: string;
    description?: string;
    category?: string;
    toolDefinitions?: unknown[];
    isActive?: boolean;
    profileSlug?: string;
}

export interface SkillsListResult {
    skills: AgentSkill[];
    total: number;
}

// =============================================================================
// Profile → Skill Installation
// =============================================================================

export interface SkillInstall {
    skillId: string;
    configOverrides?: Record<string, unknown>;
}

export interface InstalledSkill extends AgentSkill {
    configOverrides: Record<string, unknown> | null;
    installedAt: string;
}

export interface ProfileSkillsResult {
    skills: InstalledSkill[];
    total: number;
}

export interface SkillInstallResult {
    installed: boolean;
    skillId: string;
    profileId: string;
}

// =============================================================================
// API Client
// =============================================================================

export const agentIntegrationsApi = {
    // -------------------------------------------------------------------------
    // MCP Servers
    // -------------------------------------------------------------------------

    listMcpServers: async (profileSlug?: string): Promise<McpServersListResult> => {
        const { data } = await agentIntegrationsListMcpServers({ query: { profile_slug: profileSlug }, throwOnError: true });
        return data as unknown as McpServersListResult;
    },

    createMcpServer: async (body: McpServerCreate): Promise<McpServer> => {
        const { data } = await agentIntegrationsCreateMcpServer({ body: body as never, throwOnError: true });
        return data as unknown as McpServer;
    },

    getMcpServer: async (id: string): Promise<McpServer> => {
        const { data } = await agentIntegrationsGetMcpServer({ path: { server_id: id }, throwOnError: true });
        return data as unknown as McpServer;
    },

    updateMcpServer: async (id: string, body: McpServerUpdate): Promise<McpServer> => {
        const { data } = await agentIntegrationsUpdateMcpServer({ path: { server_id: id }, body: body as never, throwOnError: true });
        return data as unknown as McpServer;
    },

    deleteMcpServer: async (id: string): Promise<void> => {
        await agentIntegrationsDeleteMcpServer({ path: { server_id: id }, throwOnError: true });
    },

    listMcpServerTools: async (id: string): Promise<McpServerToolsResult> => {
        const { data } = await agentIntegrationsListMcpServerTools({ path: { server_id: id }, throwOnError: true });
        return data as unknown as McpServerToolsResult;
    },

    testMcpServer: async (id: string): Promise<McpServerTestResult> => {
        const { data } = await agentIntegrationsTestMcpServer({ path: { server_id: id }, throwOnError: true });
        return data as unknown as McpServerTestResult;
    },

    // -------------------------------------------------------------------------
    // Skills
    // -------------------------------------------------------------------------

    listSkills: async (profileSlug?: string): Promise<SkillsListResult> => {
        const { data } = await agentIntegrationsListSkills({ query: { profile_slug: profileSlug }, throwOnError: true });
        return data as unknown as SkillsListResult;
    },

    createSkill: async (body: SkillCreate): Promise<AgentSkill> => {
        const { data } = await agentIntegrationsCreateSkill({ body: body as never, throwOnError: true });
        return data as unknown as AgentSkill;
    },

    updateSkill: async (id: string, body: SkillUpdate): Promise<AgentSkill> => {
        const { data } = await agentIntegrationsUpdateSkill({ path: { skill_id: id }, body: body as never, throwOnError: true });
        return data as unknown as AgentSkill;
    },

    deleteSkill: async (id: string): Promise<void> => {
        await agentIntegrationsDeleteSkill({ path: { skill_id: id }, throwOnError: true });
    },

    // -------------------------------------------------------------------------
    // Profile → Skill
    // -------------------------------------------------------------------------

    getAgentCatalogue: async (profileSlug?: string): Promise<AgentCatalogueResult> => {
        const { data } = await agentIntegrationsGetAgentCatalogue({ query: { profile_slug: profileSlug }, throwOnError: true });
        return data as unknown as AgentCatalogueResult;
    },

    listProfileSkills: async (profileId: string): Promise<ProfileSkillsResult> => {
        const { data } = await agentIntegrationsListProfileSkills({ path: { profile_id: profileId }, throwOnError: true });
        return data as unknown as ProfileSkillsResult;
    },

    installSkill: async (profileId: string, body: SkillInstall): Promise<SkillInstallResult> => {
        const { data } = await agentIntegrationsInstallSkill({ path: { profile_id: profileId }, body: body as never, throwOnError: true });
        return data as unknown as SkillInstallResult;
    },

    uninstallSkill: async (profileId: string, installId: string): Promise<void> => {
        await agentIntegrationsUninstallSkill({ path: { profile_id: profileId, install_id: installId }, throwOnError: true });
    },
};
