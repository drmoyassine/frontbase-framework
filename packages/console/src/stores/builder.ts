import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ProjectSlice, createProjectSlice } from './slices/createProjectSlice';
import { PageSlice, createPageSlice } from './slices/createPageSlice';
import { UISlice, createUISlice } from './slices/createUISlice';
import { VariablesSlice, createVariablesSlice } from './slices/createVariablesSlice';
import { BuilderSlice, createBuilderSlice } from './slices/createBuilderSlice';
import { VersionsSlice, createVersionsSlice } from './slices/createVersionsSlice';
import {LayoutHistorySlice,createLayoutHistorySlice} from './slices/createLayoutHistorySlice';

// Re-export types for backward compatibility
export * from '@/types/builder';

export type BuilderState = ProjectSlice & PageSlice & UISlice & VariablesSlice & BuilderSlice & VersionsSlice & LayoutHistorySlice & { reset: () => void };

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set, get, api) => {
      const trackedSet:typeof set=((patch:any,replace?:boolean)=>set((state)=>{
        const next=typeof patch==='function'?patch(state):patch;
        if(next.currentPageId!==undefined&&next.currentPageId!==state.currentPageId)return {...next,layoutUndo:[],layoutRedo:[]};
        const before=state.pages.find(page=>page.id===state.currentPageId),after=next.pages?.find((page:any)=>page.id===state.currentPageId);
        if(next.hasUnsavedChanges===true&&before?.layoutData&&after?.layoutData&&before.layoutData!==after.layoutData&&JSON.stringify(before.layoutData)!==JSON.stringify(after.layoutData)){
          return {...next,layoutUndo:[...state.layoutUndo,{pageId:before.id,layout:structuredClone(before.layoutData)}].slice(-30),layoutRedo:[]};
        }
        return next;
      },replace as any)) as typeof set;
      return {
      ...createProjectSlice(trackedSet, get, api),
      ...createPageSlice(trackedSet, get, api),
      ...createUISlice(trackedSet, get, api),
      ...createVariablesSlice(trackedSet, get, api),
      ...createBuilderSlice(trackedSet, get, api),
      ...createVersionsSlice(trackedSet, get, api),
      ...createLayoutHistorySlice(set,get,api),
      reset: () => {
        // Reset state by re-initializing all slices
        set({
          project: null,
          pages: [],
          currentPageId: null,
          appVariables: [],
          selectedComponentId: null,
          editingVersions: {},
          previewVersionConditions: false,
          layoutUndo:[],layoutRedo:[],

        });
      },
    };},
    {
      name: 'frontbase-builder-storage',
      partialize: (state) => ({
        project: state.project,
        // Don't persist pages or variables in local storage as we load from DB
      }),
    }
  )
);
