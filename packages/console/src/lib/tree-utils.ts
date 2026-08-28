import { ComponentData } from '@/stores/builder';

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
        if (item.children) {
            result.push({ ...item, children: removeComponentFromTree(item.children, id) });
        } else {
            result.push(item);
        }
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
    index: number
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
            const newChildren = item.children ? [...item.children] : [];
            if (index === -1) {
                newChildren.push(comp);
            } else {
                newChildren.splice(index, 0, comp);
            }
            return { ...item, children: newChildren };
        }
        if (item.children) {
            return { ...item, children: insertComponentIntoTree(item.children, targetId, comp, index) };
        }
        return item;
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
        if (comp.children) {
            return { ...comp, children: updateComponentInTree(comp.children, componentId, updateFn) };
        }
        return comp;
    });
};
