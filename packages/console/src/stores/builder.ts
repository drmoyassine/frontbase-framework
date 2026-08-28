import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ProjectSlice, createProjectSlice } from './slices/createProjectSlice';
import { PageSlice, createPageSlice } from './slices/createPageSlice';
import { UISlice, createUISlice } from './slices/createUISlice';
import { VariablesSlice, createVariablesSlice } from './slices/createVariablesSlice';
import { BuilderSlice, createBuilderSlice } from './slices/createBuilderSlice';

// Re-export types for backward compatibility
export * from '@/types/builder';

export type BuilderState = ProjectSlice & PageSlice & UISlice & VariablesSlice & BuilderSlice & { reset: () => void };

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set, get, api) => ({
      ...createProjectSlice(set, get, api),
      ...createPageSlice(set, get, api),
      ...createUISlice(set, get, api),
      ...createVariablesSlice(set, get, api),
      ...createBuilderSlice(set, get, api),
      reset: () => {
        // Reset state by re-initializing all slices
        set({
          project: null,
          pages: [],
          currentPageId: null,
          appVariables: [],
          selectedComponentId: null,

        });
      },
    }),
    {
      name: 'frontbase-builder-storage',
      partialize: (state) => ({
        project: state.project,
        // Don't persist pages or variables in local storage as we load from DB
      }),
    }
  )
);
