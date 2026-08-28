import {
    projectsListProjects, projectsCreateProject, projectsUpdateProjectMeta, projectsDeleteProject,
    projectsListProjectMembers, projectsAddProjectMember, projectsRemoveProjectMember,
    projectsListProjectDatasources, projectsGrantDatasource, projectsRevokeDatasource,
    projectsGrantConnectedAccount, projectsRevokeConnectedAccount,
} from '@/client';

export interface ProjectSummary {
    id: string;
    name: string;
    description?: string | null;
    is_default: boolean;
    status: string;
    created_at: string;
    is_active_project: boolean;
}

export const projectsApi = {
    list: async (): Promise<{ projects: ProjectSummary[] }> => {
        const { data } = await projectsListProjects({ throwOnError: true });
        return data as unknown as { projects: ProjectSummary[] };
    },
    create: async (name: string, description?: string): Promise<{ project: ProjectSummary }> => {
        const { data } = await projectsCreateProject({ body: { name, description }, throwOnError: true });
        return data as unknown as { project: ProjectSummary };
    },
    update: async (id: string, patch: { name?: string; description?: string }): Promise<{ project: ProjectSummary }> => {
        const { data } = await projectsUpdateProjectMeta({ path: { project_id: id }, body: patch, throwOnError: true });
        return data as unknown as { project: ProjectSummary };
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
        const { data } = await projectsDeleteProject({ path: { project_id: id }, throwOnError: true });
        return data as unknown as { success: boolean };
    },
    listMembers: async (projectId: string): Promise<{ members: ProjectMemberEntry[] }> => {
        const { data } = await projectsListProjectMembers({ path: { project_id: projectId }, throwOnError: true });
        return data as unknown as { members: ProjectMemberEntry[] };
    },
    addMember: async (projectId: string, userId: string, role: 'admin' | 'editor' | 'viewer'): Promise<{ success: boolean }> => {
        const { data } = await projectsAddProjectMember({ path: { project_id: projectId }, body: { user_id: userId, role }, throwOnError: true });
        return data as unknown as { success: boolean };
    },
    removeMember: async (projectId: string, userId: string): Promise<{ success: boolean }> => {
        const { data } = await projectsRemoveProjectMember({ path: { project_id: projectId, user_id: userId }, throwOnError: true });
        return data as unknown as { success: boolean };
    },
    // Shareable-resource grants (datasource / connected-account → project)
    listProjectDatasources: async (projectId: string): Promise<{ granted: { id: string; name: string }[]; available: { id: string; name: string }[] }> => {
        const { data } = await projectsListProjectDatasources({ path: { project_id: projectId }, throwOnError: true });
        return data as unknown as { granted: { id: string; name: string }[]; available: { id: string; name: string }[] };
    },
    grantDatasource: async (projectId: string, datasourceId: string): Promise<{ success: boolean }> => {
        const { data } = await projectsGrantDatasource({ path: { project_id: projectId }, body: { resource_id: datasourceId }, throwOnError: true });
        return data as unknown as { success: boolean };
    },
    revokeDatasource: async (projectId: string, datasourceId: string): Promise<{ success: boolean }> => {
        const { data } = await projectsRevokeDatasource({ path: { project_id: projectId, datasource_id: datasourceId }, throwOnError: true });
        return data as unknown as { success: boolean };
    },
    grantConnectedAccount: async (projectId: string, accountId: string): Promise<{ success: boolean }> => {
        const { data } = await projectsGrantConnectedAccount({ path: { project_id: projectId }, body: { resource_id: accountId }, throwOnError: true });
        return data as unknown as { success: boolean };
    },
    revokeConnectedAccount: async (projectId: string, accountId: string): Promise<{ success: boolean }> => {
        const { data } = await projectsRevokeConnectedAccount({ path: { project_id: projectId, account_id: accountId }, throwOnError: true });
        return data as unknown as { success: boolean };
    },
};

export interface ProjectMemberEntry {
    user_id: string;
    email?: string | null;
    role: string;
    implicit: boolean;
}
