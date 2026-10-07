/**
 * Inquiry form page — fixture prototype.
 *
 * Page frame, headings, context panel, status alerts, labels and the submit
 * button render through the EXISTING engine (renderPage / renderDocument /
 * renderStaticComponent / renderInteractiveComponent from @frontbase/edge-core
 * dist). The functional input markup is fixture-owned and deliberately so:
 * the engine's SSR Input/Textarea/Select renderers are read-only builder
 * previews (readonly attributes, closed combobox) and the only functional
 * server-rendered input path today is the auth-specific AuthForm. Adding a
 * functional public form-input primitive is an engine decision that belongs to
 * the primary session; this prototype must not modify the engine.
 */

import { renderPage, renderDocument } from '../../packages/edge-core/dist/index.js';
import { FALLBACK_CSS } from '../../packages/edge-core/dist/ssr/baseStyles.js';
import { renderStaticComponent } from '../../packages/edge-core/dist/ssr/components/static.js';
import { renderInteractiveComponent } from '../../packages/edge-core/dist/ssr/components/interactive.js';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const FIELD_STYLE = 'display:block;width:100%;box-sizing:border-box;height:2.5rem;padding:0 0.75rem;'
    + 'border:1px solid hsl(var(--input));border-radius:var(--radius,0.5rem);font-size:0.875rem;'
    + 'background:hsl(var(--background));color:hsl(var(--foreground));margin-bottom:1rem';
const TEXTAREA_STYLE = 'display:block;width:100%;box-sizing:border-box;min-height:6rem;padding:0.5rem 0.75rem;'
    + 'border:1px solid hsl(var(--input));border-radius:var(--radius,0.5rem);font-size:0.875rem;'
    + 'background:hsl(var(--background));color:hsl(var(--foreground));resize:vertical;margin-bottom:1rem';

function fieldMarkup(field, submitted) {
    const id = `inq_${field.key}`;
    const value = submitted[field.key] ?? '';
    const requiredAttr = field.required ? ' required' : '';
    const labelNode = renderStaticComponent('Label', `lbl_${field.key}`, {
        content: field.label,
        for: id,
        required: field.required,
    }, '');
    let control;
    switch (field.type) {
        case 'textarea':
            control = `<textarea id="${id}" name="${escapeHtml(field.key)}" rows="4" style="${TEXTAREA_STYLE}"${requiredAttr}>${escapeHtml(value)}</textarea>`;
            break;
        case 'select':
            control = `<select id="${id}" name="${escapeHtml(field.key)}" style="${FIELD_STYLE}"${requiredAttr}>`
                + `<option value="">Please choose</option>`
                + field.options.map(o => `<option value="${escapeHtml(o)}"${o === value ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')
                + `</select>`;
            break;
        case 'consent':
            control = `<input id="${id}" type="checkbox" name="${escapeHtml(field.key)}" value="accepted" style="width:1rem;height:1rem;margin-bottom:1rem"${value === 'accepted' ? ' checked' : ''}${requiredAttr} />`;
            break;
        default:
            control = `<input id="${id}" type="${field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}" name="${escapeHtml(field.key)}" maxlength="${field.maxLength}" value="${escapeHtml(value)}" style="${FIELD_STYLE}"${requiredAttr} />`;
    }
    const help = field.helpText ? `<p style="font-size:0.75rem;color:hsl(var(--muted-foreground));margin:-0.75rem 0 1rem">${escapeHtml(field.helpText)}</p>` : '';
    const error = submitted[`__error_${field.key}`]
        ? `<p role="alert" style="font-size:0.75rem;color:hsl(var(--destructive));margin:-0.75rem 0 1rem">${escapeHtml(submitted[`__error_${field.key}`])}</p>`
        : '';
    return `${labelNode}${control}${help}${error}`;
}

/**
 * Build the inquiry form page. Returns a full HTML document string.
 * `status` may carry {kind:'success', receiptId, deliveryState} or
 * {kind:'error', errors} for re-render with preserved values.
 */
export async function buildInquiryFormPage({ view, token, contextLabels, status, submittedValues = {} }) {
    const contextParts = [];
    if (contextLabels.institution) contextParts.push(`Institution: ${contextLabels.institution}`);
    if (contextLabels.program) contextParts.push(`Program: ${contextLabels.program}`);
    if (contextLabels.originalPath) contextParts.push(`Page: ${contextLabels.originalPath}`);

    let statusNode = '';
    if (status?.kind === 'success') {
        const deliveryCopy = status.deliveryState === 'delivered'
            ? 'Your inquiry has been received and delivered.'
            : status.deliveryState === 'pending_retry' || status.deliveryState === 'pending'
                ? 'Your inquiry has been received; delivery to the destination is delayed and will retry automatically.'
                : 'Your inquiry has been received; automatic delivery could not complete it. The administrator can see your inquiry.';
        statusNode = renderStaticComponent('Alert', 'inq_status_success', {
            variant: 'success',
            title: 'Inquiry received',
            message: `${deliveryCopy} Reference: ${status.receiptId}. Keep this reference to check the status.`,
        }, '');
    } else if (status?.kind === 'already_received') {
        statusNode = renderStaticComponent('Alert', 'inq_status_dup', {
            variant: 'info',
            title: 'Already received',
            message: `We already have this inquiry. Reference: ${status.receiptId}. No duplicate was created.`,
        }, '');
    } else if (status?.kind === 'error') {
        statusNode = renderStaticComponent('Alert', 'inq_status_error', {
            variant: 'destructive',
            title: status.title ?? 'The inquiry could not be sent',
            message: status.message ?? 'Please correct the highlighted fields and try again.',
        }, '');
    }

    const layoutData = {
        root: { styles: { padding: '24px', background: 'hsl(var(--background))' } },
        content: [
            {
                id: 'inq_head', type: 'Heading',
                props: { text: view.title, level: 1 },
                styles: { fontSize: '1.75rem', fontWeight: '700', marginBottom: '8px' },
            },
            {
                id: 'inq_intro', type: 'Paragraph',
                props: { text: view.intro },
                styles: { color: 'hsl(var(--muted-foreground))', marginBottom: '16px' },
            },
            ...(contextParts.length ? [{
                id: 'inq_context', type: 'Container',
                props: {},
                styles: {
                    padding: '16px', marginBottom: '16px', borderRadius: '0.5rem',
                    border: '1px solid hsl(var(--border))', background: 'hsl(var(--muted))',
                },
                children: [{
                    id: 'inq_context_text', type: 'Paragraph',
                    props: { text: contextParts.join(' · ') },
                    styles: { fontSize: '0.875rem' },
                }],
            }] : []),
        ],
    };

    const frameHtml = await renderPage(layoutData, minimalContext());

    // Functional form — fixture-owned input markup (see file header), engine
    // Label/Alert/Button nodes.
    const fieldsHtml = view.fields.map(f => fieldMarkup(f, submittedValues)).join('');
    const honeypot = `
  <div aria-hidden="true" style="position:absolute;left:-9999px;height:0;overflow:hidden">
    <label for="inq_hp_field">Leave this field empty</label>
    <input id="inq_hp_field" type="text" name="${escapeHtml(view.honeypotField)}" tabindex="-1" autocomplete="off" />
  </div>`;
    const consentNote = `<p style="font-size:0.75rem;color:hsl(var(--muted-foreground));margin:0 0 16px">${escapeHtml(view.consent.text)} Retention: ${view.consent.retentionDays} days.</p>`;
    const submitNode = renderInteractiveComponent('Button', 'inq_submit', {
        label: view.submitLabel,
        variant: 'primary',
        size: 'lg',
    }, '');
    const formHtml = `<form method="POST" action="/inquiry/submit" style="max-width:560px">${honeypot}${fieldsHtml}${consentNote}<input type="hidden" name="formId" value="${escapeHtml(view.formId)}" /><input type="hidden" name="contextToken" value="${escapeHtml(token)}" />${submitNode}</form>`;

    const page = { title: view.title, slug: 'inquiry', description: view.intro };
    return renderDocument(page, `${frameHtml}${statusNode ? `<div style="max-width:560px;margin:16px auto">${statusNode}</div>` : ''}${formHtml}`, {
        environment: 'edge',
        registerServiceWorker: false,
        language: 'en',
        cssBundle: FALLBACK_CSS,
    });
}

/** Minimal TemplateContext stand-in for renderPage (no Liquid in these nodes). */
function minimalContext() {
    const now = new Date();
    const iso = now.toISOString();
    return {
        page: {
            id: 'fixture-inquiry', title: 'Inquiry', url: '/inquiry/apply', slug: 'inquiry',
            description: '', published: true, createdAt: iso, updatedAt: iso,
            image: '', type: 'page', custom: {},
        },
        user: null,
        visitor: {},
        url: { path: '/inquiry/apply', host: '127.0.0.1:4394', protocol: 'http', query: {} },
        system: {
            date: iso.slice(0, 10), time: iso.slice(11, 19), datetime: iso,
            timestamp: now.getTime(), year: now.getUTCFullYear(),
            month: now.getUTCMonth() + 1, day: now.getUTCDate(), env: 'fixture',
        },
        local: {}, session: {},
    };
}

/** Result page shown after a POST (status page per the safe-state contract). */
export async function buildInquiryResultPage({ view, result }) {
    const kind = result.status === 'stored' ? 'success'
        : result.status === 'already_received' ? 'already_received'
            : 'error';
    return buildInquiryFormPage({
        view,
        token: '',
        contextLabels: {},
        status: {
            kind,
            receiptId: result.receiptId,
            deliveryState: result.deliveryState,
            title: result.status === 'rate_limited' ? 'Too many attempts'
                : result.status === 'context_invalid' ? 'This inquiry link is no longer valid'
                    : result.status === 'spam_refused' ? 'The inquiry could not be accepted'
                        : undefined,
            message: result.status === 'rate_limited'
                ? `Too many inquiries from this connection. Try again in about ${Math.ceil((result.retryAfterSeconds ?? 60) / 60)} minute(s).`
                : result.status === 'context_invalid'
                    ? 'Open the inquiry form again from the program or institution page to get a fresh link.'
                    : undefined,
        },
        submittedValues: kind === 'error' ? (result._resubmitValues ?? {}) : {},
    });
}
