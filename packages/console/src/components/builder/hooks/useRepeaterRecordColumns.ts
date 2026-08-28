import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useBindingColumns } from '@/hooks/data/useBindingColumns';

interface TreeNode {
    id: string;
    type: string;
    props?: Record<string, any>;
    children?: TreeNode[];
}

/**
 * Walk the component tree to find the nearest ancestor of `targetId` whose type
 * is `Repeater`. Returns null if the component is not nested inside a Repeater.
 */
function findAncestorRepeater(
    nodes: TreeNode[] | undefined,
    targetId: string,
    chain: TreeNode[] = [],
): TreeNode | null {
    for (const node of nodes ?? []) {
        if (node.id === targetId) {
            for (let i = chain.length - 1; i >= 0; i--) {
                if (chain[i].type === 'Repeater') return chain[i];
            }
            return null;
        }
        if (node.children?.length) {
            const found = findAncestorRepeater(node.children, targetId, [...chain, node]);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Derive the column list available as `{{ record.<col> }}` tokens for a given
 * component — i.e. the columns of the table bound to the nearest ancestor
 * Repeater. Used by VariableInput/VariablePicker to offer real record columns
 * (instead of a single placeholder) when authoring inside a Repeater template.
 *
 * Falls back to the currently-selected component when `componentId` is omitted.
 * Returns undefined when the component is not inside a Repeater.
 */
export function useRepeaterRecordColumns(componentId?: string): string[] | undefined {
    const { pages, currentPageId, selectedComponentId } = useBuilderStore(useShallow(s => ({
        pages: s.pages,
        currentPageId: s.currentPageId,
        selectedComponentId: s.selectedComponentId
    })));
    const { getComponentBinding } = useDataBindingStore();

    const id = componentId ?? selectedComponentId ?? undefined;
    const page = pages.find(p => p.id === currentPageId);
    const tree: TreeNode[] = page?.layoutData?.content ?? [];
    const repeater = id ? findAncestorRepeater(tree, id) : null;

    const propBinding = repeater?.props?.binding;
    const storeBinding = repeater?.id ? getComponentBinding(repeater.id) : null;
    const binding: any = propBinding ?? storeBinding;

    const tableName: string | undefined = binding?.tableName;
    const dataSourceId: string | undefined = binding?.dataSourceId;
    const columnOrder: string[] | undefined = binding?.columnOrder;

    // Hooks must be called unconditionally; returns [] when tableName is absent.
    const columns = useBindingColumns(tableName, dataSourceId);

    if (!repeater || !tableName) return undefined;
    // Honor the user's column order when set, else fall back to schema order.
    if (columnOrder && columnOrder.length > 0) return columnOrder;
    return columns.map(c => c.name);
}
