/**
 * Proposed inquiry/application configuration contract — fixture prototype.
 *
 * Workstream D (second swarm). This module is a PROPOSAL expressed as working
 * code. It mirrors the strict data-only style of
 * packages/edge-core/src/directory/configuration.ts (version literal, bounded
 * strings, .strict() objects, validation distinct from readiness) so the
 * primary session can evaluate it for promotion into edge-core later. Nothing
 * here is wired into any package; nothing here writes production data.
 *
 * Hard rules encoded by this schema:
 * - The configuration is DATA ONLY: no credentials, no arbitrary URLs, no SQL,
 *   no executable templates. Destinations reference administrative server-side
 *   connection IDs (resolved later through existing connected-account/secret
 *   seams) — never inline endpoints or keys.
 * - The browser only ever receives `publicFormView(config)` plus a signed
 *   context token. Destinations, connection references and rate-limit settings
 *   never reach the browser.
 * - Provider/commercial IDs are administrative strings; they are never rendered
 *   publicly and never inferred from public content.
 */

import { createRequire } from 'node:module';

// Resolve the same zod copy the framework packages use (pnpm workspace).
const require = createRequire(import.meta.url);
const { z } = require('../../packages/edge-core/node_modules/zod');

const identifier = z.string().max(63).regex(/^(?:[A-Za-z_][A-Za-z0-9_]*)?$/);
const shortId = z.string().max(63).regex(/^[A-Za-z0-9_-]*$/);
const label = z.string().max(200).refine(v => !/[\x00-\x1f]/.test(v));
const text = z.string().max(600).refine(v => !/[\x00-\x1f]/.test(v));

/**
 * Best-effort refusal of credential-looking material anywhere a human types
 * free text. This is a guard rail for administrator mistakes, not a security
 * boundary: real secret handling stays in the existing server-side secret
 * storage seams.
 */
const CREDENTIAL_PATTERNS = [
    /sk_(?:live|test)_/i,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /Bearer\s+[A-Za-z0-9._-]{20,}/,
    /xox[bpars]-/,
    /ghp_[A-Za-z0-9]{30,}/,
];

function rejectsCredentialMaterial(schema) {
    return schema.refine(
        v => !CREDENTIAL_PATTERNS.some(re => re.test(v)),
        'Credential-like material is not allowed in the inquiry configuration'
    );
}

const safeLabel = rejectsCredentialMaterial(label);
const safeText = rejectsCredentialMaterial(text);

export const inquiryFieldTypes = ['text', 'email', 'phone', 'select', 'textarea', 'consent'];

export const inquiryFieldSpecSchema = z.object({
    key: identifier,
    label: safeLabel,
    type: z.enum(inquiryFieldTypes),
    required: z.boolean().default(false),
    maxLength: z.number().int().min(1).max(2000).default(500),
    placeholder: safeLabel.optional(),
    helpText: safeLabel.optional(),
    options: z.array(safeLabel).max(50).optional(),
}).strict().superRefine((field, ctx) => {
    if (field.type === 'select' && (!field.options || field.options.length < 1)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'select fields require options' });
    }
    if (field.type !== 'select' && field.options !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'options are only valid on select fields' });
    }
    if (field.type === 'consent' && !field.required) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['required'], message: 'consent fields must be required' });
    }
    if (field.type === 'consent' && field.maxLength !== 500) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxLength'], message: 'consent fields ignore maxLength' });
    }
});

/**
 * A destination names WHERE a stored lead may be delivered, by kind plus an
 * administrative connection reference. The reference is resolved server-side
 * through the existing administrator-connected-account seams; the inquiry
 * configuration never carries the endpoint URL, credentials or message
 * templates itself.
 */
export const inquiryDestinationKinds = ['lead_store', 'email_outbound', 'webhook', 'crm'];

export const inquiryDestinationSpecSchema = z.object({
    key: identifier,
    kind: z.enum(inquiryDestinationKinds),
    connectionRef: shortId,
    enabled: z.boolean().default(false),
}).strict();

export const inquiryConfigurationSchema = z.object({
    version: z.literal(1),
    formId: identifier,
    enabled: z.boolean(),
    title: safeLabel,
    intro: safeText,
    submitLabel: safeLabel,
    fields: z.array(inquiryFieldSpecSchema).min(1).max(24),
    consent: z.object({
        required: z.boolean(),
        text: safeText,
        retentionDays: z.number().int().min(1).max(3650),
    }).strict(),
    context: z.object({
        bindsInstitution: z.boolean(),
        bindsProgram: z.boolean(),
    }).strict(),
    destinations: z.array(inquiryDestinationSpecSchema).max(4),
    abuse: z.object({
        rateLimit: z.object({
            windowSeconds: z.number().int().min(10).max(3600),
            maxSubmissions: z.number().int().min(1).max(100),
        }).strict(),
        honeypotField: identifier,
    }).strict(),
}).strict().superRefine((config, ctx) => {
    const keys = new Set();
    for (const [index, field] of config.fields.entries()) {
        if (keys.has(field.key)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'key'], message: 'duplicate field key' });
        }
        keys.add(field.key);
    }
    if (config.consent.required && !config.fields.some(f => f.type === 'consent')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['consent'], message: 'consent.required needs a consent field' });
    }
    if (config.destinations.filter(d => d.kind === 'lead_store' && d.enabled).length > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destinations'], message: 'at most one enabled lead_store destination' });
    }
    if (config.context.bindsInstitution === false && config.context.bindsProgram === true) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['context'], message: 'a program context requires an institution context' });
    }
});

/**
 * Wire schema for a submission request. Values are re-validated per field.
 * The per-value bound sits ABOVE the maximum per-field bound (2000) so an
 * over-length value produces a per-field error; only genuinely oversized
 * payloads are refused here at the request-shape level.
 */
export const inquirySubmissionRequestSchema = z.object({
    formId: identifier,
    contextToken: z.string().min(1).max(4096),
    values: z.record(z.string().max(4000)),
}).strict();

const EMAIL_PATTERN = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_PATTERN = /^[0-9+()][0-9+()\-\s]{0,24}$/;

export function normalizeValue(value) {
    return value.trim().replace(/\s+/g, ' ');
}

/**
 * Per-field server-side validation. Unknown keys, over-length values,
 * non-members of select options and unchecked consent are refused here — the
 * browser is never trusted.
 */
export function validateSubmissionValues(config, rawValues) {
    const errors = {};
    const values = {};
    const allowed = new Set(config.fields.map(f => f.key));
    const honeypot = config.abuse.honeypotField;

    for (const key of Object.keys(rawValues)) {
        if (key !== honeypot && !allowed.has(key)) errors[key] = 'unknown field';
    }
    for (const field of config.fields) {
        const raw = rawValues[field.key];
        const value = raw === undefined ? '' : normalizeValue(String(raw));
        if (field.type === 'consent') {
            if (value !== 'accepted' && value !== 'on') {
                errors[field.key] = 'consent is required';
            } else {
                values[field.key] = 'accepted';
            }
            continue;
        }
        if (field.required && value === '') {
            errors[field.key] = 'this field is required';
            continue;
        }
        if (value === '') continue;
        if (value.length > field.maxLength) {
            errors[field.key] = `must be at most ${field.maxLength} characters`;
            continue;
        }
        if (field.type === 'email' && !EMAIL_PATTERN.test(value)) {
            errors[field.key] = 'enter a valid email address';
            continue;
        }
        if (field.type === 'phone' && !PHONE_PATTERN.test(value)) {
            errors[field.key] = 'enter a valid phone number';
            continue;
        }
        if (field.type === 'select' && !field.options.includes(value)) {
            errors[field.key] = 'choose one of the listed options';
            continue;
        }
        values[field.key] = value;
    }
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    return { ok: true, values };
}

/**
 * Browser-safe projection of the configuration. Destinations, connection
 * references and rate-limit settings are deliberately excluded. The consent
 * text and retention period are public by nature (they are shown to the
 * visitor).
 */
export function publicFormView(config) {
    return {
        formId: config.formId,
        enabled: config.enabled,
        title: config.title,
        intro: config.intro,
        submitLabel: config.submitLabel,
        // The honeypot field is public by design: it must exist in the HTML
        // for bots to fill it. Everything else about abuse controls is not.
        honeypotField: config.abuse.honeypotField,
        fields: config.fields.map(f => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            maxLength: f.maxLength,
            placeholder: f.placeholder ?? null,
            helpText: f.helpText ?? null,
            options: f.options ?? null,
        })),
        consent: {
            required: config.consent.required,
            text: config.consent.text,
            retentionDays: config.consent.retentionDays,
        },
    };
}

export function inquiryConfigurationIssues(value) {
    const parsed = inquiryConfigurationSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map(i => `${i.path.join('.') || 'configuration'}: ${i.message}`);
}

const emptyDestination = (key, kind, connectionRef = '') => ({ key, kind, connectionRef, enabled: false });

/** Incomplete drafts stay representable; readiness is a separate check. */
export function defaultInquiryConfiguration() {
    return inquiryConfigurationSchema.parse({
        version: 1,
        formId: 'program_inquiry',
        enabled: false,
        title: 'Request information',
        intro: 'Ask this institution a question. Fields marked * are required.',
        submitLabel: 'Send inquiry',
        fields: [
            { key: 'full_name', label: 'Full name', type: 'text', required: true, maxLength: 200 },
            { key: 'email', label: 'Email', type: 'email', required: true, maxLength: 254 },
            { key: 'phone', label: 'Phone', type: 'phone', required: false, maxLength: 25 },
            { key: 'message', label: 'Message', type: 'textarea', required: false, maxLength: 2000 },
            { key: 'consent', label: 'I agree that my details may be used to answer this inquiry', type: 'consent', required: true, maxLength: 500 },
        ],
        consent: {
            required: true,
            text: 'Your details are used only to answer this inquiry and are kept for the retention period shown.',
            retentionDays: 180,
        },
        context: { bindsInstitution: true, bindsProgram: true },
        destinations: [
            emptyDestination('store', 'lead_store'),
            emptyDestination('admissions_mail', 'email_outbound', ''),
            emptyDestination('crm', 'crm', ''),
        ],
        abuse: {
            rateLimit: { windowSeconds: 300, maxSubmissions: 5 },
            honeypotField: 'office_fax',
        },
    });
}

/** Completeness distinct from validity, mirroring directory readiness. */
export function inquiryConfigurationReadiness(value) {
    const parsed = inquiryConfigurationSchema.safeParse(value);
    if (!parsed.success) return inquiryConfigurationIssues(value);
    const c = parsed.data;
    const missing = [];
    if (!c.enabled) missing.push('enabled');
    for (const field of c.fields) {
        if (!field.label) missing.push(`fields.${field.key}.label`);
        if (field.type === 'select' && (!field.options || field.options.length === 0)) missing.push(`fields.${field.key}.options`);
    }
    if (!c.consent.text) missing.push('consent.text');
    if (!c.destinations.some(d => d.enabled)) {
        missing.push('destinations: at least one enabled destination is required');
    }
    for (const destination of c.destinations) {
        if (destination.enabled && destination.kind !== 'lead_store' && !destination.connectionRef) {
            missing.push(`destinations.${destination.key}.connectionRef`);
        }
    }
    return missing;
}
