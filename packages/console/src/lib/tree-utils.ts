import { ComponentData } from '@/stores/builder';

/** An inherited/hidden child cannot accidentally write back into Default. */
export function inheritedVersionOwner(nodes:ComponentData[],id:string,selections:Readonly<Record<string,string>>={},owner?:string):string|undefined{
    for(const node of nodes){
        if(node.id===id)return owner;
        const selected=node.versions?.find(version=>version.id===selections[node.id]);
        const defaultOwner=owner??(selected?node.id:undefined);
        const found=inheritedVersionOwner(node.children??[],id,selections,defaultOwner);
        if(found)return found;
        for(const version of node.versions??[]){
            const found=inheritedVersionOwner(version.overrides.children as ComponentData[]??[],id,selections,owner??(version.id===selected?.id?undefined:node.id));
            if(found)return found;
        }
    }
}

/**
 * Recursively finds a component by ID in a list of components.
 */
export const findComponent = (components: ComponentData[], id: string): ComponentData | null => {
    for (const component of components) {
        if (component.id === id) return component;
        if (component.children) {
            const found = findComponent(component.children, id);
            if (found) return found;
        }
        for (const version of component.versions ?? []) {
            const found = findComponent(version.overrides.children as ComponentData[] ?? [], id);
            if (found) return found;
        }
    }
    return null;
};

/**
 * Recursively finds a component by ID and returns it with its parent and index.
 */
export const findComponentWithParent = (
    components: ComponentData[],
    id: string,
    parent: ComponentData | null = null
): { component: ComponentData; parent: ComponentData | null; index: number; siblings: ComponentData[] } | null => {
    for (let i = 0; i < components.length; i++) {
        if (components[i].id === id) {
            return { component: components[i], parent, index: i, siblings: components };
        }
        if (components[i].children) {
            const found = findComponentWithParent(components[i].children, id, components[i]);
            if (found) return found;
        }
        for (const version of components[i].versions ?? []) {
            const found = findComponentWithParent(version.overrides.children as ComponentData[] ?? [], id, components[i]);
            if (found) return found;
        }
    }
    return null;
};

/**
 * Recursively removes a component by ID from a list of components.
 * Pure: never mutates the input tree — parents along the matched path are
 * shallow-copied so their `children` ref is replaced.
 */
export const removeComponentFromTree = (items: ComponentData[], id: string): ComponentData[] => {
    const result: ComponentData[] = [];
    for (const item of items) {
        if (item.id === id) continue;
        result.push({ ...item,
            ...(item.children ? { children: removeComponentFromTree(item.children, id) } : {}),
            ...(item.versions ? { versions: item.versions.map(version => ({ ...version, overrides: { ...version.overrides,
                ...(version.overrides.children ? { children: removeComponentFromTree(version.overrides.children as ComponentData[], id) } : {}) } })) } : {}) });
    }
    return result;
};

/**
 * Recursively inserts a component into the tree at a specific index.
 * If index is -1, appends to the end.
 */
export const insertComponentIntoTree = (
    items: ComponentData[],
    targetId: string | undefined,
    comp: ComponentData,
    index: number,
    editingVersions: Readonly<Record<string, string>> = {}
): ComponentData[] => {
    if (!targetId) {
        // Insert at root level
        const newItems = [...items];
        if (index === -1) {
            newItems.push(comp);
        } else {
            newItems.splice(index, 0, comp);
        }
        return newItems;
    }

    return items.map(item => {
        if (item.id === targetId) {
            const versionId = editingVersions[item.id];
            const version = item.versions?.find(v => v.id === versionId);
            if (version) {
                if (!version.overrides.children) throw Error('Override structure before adding children to this version.');
                const children = [...version.overrides.children];
                children.splice(index === -1 ? children.length : index, 0, comp);
                return { ...item, versions: item.versions!.map(v => v === version ? { ...v, overrides: { ...v.overrides, children } } : v) };
            }
            const newChildren = item.children ? [...item.children] : [];
            if (index === -1) {
                newChildren.push(comp);
            } else {
                newChildren.splice(index, 0, comp);
            }
            return { ...item, children: newChildren };
        }
        return { ...item,
            ...(item.children ? { children: insertComponentIntoTree(item.children, targetId, comp, index, editingVersions) } : {}),
            ...(item.versions ? { versions: item.versions.map(v => ({ ...v, overrides: { ...v.overrides,
                ...(v.overrides.children ? { children: insertComponentIntoTree(v.overrides.children as ComponentData[], targetId, comp, index, editingVersions) } : {}) } })) } : {}) };
    });
};

/**
 * Recursively updates a component's properties in the tree.
 */
export const updateComponentInTree = (
    content: ComponentData[],
    componentId: string,
    updateFn: (comp: ComponentData) => ComponentData
): ComponentData[] => {
    return content.map(comp => {
        if (comp.id === componentId) {
            return updateFn(comp);
        }
        return { ...comp,
            ...(comp.children ? { children: updateComponentInTree(comp.children, componentId, updateFn) } : {}),
            ...(comp.versions ? { versions: comp.versions.map(v => ({ ...v, overrides: { ...v.overrides,
                ...(v.overrides.children ? { children: updateComponentInTree(v.overrides.children as ComponentData[], componentId, updateFn) } : {}) } })) } : {}) };
    });
};
