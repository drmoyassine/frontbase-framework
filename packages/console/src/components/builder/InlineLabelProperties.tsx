import { useEffect, useRef, useState } from 'react';
import { inlineTemplateSchema, inlineVariableAllowed, mountInlineComposer, type DetailBindingRole, type InlineTemplate, type ListCount } from '@frontbase/edge-core';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { mountInlineVariablePicker } from './mountInlineVariablePicker';
import { useVariables } from '@/hooks/useVariables';

export function InlineLabelProperties({ parts, pageId, scope, preserveTranslationSlots, save }: {
    parts: InlineTemplate; pageId?: string; scope?: { fields: string[]; queries: ListCount[]; detailRole?: DetailBindingRole };
    preserveTranslationSlots: boolean; save(parts: InlineTemplate): void;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(parts);
    const editor = useRef<HTMLDivElement>(null);
    const controls = useRef<HTMLDivElement>(null);
    const initial = useRef({ parts, scope });
    const queryClient = useQueryClient();
    const {detailColumns}=useVariables(pageId);
    const selected=scope?.detailRole?detailColumns?.[scope.detailRole]:undefined;
    const availableScope=scope&&selected ? {...scope,fields:selected.map(column=>'columns.'+column)} : scope;
    useEffect(() => {
        if (!open || !editor.current || !controls.current) return;
        const fields = initial.current.scope?.fields ?? [];
        const lists = initial.current.scope?.queries;
        return mountInlineComposer({ editor: editor.current, controls: controls.current, parts: initial.current.parts, preserveTranslationSlots, onChange: setDraft,
            openVariablePicker: request => mountInlineVariablePicker(request, { pageId, queryClient, recordColumns: fields,
                acceptVariable: path => inlineVariableAllowed(path, fields, lists) }) });
    }, [open,pageId,preserveTranslationSlots,queryClient]);
    const valid = inlineTemplateSchema.safeParse(draft).success;
    return <section className="space-y-2 rounded border p-3" aria-label="Inline label bindings">
        {open ? <>
            <div ref={editor} className="min-h-8 whitespace-pre-wrap rounded border p-2 [&_[data-fb-binding-chip]]:cursor-pointer [&_[data-fb-binding-chip]]:rounded [&_[data-fb-binding-chip]]:bg-blue-100 [&_[data-fb-binding-chip]]:px-1 [&_[data-fb-binding-chip]]:text-blue-900" />
            <div ref={controls} className="flex flex-wrap gap-2 [&_button]:rounded [&_button]:border [&_button]:px-2 [&_button]:py-1" />
            <div className="flex gap-2">
                <Button size="sm" disabled={!valid||JSON.stringify(draft)===JSON.stringify(initial.current.parts)} onClick={()=>{save(draft);setOpen(false);}}>Apply to layout draft</Button>
                <Button size="sm" variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button>
            </div>
            {!valid&&<p role="alert">Use up to 32 text and variable parts. Choose variables through the picker.</p>}
        </> : <Button size="sm" variant="outline" onClick={()=>{initial.current={parts,scope:availableScope};setDraft(parts);setOpen(true);}}>Edit binding</Button>}
    </section>;
}
