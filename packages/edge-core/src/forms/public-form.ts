import { z } from 'zod';

/** Authored form settings. Only the serving host can enable a public submission. */
export const publicFormDraftSchema = z.object({
    version: z.literal(1),
    submission: z.object({
        kind: z.literal('inquiry'),
        receiptMessage: z.string().trim().min(1).max(300).optional(),
        workflow: z.object({ id: z.string().uuid(), versionId: z.string().uuid() }).strict().optional(),
    }).strict().optional(),
    title: z.string().trim().min(1).max(160),
    submitLabel: z.string().trim().min(1).max(80),
    fields: z.array(z.object({
        name: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
        label: z.string().trim().min(1).max(160),
        type: z.enum(['text', 'email', 'tel', 'textarea', 'consent']),
        required: z.boolean(),
        choices: z.array(z.string().trim().min(1).max(80)).min(1).max(16).optional(),
    }).strict()).min(1).max(24),
}).strict().superRefine((form, ctx) => {
    for (const [index, field] of form.fields.entries()) {
        if (field.choices && (field.type !== 'text' || new Set(field.choices).size !== field.choices.length))
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choices require unique text options', path: ['fields', index, 'choices'] });
    }
    if (new Set(form.fields.map(field => field.name)).size !== form.fields.length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Field names must be unique', path: ['fields'] });
});
export type PublicFormDraft = z.infer<typeof publicFormDraftSchema>;

export function createInquiryForm(): PublicFormDraft {
    return {
        version: 1, title: 'Submit an inquiry', submitLabel: 'Submit inquiry', submission: { kind: 'inquiry' },
        fields: [
            { name: 'first_name', label: 'First name', type: 'text', required: true },
            { name: 'last_name', label: 'Last name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'phone', label: 'Phone number', type: 'tel', required: false },
            { name: 'contact_method', label: 'Preferred contact method', type: 'text', choices: ['Email', 'WhatsApp'], required: false },
            { name: 'message', label: 'How can we help?', type: 'textarea', required: true },
            { name: 'consent', label: 'I agree to be contacted about this inquiry.', type: 'consent', required: true },
        ],
    };
}

export function readInquiryFields(form: PublicFormDraft, entries: URLSearchParams): Record<string, string | boolean> | null {
    const values: Record<string, string | boolean> = Object.create(null);
    if ([...entries.keys()].some(name => !form.fields.some(field => field.name === name))) return null;
    for (const field of form.fields) {
        const submitted = entries.getAll(field.name);
        if (submitted.length > 1) return null;
        const value = submitted[0]?.trim() ?? '';
        if (field.required && !value || value.length > (field.type === 'textarea' ? 2000 : 254)) return null;
        if (field.type === 'consent') {
            if (value && value !== 'on') return null;
            values[field.name] = value === 'on';
        } else {
            if (value && field.type === 'email' && !z.string().email().safeParse(value).success) return null;
            if (value && field.choices && !field.choices.includes(value)) return null;
            values[field.name] = value;
        }
    }
    return values;
}

export function createPublicFormDraft(): PublicFormDraft {
    return { version: 1, title: 'Request guidance', submitLabel: 'Request guidance', fields: [
        { name: 'name', label: 'Your name', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Phone / WhatsApp', type: 'tel', required: false },
        { name: 'intake', label: 'Preferred intake', type: 'text', required: false },
        { name: 'message', label: 'How can we help?', type: 'textarea', required: false },
    ] };
}
