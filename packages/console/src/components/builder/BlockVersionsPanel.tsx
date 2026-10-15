import React, { useState } from 'react';
import { applyBlockVersion, cloneBlockTree } from '@frontbase/edge-core/block-versions';
import type { ComponentData } from '@/types/builder';
import { useBuilderStore } from '@/stores/builder';
import { ConditionsEditor } from './ConditionsEditor';
import { ConditionValueEditor, operandFromValue } from './ConditionValueEditor';
import { getPropertySchema } from './registry/propertySchemas';

export function BlockVersionsPanel({ node }: { node: ComponentData }) {
    const selected = useBuilderStore(s => s.editingVersions?.[node.id] ?? 'default');
    const setSelected = useBuilderStore(s => s.setEditingVersion);
    const setVersions = useBuilderStore(s => s.setBlockVersions);
    const toggle = useBuilderStore(s => s.setVersionFieldOverride);
    const update = useBuilderStore(s => s.updateComponent);
    const preview = useBuilderStore(s => s.previewVersionConditions);
    const setPreview = useBuilderStore(s => s.setPreviewVersionConditions);
    const [onlyOverrides, setOnlyOverrides] = useState(false);
    const [name, setName] = useState('');
    const version = node.versions?.find(v => v.id === selected);
    const effective = applyBlockVersion(node, selected);
    const change = (patch: Partial<NonNullable<ComponentData['versions']>[number]>) => setVersions(node.id, (node.versions ?? []).map(v => v.id === selected ? { ...v, ...patch } : v));
    const fields = [...new Set([...Object.keys(node.props), ...Object.keys(version?.overrides.props ?? {}),...(node.type==='Repeater'?['binding','controls','columns','layout','gap','mobileColumns','tabletColumns','loadingText','emptyText','errorText','title','actionBindings']:[]),
        ...Object.values(getPropertySchema(node.type) ?? {}).flat().map((field: any) => field.name)])];
    const styleFields=[...new Set([...Object.keys(node.styles??{}),...Object.keys(node.stylesData?.values??{}),...Object.keys(version?.overrides.styles??{}),...Object.keys(version?.overrides.stylesData?.values??{})])];
    const move = (direction: number) => {
        const versions = [...node.versions ?? []], from = versions.findIndex(v => v.id === selected), to = from + direction;
        if (from < 0 || to < 0 || to >= versions.length) return;
        [versions[from], versions[to]] = [versions[to], versions[from]];
        setVersions(node.id, versions);
    };
    return <section aria-label="Block versions" className="mb-4 space-y-3 rounded border p-3">
        <label className="block text-sm font-medium">Version<select aria-label="Block version" className="mt-1 w-full rounded border bg-background p-2" value={version ? selected : 'default'} onChange={event => setSelected(node.id, event.target.value)}>
            <option value="default">Default</option>{node.versions?.map((v, i) => <option key={v.id} value={v.id}>{i + 1}. {v.name}</option>)}
        </select></label>
        <div className="flex gap-2"><input aria-label="New version name" className="min-w-0 flex-1 rounded border bg-background p-2 text-xs" placeholder="Version name" value={name} maxLength={120} onChange={event => setName(event.target.value)} /><button type="button" className="text-xs" disabled={!name.trim() || (node.versions?.length ?? 0) >= 32} onClick={() => {
            const id = crypto.randomUUID();
            // New alternatives always inherit Default, never the selected alternative.
            setVersions(node.id, [...node.versions ?? [], { id, name: name.trim(), overrides: {} }]); setSelected(node.id, id); setName('');
        }}>Add version</button></div>
        {!!node.versions?.length && <label className="flex gap-2 text-xs"><input type="checkbox" checked={!!preview} onChange={event => setPreview(event.target.checked)} />Preview conditions</label>}
        {version && <>
            <p className="text-xs text-muted-foreground">Inherits from Default · {Object.values(version.overrides).reduce((count, value) => count + (Array.isArray(value) ? 1 : value && typeof value === 'object' ? Object.keys(value).length : 1), 0)} overrides</p>
            <label className="block text-xs">Version name<input aria-label="Version name" className="mt-1 w-full rounded border bg-background p-2" value={version.name} maxLength={120} onChange={event => { if (event.target.value.trim()) change({ name: event.target.value }); }} /></label>
            <div className="flex gap-3 text-xs"><button type="button" disabled={node.versions?.[0]?.id === selected} onClick={() => move(-1)}>Higher priority</button><button type="button" disabled={node.versions?.at(-1)?.id === selected} onClick={() => move(1)}>Lower priority</button><button type="button" onClick={() => { setVersions(node.id, node.versions!.filter(v => v.id !== selected)); setSelected(node.id, 'default'); }}>Remove version</button></div>
            <ConditionsEditor title="Show this version when" value={version.when} onChange={when => change({ when })} />
            <label className="flex gap-2 text-xs"><input type="checkbox" aria-label="Override structure" checked={version.overrides.children !== undefined} onChange={event => {
                const overrides = { ...version.overrides };
                if (event.target.checked) overrides.children = cloneBlockTree(node.children ?? [], () => crypto.randomUUID());
                else delete overrides.children;
                change({ overrides });
            }} />Override structure</label>
            <p className="text-xs text-muted-foreground">{version.overrides.children ? 'Children are independently editable on the canvas.' : 'Children inherit from Default. Override structure before editing their layout or content.'}</p>
            <label className="flex gap-2 text-xs"><input type="checkbox" checked={onlyOverrides} onChange={event => setOnlyOverrides(event.target.checked)} />Show overridden fields only</label>
            {fields.map(field => {
                const overridden = Object.hasOwn(version.overrides.props ?? {}, field);
                if (onlyOverrides && !overridden) return null;
                return <div key={field} className="space-y-2 border-t pt-2">
                    <label className="flex items-center justify-between gap-2 text-xs"><span>{field}</span><span className="flex gap-1"><input type="checkbox" aria-label={`Override ${field}`} checked={overridden} onChange={event => toggle(node.id, 'props', field, event.target.checked)} />{overridden ? 'Override' : 'Inherited'}</span></label>
                    {field === 'binding' ? <p className="text-xs text-muted-foreground">{overridden ? 'Edit the source, table and query below.' : 'Source, table and query inherit together.'}</p> : <fieldset disabled={!overridden} className={!overridden ? 'opacity-70' : ''}><ConditionValueEditor label={field} value={operandFromValue(effective.props[field])} onChange={value => update(node.id, { [field]: value.kind === 'variable' ? `{{ ${value.path} }}` : value.value })} /></fieldset>}
                </div>;
            })}
            {!!styleFields.length&&<details><summary className="cursor-pointer text-xs font-medium">Style overrides</summary><div className="mt-2 space-y-3">{styleFields.map(field=>{
                const overridden=Object.hasOwn(version.overrides.styles??{},field)||Object.hasOwn(version.overrides.stylesData?.values??{},field);
                if(onlyOverrides&&!overridden)return null;
                return <div key={field} className="space-y-2"><label className="flex justify-between gap-2 text-xs">{field}<span><input type="checkbox" aria-label={`Override style ${field}`} checked={overridden} onChange={event=>toggle(node.id,'styles',field,event.target.checked)}/>{overridden?' Override':' Inherited'}</span></label><fieldset disabled={!overridden}><ConditionValueEditor label={`Style ${field}`} value={operandFromValue(effective.stylesData?.values?.[field]??effective.styles?.[field])} onChange={value=>{
                    const styles={...version.overrides.styles,[field]:value.kind==='variable'?`{{ ${value.path} }}`:value.value};change({overrides:{...version.overrides,styles}});
                }}/></fieldset></div>;
            })}</div></details>}
        </>}
        {!!node.versions?.length && <p className="text-xs text-muted-foreground">First matching version wins. Otherwise Default appears. Editing a version only forces the canvas preview.</p>}
    </section>;
}
