import { publicFormDraftSchema, localizedPublicForm, formDisplayText } from '../../forms/public-form.js';
import { escapeHtml } from './lib/utils.js';

/** The shared preview stays inert unless the published host supplies its sealed ticket. */
export function renderPublicFormDraft(id: string, value: unknown, ticket?: string, copy: Record<string,unknown> = {}): string {
    const result = publicFormDraftSchema.safeParse(value);
    if (!result.success) return '<div role="status">Application form configuration needs review.</div>';
    const form = localizedPublicForm(result.data,copy);
    const live = Boolean(form.submission && ticket);
    const fields = form.fields.map((field, index) => {
        const inputId = `${id}-field-${index}`;
        const attrs = `id="${escapeHtml(inputId)}" name="${escapeHtml(field.name)}"${field.required ? ' required' : ''}${live ? '' : ' disabled'}`;
        const label = field.label + (field.required ? ' <span aria-hidden="true">*</span>' : '');
        const cls = 'w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-foreground';
        if (field.type === 'consent') return `<label class="flex items-start gap-2" for="${escapeHtml(inputId)}"><input type="checkbox" ${attrs}> <span>${label}</span></label>`;
        const input = field.choices
            ? `<select ${attrs} class="${cls}"><option value=""></option>${field.choices.map((choice,i) => `<option value="${escapeHtml(choice)}">${escapeHtml(formDisplayText(copy,'formChoice_' + field.name + '_' + i,choice))}</option>`).join('')}</select>`
            : field.type === 'textarea'
            ? `<textarea ${attrs} rows="4" maxlength="2000" class="${cls}"></textarea>`
            : `<input ${attrs} type="${field.type}" maxlength="254" class="${cls}">`;
        return `<div class="space-y-2 min-w-0"><label for="${escapeHtml(inputId)}" class="block text-sm font-medium">${label}</label>${input}</div>`;
    }).join('');
    if (live) return `<form id="${escapeHtml(id)}" method="post" action="/api/public/inquiries" aria-labelledby="${escapeHtml(id)}-title" class="w-full min-w-0 rounded-lg border bg-card p-6 space-y-4">
        <h2 id="${escapeHtml(id)}-title" class="text-xl font-semibold">${escapeHtml(form.title)}</h2>
        <input type="hidden" name="_ticket" value="${escapeHtml(ticket!)}">
        ${fields}
        <button type="submit" class="rounded-md bg-primary px-4 py-2 text-primary-foreground">${escapeHtml(form.submitLabel)}</button>
    </form>`;
    // Deliberately no <form>, action, hydration marker or enabled submit: draft
    // authoring must never send applicant data in an accidental GET/navigation.
    return `<section id="${escapeHtml(id)}" class="w-full min-w-0 rounded-lg border bg-card text-card-foreground p-6 space-y-4" data-fb-public-form-draft="1">
        <h2 class="text-xl font-semibold">${escapeHtml(form.title)}</h2>
        <p role="status" class="text-sm text-muted-foreground">${form.submission ? 'Inquiry submission is unavailable in this view.' : 'Preview only. Applications are not being collected.'}</p>
        <fieldset disabled aria-label="${escapeHtml(form.title)}" class="space-y-4 min-w-0">${fields}</fieldset>
        <button type="button" disabled class="rounded-md bg-primary px-4 py-2 text-primary-foreground opacity-50">${escapeHtml(form.submitLabel)}</button>
    </section>`;
}
