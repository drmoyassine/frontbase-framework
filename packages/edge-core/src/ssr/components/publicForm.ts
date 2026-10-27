import { publicFormDraftSchema } from '../../forms/public-form.js';
import { escapeHtml } from './lib/utils.js';

/** Authoring preview stays inert. Future admission must supply trusted server context. */
export function renderPublicFormDraft(id: string, value: unknown): string {
    const result = publicFormDraftSchema.safeParse(value);
    if (!result.success) return '<div role="status">Application form configuration needs review.</div>';
    const form = result.data;
    const fields = form.fields.map((field, index) => {
        const inputId = `${id}-field-${index}`;
        const attrs = `id="${escapeHtml(inputId)}" name="${escapeHtml(field.name)}"${field.required ? ' required' : ''} disabled`;
        const label = escapeHtml(field.label) + (field.required ? ' <span aria-hidden="true">*</span>' : '');
        const cls = 'w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-foreground';
        if (field.type === 'consent') return `<label class="flex items-start gap-2" for="${escapeHtml(inputId)}"><input type="checkbox" ${attrs}> <span>${label}</span></label>`;
        const input = field.type === 'textarea'
            ? `<textarea ${attrs} rows="4" maxlength="2000" class="${cls}"></textarea>`
            : `<input ${attrs} type="${field.type}" maxlength="254" class="${cls}">`;
        return `<div class="space-y-2 min-w-0"><label for="${escapeHtml(inputId)}" class="block text-sm font-medium">${label}</label>${input}</div>`;
    }).join('');
    // Deliberately no <form>, action, hydration marker or enabled submit: draft
    // authoring must never send applicant data in an accidental GET/navigation.
    return `<section id="${escapeHtml(id)}" class="w-full min-w-0 rounded-lg border bg-card text-card-foreground p-6 space-y-4" data-fb-public-form-draft="1">
        <h2 class="text-xl font-semibold">${escapeHtml(form.title)}</h2>
        <p role="status" class="text-sm text-muted-foreground">Preview only. Applications are not being collected.</p>
        <fieldset disabled aria-label="${escapeHtml(form.title)}" class="space-y-4 min-w-0">${fields}</fieldset>
        <button type="button" disabled class="rounded-md bg-primary px-4 py-2 text-primary-foreground opacity-50">${escapeHtml(form.submitLabel)}</button>
    </section>`;
}
