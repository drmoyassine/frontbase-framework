import type { StateCreator } from 'zustand';
import type { BuilderState } from '../builder';
import type { BlockVersion } from '@frontbase/edge-core/block-versions';
import { applyBlockVersion, overrideBlockField, validateBlockVersions } from '@frontbase/edge-core/block-versions';
import { findComponent, updateComponentInTree, inheritedVersionOwner } from '@/lib/tree-utils';

export interface VersionsSlice {
    /** Transient editing state: excluded from layout and persistence. */
    editingVersions: Record<string, string>;
    previewVersionConditions: boolean;
    setEditingVersion: (id: string, version: string) => void;
    setPreviewVersionConditions: (preview: boolean) => void;
    setBlockVersions: (id: string, versions: BlockVersion[]) => void;
    setVersionFieldOverride: (id: string, group: 'props' | 'styles', field: string, enabled: boolean) => void;
}

export const createVersionsSlice: StateCreator<BuilderState, [], [], VersionsSlice> = (set, get) => ({
    editingVersions: {},
    previewVersionConditions: false,
    setEditingVersion: (id, version) => set(state => ({ editingVersions: { ...state.editingVersions, [id]: version }, previewVersionConditions: false })),
    setPreviewVersionConditions: preview => set({ previewVersionConditions: preview }),
    setBlockVersions: (id, versions) => {
        const state = get(), page = state.pages.find(p => p.id === state.currentPageId);
        if (!page?.layoutData) return;
        if(inheritedVersionOwner(page.layoutData.content,id,state.editingVersions))return;
        const content = updateComponentInTree(page.layoutData.content, id, node => ({ ...node, versions }));
        validateBlockVersions(content);
        set({ pages: state.pages.map(p => p.id === page.id ? { ...p, layoutData: { ...page.layoutData!, content } } : p), hasUnsavedChanges: true });
    },
    setVersionFieldOverride: (id, group, field, enabled) => {
        const state = get(), page = state.pages.find(p => p.id === state.currentPageId);
        const node = findComponent(page?.layoutData?.content ?? [], id), version = state.editingVersions[id];
        if (!node || !version || version === 'default') return;
        const effective = applyBlockVersion(node, version);
        const value = group==='styles' ? effective.stylesData?.values?.[field]??effective.styles?.[field] : effective[group]?.[field];
        const updated = overrideBlockField(node, version, group, field, value === undefined ? '' : value, !enabled);
        state.setBlockVersions(id, updated.versions ?? []);
    },
});
