import { createPublicFormDraft, publicFormDraftSchema, type PublicFormDraft } from '@frontbase/edge-core';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import React, { useEffect, useState } from 'react';

export function PublicFormDraftProperties({ value, onChange: publish }: { value: unknown; onChange: (value: PublicFormDraft) => void }) {
    const parsed = publicFormDraftSchema.safeParse(value);
    const [form, setForm] = useState<PublicFormDraft | null>(() => parsed.success ? parsed.data : null);
    useEffect(() => { const current = publicFormDraftSchema.safeParse(value); if (current.success) setForm(current.data); }, [value]);
    const onChange = (next: PublicFormDraft) => { setForm(next); publish(next); };
    if (!form) return <div className="space-y-3"><p>Form configuration needs review. Existing values have been preserved.</p><Button onClick={() => onChange(createPublicFormDraft())}>Replace with draft defaults</Button></div>;
    const field = (index: number, patch: Partial<PublicFormDraft['fields'][number]>) => onChange({ ...form, fields: form.fields.map((value, i) => i === index ? { ...value, ...patch } : value) });
    return <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Draft presentation only. Submission and delivery are not enabled.</p>
        {!parsed.success && <p role="status">Complete all labels before previewing this form.</p>}
        <Label htmlFor="public-form-title">Form title</Label>
        <Input id="public-form-title" value={form.title} maxLength={160} onChange={event => onChange({ ...form, title: event.target.value })} />
        <Label htmlFor="public-form-submit">Button label</Label>
        <Input id="public-form-submit" value={form.submitLabel} maxLength={80} onChange={event => onChange({ ...form, submitLabel: event.target.value })} />
        {form.fields.map((value, index) => <div key={index} className="rounded border p-3 space-y-3">
            <Label htmlFor={`public-field-label-${index}`}>Field {index + 1} label</Label>
            <Input id={`public-field-label-${index}`} value={value.label} maxLength={160} onChange={event => field(index, { label: event.target.value })} />
            <Label htmlFor={`public-field-type-${index}`}>Field type</Label>
            <select id={`public-field-type-${index}`} className="w-full rounded border bg-background p-2" value={value.type} onChange={event => field(index, { type: event.target.value as typeof value.type })}>
                <option value="text">Text</option><option value="email">Email</option><option value="tel">Phone</option><option value="textarea">Long text</option><option value="consent">Consent checkbox</option>
            </select>
            <div className="flex items-center justify-between"><Label htmlFor={`public-field-required-${index}`}>Required</Label><Switch id={`public-field-required-${index}`} checked={value.required} onCheckedChange={required => field(index, { required })} /></div>
            <Button variant="outline" size="sm" disabled={form.fields.length === 1} onClick={() => onChange({ ...form, fields: form.fields.filter((_, i) => i !== index) })}>Remove field {index + 1}</Button>
        </div>)}
        <Button variant="outline" disabled={form.fields.length >= 24} onClick={() => {
            let n = 1; while (form.fields.some(field => field.name === `field_${n}`)) n++;
            onChange({ ...form, fields: [...form.fields, { name: `field_${n}`, label: 'New field', type: 'text', required: false }] });
        }}>Add field</Button>
    </div>;
}
