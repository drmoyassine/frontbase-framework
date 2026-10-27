/**
 * useActiveProject — the tenant's active project (multi-project, cloud only).
 *
 * activeProjectId is persisted to localStorage and attached to every API request
 * as `X-Project-Id` by the axios interceptor (api-service). Switching projects
 * updates the store (reactive UI) + localStorage (header for subsequent requests);
 * callers invalidate their queries to refetch project-scoped data.
 */

import { create } from 'zustand';
import { projectsApi, ProjectSummary } from '@/services/projectsApi';
import { tenantPlanApi } from '@/services/tenantPlanApi';

const LS_KEY = 'activeProjectId';
const UNLIMITED = -1;

interface ActiveProjectState {
    projects: ProjectSummary[];
    activeProjectId: string | null;
    projectCap: number; // -1 = unlimited
    loading: boolean;
    loaded: boolean;
    load: () => Promise<void>;
    setActive: (id: string) => void;
    createProject: (name: string, description?: string) => Promise<ProjectSummary | null>;
}

export const useActiveProject = create<ActiveProjectState>((set, get) => ({
    projects: [],
    activeProjectId: null,
    projectCap: 1,
    loading: false,
    loaded: false,

    load: async () => {
        set({ loading: true });
        try {
            const [{ projects }, plan] = await Promise.all([
                projectsApi.list(),
                tenantPlanApi.getMyPlan().catch(() => null),
            ]);
            const cap = (plan?.limits?.projects as number) ?? 1;
            // Resolve active: stored value if still valid, else the default/first project.
            const stored = localStorage.getItem(LS_KEY);
            const valid = stored && projects.some((p) => p.id === stored);
            const def = projects.find((p) => p.is_default) || projects[0];
            const activeId = (valid ? stored : def?.id) || null;
            if (activeId) localStorage.setItem(LS_KEY, activeId);
            set({ projects, projectCap: cap, activeProjectId: activeId, loaded: true });
        } finally {
            set({ loading: false });
        }
    },

    setActive: (id: string) => {
        localStorage.setItem(LS_KEY, id);
        set({
            activeProjectId: id,
            projects: get().projects.map((p) => ({ ...p, is_active_project: p.id === id })),
        });
    },

    createProject: async (name, description) => {
        const { project } = await projectsApi.create(name, description);
        await get().load();
        get().setActive(project.id);
        return project;
    },
}));

/** Derived: should the project selector be shown? (>1 project OR plan allows >1) */
export const selectShowSelector = (s: ActiveProjectState) =>
    s.projects.length > 1 || s.projectCap > 1;

export const selectCanCreate = (s: ActiveProjectState) =>
    s.projectCap === UNLIMITED || s.projects.length < s.projectCap;
