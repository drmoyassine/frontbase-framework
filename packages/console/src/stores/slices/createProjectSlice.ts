import { StateCreator } from 'zustand';
import { ProjectConfig } from '@/types/builder';
import { BuilderState } from '../builder';
import { getProject as getProjectApi, updateProject as updateProjectApi } from '../../services/project-api';

export interface ProjectSlice {
    project: ProjectConfig | null;
    isProjectLoading: boolean;
    error: string | null;
    setProject: (project: ProjectConfig) => void;
    updateProject: (updates: Partial<ProjectConfig>) => void;
    loadProjectFromDatabase: () => Promise<void>;
    updateProjectInDatabase: (projectData: Partial<ProjectConfig>) => Promise<void>;
}

// Transform API response (snake_case) to frontend format (camelCase)
function transformProjectData(apiProject: any): ProjectConfig {
    return {
        ...apiProject,
        appUrl: apiProject.app_url || apiProject.appUrl,
        faviconUrl: apiProject.favicon_url || apiProject.faviconUrl,
        logoUrl: apiProject.logo_url || apiProject.logoUrl,
        supabaseUrl: apiProject.supabase_url || apiProject.supabaseUrl,
        supabaseAnonKey: apiProject.supabase_anon_key || apiProject.supabaseAnonKey,
        usersConfig: apiProject.users_config || apiProject.usersConfig,
        createdAt: apiProject.created_at || apiProject.createdAt,
        updatedAt: apiProject.updated_at || apiProject.updatedAt,
    };
}

export const createProjectSlice: StateCreator<BuilderState, [], [], ProjectSlice> = (set, get) => ({
    project: null,
    isProjectLoading: false,
    error: null,
    setProject: (project) => set({ project }),
    updateProject: (updates) => set((state) => ({
        project: state.project ? { ...state.project, ...updates, updatedAt: new Date().toISOString() } : null
    })),
    loadProjectFromDatabase: async () => {
        set({ isProjectLoading: true, error: null });
        try {
            const apiProject = await getProjectApi();
            const project = transformProjectData(apiProject);
            set({ project, isProjectLoading: false });
        } catch (error: any) {
            set({
                error: error.response?.data?.message || 'Failed to fetch project',
                isProjectLoading: false,
            });
        }
    },
    updateProjectInDatabase: async (projectData: Partial<ProjectConfig>) => {
        set({ isProjectLoading: true, error: null });
        try {
            const apiProject = await updateProjectApi(projectData);
            const project = transformProjectData(apiProject);
            set({ project, isProjectLoading: false });
        } catch (error: any) {
            set({
                error: error.response?.data?.message || 'Failed to update project',
                isProjectLoading: false,
            });
            throw error;
        }
    },
});
