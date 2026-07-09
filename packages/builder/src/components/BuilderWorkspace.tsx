/**
 * BuilderWorkspace — the React builder shell (minimal). Canvas chrome + a
 * preview iframe that renders the draft through the SAME @frontbase/edge-core
 * engine (parity guarantee: preview HTML == published HTML) + a property panel
 * generated from a compiler manifest. React lives ONLY in this package.
 *
 * The full visual editor (drag/drop, React Flow workflow editor, layers tree)
 * is a documented follow-up; this ships the parity + draft + manifest-driven
 * panel foundation with the headline gates green.
 */
import { useState, useCallback } from 'react';
import type { ComponentManifest } from '@frontbase/compiler';
import { panelFieldsFromManifest, type PanelField } from './PropertyPanel.js';

export interface BuilderWorkspaceProps {
    /** The compiler manifest for the selected component (drives the property panel). */
    manifest: ComponentManifest;
    /** Current draft props; updated on panel change. */
    value: Record<string, unknown>;
    /** Preview URL (the engine's /preview path). */
    previewUrl: string;
    onChange: (next: Record<string, unknown>) => void;
}

export function BuilderWorkspace({ manifest, value, previewUrl, onChange }: BuilderWorkspaceProps) {
    const fields = panelFieldsFromManifest(manifest);
    const [selected, setSelected] = useState<string | null>(fields[0]?.name ?? null);

    const update = useCallback((name: string, v: unknown) => {
        onChange({ ...value, [name]: v });
    }, [value, onChange]);

    return (
        <div className="fb-builder">
            <aside className="fb-layers">
                <h3>Layers</h3>
                <ul>{fields.map((f) => (
                    <li key={f.name} className={selected === f.name ? 'selected' : ''} onClick={() => setSelected(f.name)}>{f.label}</li>
                ))}</ul>
            </aside>
            <main className="fb-canvas">
                {/* The preview renders the draft through the production engine → parity */}
                <iframe title="preview" src={previewUrl} className="fb-preview" />
            </main>
            <aside className="fb-properties">
                <h3>Properties</h3>
                {fields.map((f) => (
                    <PropertyControl key={f.name} field={f} value={value[f.name]} onChange={(v) => update(f.name, v)} />
                ))}
            </aside>
        </div>
    );
}

function PropertyControl({ field, value, onChange }: { field: PanelField; value: unknown; onChange: (v: unknown) => void }) {
    const v = value ?? field.default ?? '';
    switch (field.control) {
        case 'checkbox': return <label>{field.label}<input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(e.target.checked)} /></label>;
        case 'number': return <label>{field.label}<input type="number" value={Number(v)} onChange={(e) => onChange(Number(e.target.value))} /></label>;
        case 'select': return (
            <label>{field.label}
                <select value={String(v)} onChange={(e) => onChange(e.target.value)}>
                    {(field.options ?? []).map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
                </select>
            </label>
        );
        case 'json':
        case 'textarea': return <label>{field.label}<textarea value={typeof v === 'string' ? v : JSON.stringify(v)} onChange={(e) => onChange(e.target.value)} /></label>;
        default: return <label>{field.label}<input type="text" value={String(v)} onChange={(e) => onChange(e.target.value)} /></label>;
    }
}
