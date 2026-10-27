import { z } from 'zod';

/** Editable presentation only. No endpoint, credential, record or submission authority. */
export const publicFormDraftSchema = z.object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(160),
    submitLabel: z.string().trim().min(1).max(80),
    fields: z.array(z.object({
        name: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
        label: z.string().trim().min(1).max(160),
        type: z.enum(['text', 'email', 'tel', 'textarea', 'consent']),
        required: z.boolean(),
    }).strict()).min(1).max(24),
}).strict().superRefine((form, ctx) => {
    if (new Set(form.fields.map(field => field.name)).size !== form.fields.length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Field names must be unique', path: ['fields'] });
});
export type PublicFormDraft = z.infer<typeof publicFormDraftSchema>;

export function createPublicFormDraft(): PublicFormDraft {
    return { version: 1, title: 'Request guidance', submitLabel: 'Request guidance', fields: [
        { name: 'name', label: 'Your name', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Phone / WhatsApp', type: 'tel', required: false },
        { name: 'intake', label: 'Preferred intake', type: 'text', required: false },
        { name: 'message', label: 'How can we help?', type: 'textarea', required: false },
    ] };
}
