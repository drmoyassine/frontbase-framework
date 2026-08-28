/**
 * Registry Descriptor — fetch + reshape the framework component registry into
 * the shape the React property panel consumes.
 *
 * SOURCE OF TRUTH: the framework `@frontbase/builder` registry, served by the
 * framework worker (cf-full) at `GET /builder/api/registry`. That endpoint
 * returns the FLAT `globalRegistry.exportForAgent()` array — one entry per
 * component with `props` at the top level. The panel wants a keyed descriptor
 * that nests props under `editable`, so we reshape at fetch time:
 *
 *   { components: { [type]: { displayName, category, description, editable: { props: PropDefinition[] } } } }
 *
 * This mirrors the descriptor the framework embeds in its builder HTML
 * (BuilderEngine.ts → registryDescriptor). Keeping the shapes in sync means a
 * component authored in the framework registry is automatically editable in
 * the product React panel — no product-side schema duplication.
 *
 * GRACEFUL DEGRADATION: when the framework worker is unreachable (e.g. the
 * product running standalone without the worker proxy), the fetch resolves to
 * `null` and PropertiesPanel falls back to the product-local propertySchemas +
 * bespoke panels. Nothing breaks.
 */

import { useEffect, useState } from 'react';
import type { PropertyFieldConfig } from '@/components/builder/registry/propertySchemas';
import { fetchRegistry } from './builderApi';

// ---------------------------------------------------------------------------
// Framework PropDefinition (runtime mirror — arrives over HTTP as JSON, so we
// do NOT import the framework type at runtime; this structurally matches
// packages/builder/src/registry/EditableSchema.ts → PropDefinition)
// ---------------------------------------------------------------------------

export type FrameworkPropType =
    | 'text'
    | 'textarea'
    | 'number'
    | 'boolean'
    | 'select'
    | 'multiselect'
    | 'color'
    | 'date'
    | 'image'
    | 'url'
    | 'code'
    | 'richtext'
    | 'array'
    | 'object';

export interface FrameworkSelectOption {
    value: string;
    label: string;
    disabled?: boolean;
    icon?: string;
}

export interface FrameworkPropDefinition {
    name: string;
    label?: string;
    type: FrameworkPropType | string;
    default?: unknown;
    placeholder?: string;
    description?: string;
    options?: FrameworkSelectOption[];
    min?: number;
    max?: number;
    step?: number;
    required?: boolean;
    group?: string;
    readOnly?: boolean;
    hidden?: boolean;
    /** 'prop' (default) writes to component.props; 'stylesData' routes to the
     * Styling tab (root-level CSS via stylesDataToCSS) and is NOT rendered here. */
    styleTarget?: 'prop' | 'stylesData';
}

export interface ComponentDescriptor {
    displayName: string;
    category: string;
    description?: string;
    editable: { props: FrameworkPropDefinition[] };
}

export interface RegistryDescriptor {
    components: Record<string, ComponentDescriptor>;
}

// ---------------------------------------------------------------------------
// Fetch + reshape (module-scoped cache; one network call per session)
// ---------------------------------------------------------------------------

let cachedDescriptor: RegistryDescriptor | null = null;
let inflight: Promise<RegistryDescriptor | null> | null = null;

/**
 * Reshape the wire format into the panel descriptor.
 *
 * Accepts either:
 *  - the flat `exportForAgent()` array (what GET /builder/api/registry returns), or
 *  - an already-shaped `{ components: { [type]: ... } }` object (idempotent), or
 *  - `{ components: [...] }` (array-valued components, defensive).
 */
export function reshapeRegistryDescriptor(data: unknown): RegistryDescriptor | null {
    if (!data || typeof data !== 'object') return null;

    // Already shaped: { components: { Type: {...} } }
    const maybeComponents = (data as { components?: unknown }).components;
    if (maybeComponents && !Array.isArray(maybeComponents)) {
        return data as RegistryDescriptor;
    }

    // Flat array (exportForAgent) or { components: [...] }
    const list: unknown[] | null = Array.isArray(data)
        ? (data as unknown[])
        : Array.isArray(maybeComponents)
            ? (maybeComponents as unknown[])
            : null;
    if (!list) return null;

    const components: Record<string, ComponentDescriptor> = {};
    for (const raw of list) {
        const c = raw as Record<string, any>;
        if (!c || typeof c.type !== 'string') continue;
        const props: FrameworkPropDefinition[] =
            Array.isArray(c.props) ? c.props
                : Array.isArray(c.editable?.props) ? c.editable.props
                    : [];
        components[c.type] = {
            displayName: c.displayName ?? c.type,
            category: c.category ?? 'basic',
            description: c.description,
            editable: { props },
        };
    }
    return { components };
}

/**
 * Fetch the registry descriptor from the framework worker and cache it.
 * Resolves to `null` on any failure (network, non-OK, bad shape) so callers
 * can fall back without try/catch.
 *
 * The credentialed fetch itself is routed through the shared `./builderApi`
 * client (`fetchRegistry`), which centralizes `credentials: 'include'` + the
 * same-origin relative URL (and the system-edge absolute-URL fallback).
 * `fetchRegistry` already swallows network/non-2xx failures into `null`, so
 * the only reshape-time failures left are structural (bad body shape).
 */
export async function fetchRegistryDescriptor(): Promise<RegistryDescriptor | null> {
    if (cachedDescriptor) return cachedDescriptor;
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const data = await fetchRegistry();
            const reshaped = reshapeRegistryDescriptor(data);
            if (reshaped) cachedDescriptor = reshaped;
            return reshaped;
        } catch {
            return null;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

/** Synchronous read of the cached descriptor (null until fetched). */
export function getCachedRegistryDescriptor(): RegistryDescriptor | null {
    return cachedDescriptor;
}

/** Look up a single component descriptor from the cache. */
export function getDescriptorComponent(type: string): ComponentDescriptor | undefined {
    return cachedDescriptor?.components?.[type];
}

// ---------------------------------------------------------------------------
// React hook — kicks off the fetch once, returns the cached descriptor
// ---------------------------------------------------------------------------

/**
 * Returns the framework registry descriptor, fetching it on first use.
 * `null` until the fetch resolves (or if it failed) — PropertiesPanel falls
 * back to product-local schemas / bespoke panels in that case.
 */
export function useRegistryDescriptor(): RegistryDescriptor | null {
    const [descriptor, setDescriptor] = useState<RegistryDescriptor | null | undefined>(
        cachedDescriptor
    );

    useEffect(() => {
        let alive = true;
        if (cachedDescriptor) {
            setDescriptor(cachedDescriptor);
            return;
        }
        fetchRegistryDescriptor().then((d) => {
            if (alive) setDescriptor(d);
        });
        return () => {
            alive = false;
        };
    }, []);

    return descriptor ?? null;
}

// ---------------------------------------------------------------------------
// Mapper: framework PropDefinition → product PropertyFieldConfig
// ---------------------------------------------------------------------------

/**
 * Convert a framework `PropDefinition` into a product `PropertyFieldConfig`
 * the SchemaDrivenProperties engine can render.
 *
 * Returns `null` when the prop should NOT appear in the Properties panel:
 *  - `hidden` props,
 *  - `styleTarget: 'stylesData'` props (edited in the Styling tab — root CSS),
 *  - types without a clean UI primitive (`array`/`object`/`multiselect`/`date`),
 *    which need bespoke editors (e.g. Select.options, DataTable.columns).
 *
 * For `select` props with no options, returns null (nothing to choose).
 */
export function mapPropDefinitionToFieldConfig(
    prop: FrameworkPropDefinition
): PropertyFieldConfig | null {
    if (prop.hidden) return null;
    // Root-level CSS props live on the Styling tab, not the Properties panel.
    if (prop.styleTarget === 'stylesData') return null;

    const base = {
        name: prop.name,
        label: prop.label ?? prop.name,
        placeholder: prop.placeholder,
        defaultValue: prop.default,
        group: prop.group,
        description: prop.description,
    };

    switch (prop.type) {
        case 'text':
        case 'url':
            // Variable-capable text input (shows the "@ for variables" hint).
            return { ...base, type: 'text', syntaxContext: 'output' };

        case 'textarea':
            return { ...base, type: 'textarea', rows: 4 };

        case 'code':
        case 'richtext':
            // Multi-line, non-variable text (embed HTML, custom CSS fragments).
            return { ...base, type: 'textarea', rows: 6 };

        case 'number':
            return {
                ...base,
                type: 'number',
                min: prop.min,
                max: prop.max,
            };

        case 'boolean':
            return { ...base, type: 'boolean' };

        case 'select': {
            if (!prop.options || prop.options.length === 0) return null;
            return {
                ...base,
                type: 'select',
                options: prop.options.map((o) => ({ value: o.value, label: o.label })),
            };
        }

        case 'color':
            return { ...base, type: 'color' };

        case 'image':
            // URL input — no variable interpolation needed for asset URLs.
            return { ...base, type: 'input' };

        // No clean primitive yet — skip (component keeps bespoke editor or default).
        case 'multiselect':
        case 'array':
        case 'object':
        case 'date':
            return null;

        default:
            return null;
    }
}

/**
 * Map all editable props for a component into renderable field configs,
 * preserving the framework's declaration order and dropping skipped props.
 */
export function mapComponentPropsToFields(
    descriptor: ComponentDescriptor
): PropertyFieldConfig[] {
    return descriptor.editable.props
        .map(mapPropDefinitionToFieldConfig)
        .filter((f): f is PropertyFieldConfig => f !== null);
}
