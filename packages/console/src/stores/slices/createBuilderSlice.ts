import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ComponentData } from '@/types/builder';
import type { StylesData } from '@/lib/styles/types';
import { BuilderState } from '../builder';
import { toast } from '@/hooks/use-toast';
import { applyBlockVersion, cloneBlockTree } from '@frontbase/edge-core/block-versions';
import {
    findComponent,
    findComponentWithParent,
    removeComponentFromTree,
    insertComponentIntoTree,
    updateComponentInTree
} from '@/lib/tree-utils';
import { inheritedVersionOwner } from '@/lib/tree-utils';

export interface BuilderSlice {
    selectedComponentId: string | null;
    draggedComponentId: string | null;
    editingTextNode: { componentId: string, property: string } | null;
    copiedComponent: ComponentData | null;
    focusedField: { componentId: string; fieldName: string } | null;

    // Card-level selection (for FeatureSections, etc.)
    selectedCardIndex: number | null;
    copiedCard: any | null;  // The copied card data

    // Element picker mode for visual selection (e.g., scroll-to-section target)
    elementPickerMode: {
        active: boolean;
        callback: ((elementId: string) => void) | null;
    } | null;



    setSelectedComponentId: (id: string | null) => void;
    setDraggedComponentId: (componentId: string | null) => void;
    setEditingTextNode: (node: { componentId: string, property: string } | null) => void;
    setFocusedField: (field: { componentId: string; fieldName: string } | null) => void;

    // Card-level actions
    setSelectedCardIndex: (index: number | null) => void;
    copyCard: (cardData: any) => void;
    pasteCard: () => void;
    deleteCard: () => void;

    // Element picker actions
    startElementPicker: (callback: (elementId: string) => void) => void;
    cancelElementPicker: () => void;



    moveComponent: (pageId: string, componentId: string | null, component: ComponentData, targetIndex: number, parentId?: string, sourceParentId?: string) => void;
    updateComponentText: (componentId: string, textProperty: string, text: string) => void;
    updateComponent: (componentId: string, propsUpdates: Record<string, any>) => void;
    /**
     * Write a fully-computed `stylesData` object onto a component node. This is
     * the single store action for root-level CSS writes (the Styling tab and
     * any `styleTarget: 'stylesData'` schema prop route through here). The
     * caller owns the viewport-merge policy (base values vs.
     * viewportOverrides); this action only persists the result into the tree.
     */
    updateComponentStylesData: (componentId: string, stylesData: StylesData) => void;
    /** Replace a component node in-place with a new node (same position in the
     * tree). Used by the Repeater "Convert / Wrap" actions. */
    replaceComponent: (componentId: string, newComponent: ComponentData) => void;
    removeComponent: (componentId: string) => void;
    deleteSelectedComponent: () => void;
    copyComponent: (componentId: string) => void;
    pasteComponent: () => void;
    duplicateComponent: (componentId: string) => void;
}

const createBuilderSliceImplementation: StateCreator<BuilderState, [], [], BuilderSlice> = (set, get) => ({
    selectedComponentId: null,
    draggedComponentId: null,
    editingTextNode: null,
    copiedComponent: null,
    focusedField: null,
    selectedCardIndex: null,
    copiedCard: null,
    elementPickerMode: null,


    setSelectedComponentId: (id) => set({ selectedComponentId: id, selectedCardIndex: null }),
    setDraggedComponentId: (id) => set({ draggedComponentId: id }),
    setEditingTextNode: (node) => set({ editingTextNode: node }),
    setFocusedField: (field) => set({ focusedField: field }),
    setSelectedCardIndex: (index) => set({ selectedCardIndex: index }),

    // Element picker mode
    startElementPicker: (callback) => set({
        elementPickerMode: { active: true, callback }
    }),
    cancelElementPicker: () => set({ elementPickerMode: null }),



    copyCard: (cardData) => {
        set({ copiedCard: JSON.parse(JSON.stringify(cardData)) });
        toast({
            title: "Card copied",
            description: "Press Ctrl/Cmd+V to paste into another section"
        });
    },

    pasteCard: () => {
        const { copiedCard, selectedComponentId, currentPageId, pages } = get();
        if (!copiedCard || !selectedComponentId || !currentPageId) return;

        const pageIndex = pages.findIndex(p => p.id === currentPageId);
        if (pageIndex === -1) return;

        // Find the selected component and check if it's a FeatureSection
        const page = pages[pageIndex];
        const component = findComponent(page.layoutData?.content || [], selectedComponentId);

        if (component && component.type === 'FeatureSection') {
            const features = component.props?.features || [];
            const newCard = {
                ...copiedCard,
                id: `feature-${Date.now()}`,
            };

            set((state) => {
                const newPages = [...state.pages];
                const newContent = JSON.parse(JSON.stringify(newPages[pageIndex].layoutData?.content || []));

                const updateFeatures = (components: ComponentData[]): boolean => {
                    for (const comp of components) {
                        if (comp.id === selectedComponentId) {
                            comp.props = comp.props || {};
                            comp.props.features = [...(comp.props.features || []), newCard];
                            return true;
                        }
                        if (comp.children && updateFeatures(comp.children)) return true;
                    }
                    return false;
                };

                updateFeatures(newContent);
                newPages[pageIndex] = {
                    ...newPages[pageIndex],
                    layoutData: { ...newPages[pageIndex].layoutData, content: newContent }
                };

                return { ...state, pages: newPages, hasUnsavedChanges: true };
            });

            toast({
                title: "Card pasted",
                description: "Card added to the selected section"
            });
        }
    },

    deleteCard: () => {
        const { selectedComponentId, selectedCardIndex, currentPageId, pages } = get();
        if (selectedCardIndex === null || !selectedComponentId || !currentPageId) return;

        const pageIndex = pages.findIndex(p => p.id === currentPageId);
        if (pageIndex === -1) return;

        set((state) => {
            const newPages = [...state.pages];
            const newContent = JSON.parse(JSON.stringify(newPages[pageIndex].layoutData?.content || []));

            const updateFeatures = (components: ComponentData[]): boolean => {
                for (const comp of components) {
                    if (comp.id === selectedComponentId && comp.props?.features) {
                        comp.props.features = comp.props.features.filter((_: any, i: number) => i !== selectedCardIndex);
                        return true;
                    }
                    if (comp.children && updateFeatures(comp.children)) return true;
                }
                return false;
            };

            updateFeatures(newContent);
            newPages[pageIndex] = {
                ...newPages[pageIndex],
                layoutData: { ...newPages[pageIndex].layoutData, content: newContent }
            };

            return { ...state, pages: newPages, selectedCardIndex: null, hasUnsavedChanges: true };
        });

        toast({
            title: "Card deleted",
            description: "Card removed from section"
        });
    },

    moveComponent: (pageId, componentId, component, targetIndex, parentId, sourceParentId) => {
        set((state) => {
            const pageIndex = state.pages.findIndex(p => p.id === pageId);
            if (pageIndex === -1) return state;

            const newPages = [...state.pages];
            const page = { ...newPages[pageIndex] };

            let content = page.layoutData?.content || [];

            if (!componentId && component.type === 'Repeater' && !component.children?.length) {
                component = { ...component, children: [{ id: uuidv4(), type: 'Card', props: { className: 'p-6' }, children: [{id:uuidv4(),type:'Heading',props:{text:'{{ record.title }}',level:'3'}}] }] };
            }

            // Refuse cycles/missing destinations before removing anything.
            if (parentId && (!findComponent(content, parentId) || parentId === componentId || (componentId && findComponent([component], parentId)))) return state;
            if (componentId) {
                const source = findComponentWithParent(content, componentId);
                if (!source) return state;
                component = source.component;
                // Drop indexes refer to boundaries in the original siblings.
                if ((source.parent?.id ?? undefined) === parentId && targetIndex > source.index) targetIndex--;
                content = removeComponentFromTree(content, componentId);
            }

            content = insertComponentIntoTree(content, parentId, component, targetIndex, state.editingVersions);

            page.layoutData = {
                ...page.layoutData,
                content
            };

            newPages[pageIndex] = page;

            return {
                ...state,
                pages: newPages,
                hasUnsavedChanges: true
            };
        });
    },

    updateComponentText: (componentId: string, textProperty: string, text: string) => {
        const editingState=get(),editingVersion=editingState.editingVersions[componentId];
        if(editingVersion&&editingVersion!=='default'){
            const node=findComponent(editingState.pages.find(page=>page.id===editingState.currentPageId)?.layoutData?.content??[],componentId);
            if(!node)return;
            const props=structuredClone(applyBlockVersion(node,editingVersion).props),parts=textProperty.split('.');
            if(parts.some(part=>['__proto__','constructor','prototype'].includes(part)))return;
            let target=props;for(const part of parts.slice(0,-1))target=target[part]??=(/^\d+$/.test(part)?[]:{});
            target[parts.at(-1)!]=text;editingState.updateComponent(componentId,{...(textProperty==='content'&&['Text','Heading','Paragraph'].includes(node.type)?{text:''}:{}),[parts[0]]:props[parts[0]]});return;
        }
        set((state) => {
            const { pages, currentPageId } = state;
            if (!currentPageId) return state;

            const pageIndex = pages.findIndex(p => p.id === currentPageId);
            if (pageIndex === -1) return state;

            const page = { ...pages[pageIndex] };

            if (page.layoutData?.content) {
                page.layoutData = {
                    ...page.layoutData,
                    content: updateComponentInTree(
                        page.layoutData.content,
                        componentId,
                        (comp) => {
                            const newProps = { ...comp.props };
                            if (textProperty.includes('.')) {
                                const parts = textProperty.split('.');
                                let current: any = newProps;
                                for (let i = 0; i < parts.length - 1; i++) {
                                    // Primitive-intermediate guard: if the path
                                    // walks through a non-object/non-array value
                                    // (e.g. a string or number was stored where a
                                    // nested object was expected), reset it to a
                                    // fresh object instead of spreading a primitive
                                    // (which would yield {}) or stringifying it.
                                    const existing = current[parts[i]];
                                    if (Array.isArray(existing)) {
                                        current[parts[i]] = [...existing];
                                    } else if (existing !== null && typeof existing === 'object') {
                                        current[parts[i]] = { ...existing };
                                    } else {
                                        current[parts[i]] = {};
                                    }
                                    current = current[parts[i]];
                                }
                                current[parts[parts.length - 1]] = text;
                            } else {
                                newProps[textProperty] = text;
                                if(textProperty==='content' && ['Text','Heading','Paragraph'].includes(comp.type)) newProps.text='';
                            }
                            return {
                                ...comp,
                                props: newProps
                            };
                        }
                    )
                };
            }

            const updatedPages = [...state.pages];
            updatedPages[pageIndex] = page;

            return {
                ...state,
                pages: updatedPages,
                hasUnsavedChanges: true
            };
        });
    },

    updateComponent: (componentId: string, propsUpdates: Record<string, any>) => {
        set((state) => {
            const { pages, currentPageId } = state;
            if (!currentPageId) return state;

            const pageIndex = pages.findIndex(p => p.id === currentPageId);
            if (pageIndex === -1) return state;

            const page = { ...pages[pageIndex] };

            if (page.layoutData?.content) {
                page.layoutData = {
                    ...page.layoutData,
                    content: updateComponentInTree(
                        page.layoutData.content,
                        componentId,
                        (comp) => {
                            const { visibilityCondition, visibility, ...restProps } = propsUpdates;
                            const editingVersion = state.editingVersions[componentId];
                            if (editingVersion && editingVersion !== 'default' && comp.versions?.some(v => v.id === editingVersion)) {
                                return { ...comp,
                                    ...(visibilityCondition !== undefined ? { visibilityCondition } : {}),
                                    versions: comp.versions.map(version => version.id === editingVersion ? {
                                        ...version, overrides: { ...version.overrides, props: { ...version.overrides.props, ...restProps },...(visibility!==undefined?{visibility}:{}) }
                                    } : version) };
                            }
                            const updated: any = {
                                ...comp,
                                props: { ...comp.props, ...restProps }
                            };
                            if (visibilityCondition !== undefined) {
                                updated.visibilityCondition = visibilityCondition;
                            }
                            if(visibility!==undefined)updated.visibility=visibility;
                            return updated;
                        }
                    )
                };
            }

            const newPages = [...state.pages];
            newPages[pageIndex] = page;

            return {
                ...state,
                pages: newPages,
                hasUnsavedChanges: true
            };
        });
    },

    updateComponentStylesData: (componentId: string, stylesData: StylesData) => {
        set((state) => {
            const { pages, currentPageId } = state;
            if (!currentPageId) return state;

            const pageIndex = pages.findIndex(p => p.id === currentPageId);
            if (pageIndex === -1) return state;

            const page = { ...pages[pageIndex] };

            if (page.layoutData?.content) {
                page.layoutData = {
                    ...page.layoutData,
                    content: updateComponentInTree(
                        page.layoutData.content,
                        componentId,
                        (comp) => {
                            const editingVersion = state.editingVersions[componentId];
                            if (!editingVersion || editingVersion === 'default') return { ...comp, stylesData };
                            // Store only changed style values; unchanged values continue inheriting.
                            const effective = applyBlockVersion(comp, editingVersion);
                            const values = Object.fromEntries(Object.entries(stylesData.values ?? {}).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(comp.stylesData?.values?.[key])));
                            return { ...comp, versions: comp.versions?.map(version => version.id === editingVersion ? {
                                ...version, overrides: { ...version.overrides, stylesData: { ...effective.stylesData, ...stylesData, values } }
                            } : version) };
                        }
                    )
                };
            }

            const newPages = [...state.pages];
            newPages[pageIndex] = page;

            return {
                ...state,
                pages: newPages,
                hasUnsavedChanges: true
            };
        });
    },

    replaceComponent: (componentId: string, newComponent: ComponentData) => {
        set((state) => {
            const { pages, currentPageId } = state;
            if (!currentPageId) return state;

            const pageIndex = pages.findIndex(p => p.id === currentPageId);
            if (pageIndex === -1) return state;

            const page = { ...pages[pageIndex] };

            if (page.layoutData?.content) {
                // Swap the matching node in place; newComponent keeps the same
                // tree position (and its own id/children).
                page.layoutData = {
                    ...page.layoutData,
                    content: updateComponentInTree(
                        page.layoutData.content,
                        componentId,
                        () => newComponent
                    )
                };
            }

            const newPages = [...state.pages];
            newPages[pageIndex] = page;

            return {
                ...state,
                pages: newPages,
                hasUnsavedChanges: true
            };
        });
    },

    removeComponent: (componentId: string) => {
        set((state) => {
            const { pages, currentPageId } = state;
            if (!currentPageId) return state;

            const pageIndex = pages.findIndex(p => p.id === currentPageId);
            if (pageIndex === -1) return state;

            const page = { ...pages[pageIndex] };

            if (page.layoutData?.content) {
                page.layoutData = {
                    ...page.layoutData,
                    content: removeComponentFromTree(page.layoutData.content, componentId)
                };
            }

            const newPages = [...state.pages];
            newPages[pageIndex] = page;

            return {
                ...state,
                pages: newPages,
                selectedComponentId: state.selectedComponentId === componentId ? null : state.selectedComponentId,
                hasUnsavedChanges: true
            };
        });
    },

    deleteSelectedComponent: () => {
        const { selectedComponentId, currentPageId, pages } = get();
        if (!selectedComponentId || !currentPageId) return;

        const pageIndex = pages.findIndex(p => p.id === currentPageId);
        if (pageIndex === -1) return;

        set((state) => {
            const newPages = [...state.pages];
            const page = { ...newPages[pageIndex] };
            const content = page.layoutData?.content || [];

            page.layoutData = {
                ...page.layoutData,
                content: removeComponentFromTree([...content], selectedComponentId)
            };

            newPages[pageIndex] = page;

            return {
                ...state,
                pages: newPages,
                selectedComponentId: null,
                hasUnsavedChanges: true
            };
        });

        toast({
            title: "Component deleted",
            description: "Component has been removed successfully"
        });
    },

    copyComponent: (componentId: string) => {
        const { currentPageId, pages } = get();
        if (!currentPageId) return;

        const page = pages.find(p => p.id === currentPageId);
        if (!page?.layoutData?.content) return;

        const component = findComponent(page.layoutData.content, componentId);
        if (component) {
            set({ copiedComponent: JSON.parse(JSON.stringify(component)) });
            toast({
                title: "Component copied",
                description: "Press Ctrl/Cmd+V to paste"
            });
        }
    },

    pasteComponent: () => {
        const { copiedComponent, currentPageId, pages, selectedComponentId } = get();
        if (!copiedComponent || !currentPageId) return;

        const pageIndex = pages.findIndex(p => p.id === currentPageId);
        if (pageIndex === -1) return;

        const page = pages[pageIndex];
        const content = page.layoutData?.content || [];

        const cloneWithNewIds = (comp: ComponentData): ComponentData => {
            const newComp = { ...comp, id: uuidv4() };
            if (newComp.children) {
                newComp.children = newComp.children.map(cloneWithNewIds);
            }
            return newComp;
        };

        const newComponent = cloneBlockTree([copiedComponent], uuidv4)[0];

        set((state) => {
            const newPages = [...state.pages];
            const newPage = { ...newPages[pageIndex] };
            // Shallow-copy the root array only; the insert walk below rebuilds
            // the matched path immutably (spreading each ancestor + the parent's
            // children array), so no object that belongs to the prior state
            // snapshot is ever written to in place. (Previously this used a
            // JSON deep-clone as a brute-force guard; the structural clone
            // below is cheaper and matches removeComponentFromTree's pattern.)
            let newContent = [...(newPage.layoutData?.content || [])];

            // If there's a selected component, try to paste into its parent container
            if (selectedComponentId) {
                const result = findComponentWithParent(newContent, selectedComponentId);
                if (result && result.parent) {
                    // Immutably walk to the parent and insert the clone right
                    // after the selected component. Returns a rebuilt tree (or
                    // null if the parent is somehow unreachable), mirroring the
                    // removeComponentFromTree / insertComponentIntoTree pattern.
                    const insertAfter = (components: ComponentData[]): ComponentData[] | null => {
                        for (let i = 0; i < components.length; i++) {
                            const comp = components[i];
                            if (comp.id === result.parent!.id && comp.children) {
                                const newChildren = [...comp.children];
                                newChildren.splice(result.index + 1, 0, newComponent);
                                const rebuilt = [...components];
                                rebuilt[i] = { ...comp, children: newChildren };
                                return rebuilt;
                            }
                            if (comp.children) {
                                const rebuiltChildren = insertAfter(comp.children);
                                if (rebuiltChildren) {
                                    const rebuilt = [...components];
                                    rebuilt[i] = { ...comp, children: rebuiltChildren };
                                    return rebuilt;
                                }
                            }
                        }
                        return null;
                    };
                    const updated = insertAfter(newContent);
                    if (updated) {
                        newContent = updated;
                    } else {
                        // No selection found, add to end
                        newContent.push(newComponent);
                    }
                } else if (result) {
                    // Selected component is at root level, insert after it
                    newContent.splice(result.index + 1, 0, newComponent);
                } else {
                    // No selection found, add to end
                    newContent.push(newComponent);
                }
            } else {
                // No selection, add at root level
                newContent.push(newComponent);
            }

            newPage.layoutData = { ...newPage.layoutData, content: newContent };
            newPages[pageIndex] = newPage;

            return {
                ...state,
                pages: newPages,
                selectedComponentId: newComponent.id,
                hasUnsavedChanges: true
            };
        });

        toast({
            title: "Component pasted",
            description: "Component pasted successfully"
        });
    },

    duplicateComponent: (componentId: string) => {
        const { currentPageId, pages } = get();
        if (!currentPageId) return;

        const pageIndex = pages.findIndex(p => p.id === currentPageId);
        if (pageIndex === -1) return;

        const page = pages[pageIndex];
        const content = page.layoutData?.content || [];

        const result = findComponentWithParent(content, componentId);
        if (!result) return;

        const cloneWithNewIds = (comp: ComponentData): ComponentData => {
            const newComp = { ...comp, id: uuidv4() };
            if (newComp.children) {
                newComp.children = newComp.children.map(cloneWithNewIds);
            }
            return newComp;
        };

        const duplicate = cloneBlockTree([result.component], uuidv4)[0];

        set((state) => {
            const newPages = [...state.pages];
            const newPage = { ...newPages[pageIndex] };
            let newContent = [...(newPage.layoutData?.content || [])];

            // Insert duplicate after original. The walk rebuilds the matched
            // path immutably (spreading each ancestor + the parent's children
            // array) so no node from the prior state snapshot is mutated in
            // place — same pattern as removeComponentFromTree.
            if (result.parent) {
                const insertAfter = (components: ComponentData[]): ComponentData[] | null => {
                    for (let i = 0; i < components.length; i++) {
                        const comp = components[i];
                        if (comp.id === result.parent!.id && comp.children) {
                            const newChildren = [...comp.children];
                            newChildren.splice(result.index + 1, 0, duplicate);
                            const rebuilt = [...components];
                            rebuilt[i] = { ...comp, children: newChildren };
                            return rebuilt;
                        }
                        if (comp.children) {
                            const rebuiltChildren = insertAfter(comp.children);
                            if (rebuiltChildren) {
                                const rebuilt = [...components];
                                rebuilt[i] = { ...comp, children: rebuiltChildren };
                                return rebuilt;
                            }
                        }
                    }
                    return null;
                };
                const updated = insertAfter(newContent);
                if (updated) newContent = updated;
            } else {
                newContent.splice(result.index + 1, 0, duplicate);
            }

            newPage.layoutData = { ...newPage.layoutData, content: newContent };
            newPages[pageIndex] = newPage;

            return {
                ...state,
                pages: newPages,
                selectedComponentId: duplicate.id,
                hasUnsavedChanges: true
            };
        });

        toast({
            title: "Component duplicated",
            description: "Component duplicated successfully"
        });
    },
});

export const createBuilderSlice:StateCreator<BuilderState,[],[],BuilderSlice>=(set,get,api)=>{
    const slice=createBuilderSliceImplementation(set,get,api);
    const protect=(id:string|null|undefined,structure=false)=>{
        if(!id)return false;
        const state=get(),content=state.pages.find(page=>page.id===state.currentPageId)?.layoutData?.content??[];
        const inherited=inheritedVersionOwner(content,id,state.editingVersions);
        const node=findComponent(content,id),selected=node?.versions?.find(version=>version.id===state.editingVersions[id]);
        if(inherited || structure && selected && !selected.overrides.children){
            toast({title:'Inherited from Default',description:'Select the parent version and enable Override structure before editing these children.'});return true;
        }
        return false;
    };
    for(const key of ['updateComponent','updateComponentText','updateComponentStylesData','replaceComponent','removeComponent','duplicateComponent'] as const){
        const action=slice[key] as (...args:any[])=>void;
        (slice as any)[key]=(...args:any[])=>{if(!protect(args[0]))action(...args);};
    }
    const removeSelected=slice.deleteSelectedComponent;slice.deleteSelectedComponent=()=>{if(!protect(get().selectedComponentId))removeSelected();};
    const move=slice.moveComponent;slice.moveComponent=(...args)=>{if(!protect(args[1])&&!protect(args[4],true))move(...args);};
    slice.duplicateComponent=(id)=>{
        if(protect(id))return;
        const state=get(),content=state.pages.find(page=>page.id===state.currentPageId)?.layoutData?.content??[],found=findComponentWithParent(content,id);
        if(!found||!state.currentPageId)return;
        const copy=cloneBlockTree([found.component],uuidv4)[0];
        slice.moveComponent(state.currentPageId,null,copy,found.index+1,found.parent?.id);
        state.setSelectedComponentId(copy.id);
    };
    slice.pasteComponent=()=>{
        const state=get();if(!state.copiedComponent||!state.currentPageId)return;
        const content=state.pages.find(page=>page.id===state.currentPageId)?.layoutData?.content??[];
        const target=state.selectedComponentId?findComponentWithParent(content,state.selectedComponentId):null;
        const parent=target?.parent?.id;
        if(protect(target?.component.id)||protect(parent,true))return;
        const copy=cloneBlockTree([state.copiedComponent],uuidv4)[0];slice.moveComponent(state.currentPageId,null,copy,target?target.index+1:-1,parent);state.setSelectedComponentId(copy.id);
    };
    return slice;
};
