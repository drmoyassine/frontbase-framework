/**
 * Signed inquiry context tokens — fixture prototype.
 *
 * The browser never composes inquiry context (institution/program IDs, paths).
 * The server issues an HMAC-SHA256-signed token when it renders a page that
 * carries an inquiry form; the form echoes the token back verbatim; the server
 * verifies signature, expiry and form binding before anything else happens.
 * Tampered, expired or foreign-form tokens are refused with a safe, uniform
 * error.
 *
 * The signing secret is server-side only (in production it belongs in the
 * existing secret storage seams). Tokens carry ONLY safe public identifiers:
 * bounded record IDs and a local original path — never arbitrary URLs,
 * prices, free text or internal provider IDs.
 */

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,63}$/;

function base64url(value) {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64url(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

/** Deterministic canonical JSON so signatures never depend on key order. */
function canonicalJson(payload) {
    const canonicalize = (value) => {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(canonicalize);
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
    };
    return JSON.stringify(canonicalize(payload));
}

function sign(secret, canonical) {
    return createHmac('sha256', secret).update(canonical).digest('base64url');
}

/**
 * Validate the context fields that may be embedded. `records` is the
 * fixture's synthetic directory; production resolves the same IDs through the
 * owned directory datasource queries, never from browser input.
 */
function assertSafeContext({ formId, institution = null, program = null, originalPath = null }, records) {
    if (!ID_PATTERN.test(formId)) throw new Error('invalid_form_id');
    if (institution !== null) {
        if (!ID_PATTERN.test(institution)) throw new Error('invalid_institution_id');
        if (records && !records.institutions.has(institution)) throw new Error('unknown_institution');
    }
    if (program !== null) {
        if (!ID_PATTERN.test(program)) throw new Error('invalid_program_id');
        if (records && !records.programs.has(program)) throw new Error('unknown_program');
    }
    if (originalPath !== null) {
        if (typeof originalPath !== 'string' || originalPath.length > 400
            || !originalPath.startsWith('/') || originalPath.startsWith('//')
            || /[\\?#{}%\s]/.test(originalPath)
            || originalPath.split('/').some(p => p === '.' || p === '..')) {
            throw new Error('invalid_original_path');
        }
    }
}

/**
 * Issue a context token. Returns { token, payload }. `nowSeconds` defaults to
 * wall-clock time; tests inject a fixed clock.
 */
export function issueInquiryContext(secret, request, options = {}) {
    const { formId, institution = null, program = null, originalPath = null } = request;
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const expiresInSeconds = options.expiresInSeconds ?? 3600;
    assertSafeContext({ formId, institution, program, originalPath }, options.records ?? null);
    const payload = {
        v: 1,
        formId,
        institution,
        program,
        originalPath,
        iat: now,
        exp: now + expiresInSeconds,
        jti: randomUUID(),
    };
    const canonical = canonicalJson(payload);
    const token = `${base64url(canonical)}.${sign(secret, canonical)}`;
    return { token, payload };
}

/**
 * Verify a context token. Returns { ok: true, payload } or
 * { ok: false, reason } with one of: 'malformed', 'tampered', 'expired',
 * 'form_mismatch'.
 */
export function verifyInquiryContext(secret, token, options = {}) {
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (typeof token !== 'string' || token.length > 4096) return { ok: false, reason: 'malformed' };
    const dot = token.indexOf('.');
    if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' };
    const encodedPayload = token.slice(0, dot);
    const givenSignature = token.slice(dot + 1);
    let payload;
    try {
        payload = JSON.parse(fromBase64url(encodedPayload));
    } catch {
        return { ok: false, reason: 'malformed' };
    }
    if (!payload || typeof payload !== 'object' || payload.v !== 1) return { ok: false, reason: 'malformed' };
    const expected = sign(secret, canonicalJson(payload));
    const a = Buffer.from(expected);
    const b = Buffer.from(givenSignature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'tampered' };
    if (typeof payload.exp !== 'number' || now >= payload.exp) return { ok: false, reason: 'expired' };
    if (options.expectedFormId !== undefined && payload.formId !== options.expectedFormId) {
        return { ok: false, reason: 'form_mismatch' };
    }
    // Signature covers the IDs, but re-check the shapes so a future payload
    // change cannot smuggle malformed values through verification.
    try {
        assertSafeContext(payload, options.records ?? null);
    } catch {
        return { ok: false, reason: 'malformed' };
    }
    return { ok: true, payload };
}
