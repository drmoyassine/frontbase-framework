import { v4 as uuidv4 } from 'uuid';
import type { ComponentData } from '@/types/builder';
import { useBuilderStore } from '@/stores/builder';
import { canConvertToRepeater, convertToRepeaterMode } from './canConvertToRepeater';

function newId(): string {
    return uuidv4();
}

function prettify(col: string): string {
    return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function displayName(binding: any, col: string): string {
    return binding?.columnOverrides?.[col]?.displayName || prettify(col);
}

/** Visible columns in panel order (columnOrder, falling back to empty). */
function visibleColumns(binding: any): string[] {
    const order: string[] = binding?.columnOrder ?? [];
    return order.filter(col => binding?.columnOverrides?.[col]?.visible !== false);
}

/**
 * Mode A — generate a default child template from the source's columns:
 * cover → Image banner, first text column → Heading, the rest → labeled Texts.
 * Wrapped in a Card so each row renders as a card.
 */
function seedTemplate(binding: any): ComponentData[] {
    const cols = visibleColumns(binding);
    if (cols.length === 0) return []; // nothing to seed — user designs from scratch

    const coverCol = cols.find(c => binding?.columnOverrides?.[c]?.displayType === 'cover');
    const textCols = cols.filter(c => c !== coverCol);
    const firstText = textCols[0];
    const rest = textCols.slice(1);

    const inner: ComponentData[] = [];
    if (coverCol) {
        inner.push({
            id: newId(),
            type: 'Image',
            props: { src: `{{record.${coverCol}}}`, alt: '', width: '100%', height: '128px' },
        });
    }
    if (firstText) {
        inner.push({
            id: newId(),
            type: 'Heading',
            props: { text: `{{record.${firstText}}}`, level: '3' },
        });
    }
    for (const col of rest) {
        inner.push({
            id: newId(),
            type: 'Text',
            props: { text: `${displayName(binding, col)}: {{record.${col}}}`, size: 'sm' },
        });
    }

    return [{ id: newId(), type: 'Card', props: {}, children: inner }];
}

/**
 * Build a Repeater component node from a qualifying source component.
 *
 *  - Mode A (Grid/DataTable): keep the binding, generate a seeded template.
 *  - Mode B (Container/Row/Column/Card): wrap the source verbatim as the
 *    template; binding is null (the user picks a data source afterwards, then
 *    writes the `{{ record.<col> }}` tokens themselves — no auto-bind).
 */
export function buildRepeaterFrom(source: ComponentData): ComponentData {
    if (!canConvertToRepeater(source)) {
        throw new Error('Component cannot be converted to a Repeater');
    }
    const mode = convertToRepeaterMode(source)!;

    const props: Record<string, any> = {
        binding: mode === 'reshape-binding' ? { ...source.props?.binding } : null,
        layout: 'grid',
        columns: source.props?.columns || 3,
    };

    const children: ComponentData[] =
        mode === 'reshape-binding'
            ? seedTemplate(source.props?.binding)
            : [{ ...source, id: newId() }]; // verbatim template, fresh id

    return { id: newId(), type: 'Repeater', props, children };
}

/**
 * Convert/wrap the given component into a Repeater in-place, select the new
 * Repeater, and return its id. For Mode B, selecting it surfaces the data-source
 * picker in the properties panel.
 */
export function applyConvertToRepeater(source: ComponentData): string {
    const repeater = buildRepeaterFrom(source);
    const store = useBuilderStore.getState();
    store.replaceComponent(source.id, repeater);
    store.setSelectedComponentId(repeater.id);
    return repeater.id;
}
