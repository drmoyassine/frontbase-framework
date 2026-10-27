import type { ComponentData } from '@/types/builder';

/**
 * Component types whose `children` form a designable template the Repeater can
 * repeat. Mirrors the container set used by DraggableComponent.
 */
const CHILD_HOSTING = ['Container', 'Row', 'Column', 'Card'] as const;

/**
 * Component types that carry a repeatable list `binding` (Grid / DataTable). Both
 * use the shared `ComponentDataBinding` shape, so "copy binding + seed a
 * template" is identical for either source.
 */
const REPEATABLE_BINDING = ['Grid', 'DataTable'] as const;

export type ConvertToRepeaterMode = 'reshape-binding' | 'wrap-template';

/** Grid/DataTable with a concrete table binding — Mode A source. */
export function hasRepeatableBinding(node: ComponentData): boolean {
    return (REPEATABLE_BINDING as readonly string[]).includes(node.type) &&
        !!node.props?.binding?.tableName;
}

/** Container/Row/Column/Card — Mode B source (a designable child template). */
export function isChildHostingContainer(node: ComponentData): boolean {
    return (CHILD_HOSTING as readonly string[]).includes(node.type);
}

/**
 * A Repeater is `binding` (a row source) + a child template rendered per row, so
 * an element qualifies if it supplies one of those halves. (The field is
 * `tableName`, not `table`.)
 */
export function canConvertToRepeater(node: ComponentData | null | undefined): node is ComponentData {
    if (!node) return false;
    return hasRepeatableBinding(node) || isChildHostingContainer(node);
}

/** Which conversion mode applies, or null if the element doesn't qualify. */
export function convertToRepeaterMode(node: ComponentData): ConvertToRepeaterMode | null {
    if (!canConvertToRepeater(node)) return null;
    return hasRepeatableBinding(node) ? 'reshape-binding' : 'wrap-template';
}
