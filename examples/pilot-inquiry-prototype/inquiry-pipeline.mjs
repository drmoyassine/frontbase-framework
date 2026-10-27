/**
 * Inquiry submission pipeline — fixture prototype.
 *
 * The single submit contract shared by the HTTP fixture server and the tests.
 * Order of operations (each step fully server-side):
 *
 *   1. wire-schema parse (shape, sizes)
 *   2. rate limit (abuse control; per client + form)
 *   3. context token verification (signature, expiry, form binding)
 *   4. server-side context re-resolution (records exist and are eligible)
 *   5. honeypot check
 *   6. per-field validation against the configuration (browser never trusted)
 *   7. compare-and-insert lead (dedupe key = HMAC(secret, form|context|core
 *      values)) — retries and double clicks return the ORIGINAL receipt
 *   8. fake-transport dispatch with bounded retry; honest delivery state
 *
 * Result is a discriminated result; the HTTP layer maps it to status codes.
 */

import { createHmac } from 'node:crypto';
import {
    inquirySubmissionRequestSchema,
    validateSubmissionValues,
    normalizeValue,
} from './inquiry-schema.mjs';
import { verifyInquiryContext } from './inquiry-context.mjs';
import { dispatchLead } from './inquiry-adapters.mjs';

export function createInquiryPipeline(deps) {
    const {
        config,             // validated InquiryConfiguration
        secret,             // server-side signing/HMAC secret (fixture-local)
        store,              // fake lead store
        rateLimiter,        // { check(key) -> { allowed, retryAfterSeconds } }
        contextRecords,     // { institutions: Map, programs: Map } synthetic directory
        now = () => Math.floor(Date.now() / 1000),
        clockNow = now,
    } = deps;

    function dedupeKeyFor(payload, values) {
        // Core identity fields only: a lost-response retry of the SAME
        // submission normalizes to the same key. Everything else a visitor
        // types is stored once and never hashed into identity.
        const identity = ['full_name', 'email']
            .map(key => (values[key] ? normalizeValue(values[key]).toLowerCase() : ''));
        const context = [payload.formId, payload.institution ?? '', payload.program ?? ''];
        const canonical = [...context, ...identity].join('\u0000');
        return createHmac('sha256', secret).update(canonical).digest('hex');
    }

    /**
     * Submit one inquiry. Returns a result object; never throws for expected
     * refusals. `meta.clientKey` identifies the rate-limit bucket (IP in
     * production; a fixture value in tests).
     */
    function submit(rawRequest, meta = {}) {
        const parsed = inquirySubmissionRequestSchema.safeParse(rawRequest);
        if (!parsed.success) {
            return { status: 'validation_error', httpStatus: 400, errors: { _request: 'invalid request shape' } };
        }
        const request = parsed.data;

        if (request.formId !== config.formId) {
            return { status: 'context_invalid', httpStatus: 403, reason: 'form_mismatch' };
        }
        if (!config.enabled) {
            return { status: 'form_disabled', httpStatus: 409, reason: 'form_disabled' };
        }

        const limit = rateLimiter.check(`${meta.clientKey ?? 'unknown'}|${config.formId}`);
        if (!limit.allowed) {
            return { status: 'rate_limited', httpStatus: 429, retryAfterSeconds: limit.retryAfterSeconds };
        }

        const verified = verifyInquiryContext(secret, request.contextToken, {
            nowSeconds: now(),
            expectedFormId: config.formId,
        });
        if (!verified.ok) {
            return { status: 'context_invalid', httpStatus: 403, reason: verified.reason };
        }
        const payload = verified.payload;

        // Server-side context re-resolution: IDs in a valid token could still
        // reference records deleted or made ineligible after issue. Production
        // resolves through the owned directory datasource queries.
        if (payload.institution !== null) {
            const record = contextRecords.institutions.get(payload.institution);
            if (!record || record.active === false) {
                return { status: 'context_invalid', httpStatus: 403, reason: 'unknown_institution' };
            }
        }
        if (payload.program !== null) {
            const record = contextRecords.programs.get(payload.program);
            if (!record || record.active === false) {
                return { status: 'context_invalid', httpStatus: 403, reason: 'unknown_program' };
            }
            if (payload.institution === null || record.institutionId !== payload.institution) {
                return { status: 'context_invalid', httpStatus: 403, reason: 'context_relationship' };
            }
        }

        // Honeypot: any content means a bot filled the hidden field.
        if ((request.values[config.abuse.honeypotField] ?? '') !== '') {
            return { status: 'spam_refused', httpStatus: 400 };
        }

        const validated = validateSubmissionValues(config, request.values);
        if (!validated.ok) {
            return { status: 'validation_error', httpStatus: 400, errors: validated.errors };
        }

        store.purgeExpired(clockNow());
        const dedupeKey = dedupeKeyFor(payload, validated.values);
        const inserted = store.insertLead({
            dedupeKey,
            formId: config.formId,
            context: {
                institution: payload.institution,
                program: payload.program,
                originalPath: payload.originalPath,
            },
            values: validated.values,
            receivedAt: new Date(clockNow() * 1000).toISOString(),
            expiresAt: clockNow() + config.consent.retentionDays * 86400,
            consent: { text: config.consent.text, retentionDays: config.consent.retentionDays },
        });

        if (inserted.status === 'duplicate') {
            // Retry of an already-received submission: same receipt, no new
            // record, no re-dispatch.
            return {
                status: 'already_received',
                httpStatus: 200,
                receiptId: inserted.lead.receiptId,
                deliveryState: inserted.lead.delivery.state,
            };
        }

        const transport = deps.transport ?? null;
        let deliveryState = 'degraded';
        let deliveryError = null;
        if (transport) {
            const dispatched = dispatchLead({
                lead: inserted.lead,
                transport,
                store,
                now: clockNow,
            });
            deliveryState = dispatched.state;
            deliveryError = dispatched.lastError;
        } else {
            deliveryError = 'transport_unavailable';
            store.markDelivery(inserted.lead.leadId, { state: 'degraded', lastError: deliveryError });
        }

        return {
            status: 'stored',
            httpStatus: 202,
            receiptId: inserted.lead.receiptId,
            leadId: inserted.lead.leadId,
            deliveryState,
            deliveryError,
        };
    }

    /** Delivery retry sweep (fixture stands in for the production sweep). */
    function retryPendingDeliveries() {
        const results = [];
        store.purgeExpired(clockNow());
        for (const lead of store.listPending()) {
            const dispatched = dispatchLead({
                lead,
                transport: deps.transport,
                store,
                now: clockNow,
            });
            results.push({ leadId: lead.leadId, state: dispatched.state, lastError: dispatched.lastError });
        }
        return results;
    }

    return { submit, retryPendingDeliveries };
}
