/**
 * Property panel — generated from a compiler ComponentManifest. No hand-written
 * per-component panels. Each PropertyField maps to an input control.
 */
import type { ComponentManifest, PropertyField } from '@frontbase/compiler';

/** Map a manifest PropertyField to a UI field spec (pure; testable without React). */
export interface PanelField {
    name: string;
    label: string;
    control: 'text' | 'number' | 'checkbox' | 'select' | 'textarea' | 'json';
    required: boolean;
    default?: unknown;
    options?: (string | number)[];
    description?: string;
}

export function panelFieldsFromManifest(manifest: ComponentManifest): PanelField[] {
    return manifest.properties.map(panelField);
}

function panelField(f: PropertyField): PanelField {
    const control: PanelField['control'] =
        f.kind === 'boolean' ? 'checkbox'
        : f.kind === 'number' ? 'number'
        : f.kind === 'enum' ? 'select'
        : f.kind === 'array' || f.kind === 'object' ? 'json'
        : 'text';
    return {
        name: f.name,
        label: f.description ?? f.name,
        control,
        required: f.required,
        ...(f.default !== undefined ? { default: f.default } : {}),
        ...(f.enum ? { options: f.enum } : {}),
        ...(f.description ? { description: f.description } : {}),
    };
}
