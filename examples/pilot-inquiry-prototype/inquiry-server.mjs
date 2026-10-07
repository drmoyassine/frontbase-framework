/**
 * Inquiry fixture server — standalone prototype on an isolated local port.
 *
 * Default port 4394 (override with INQUIRY_PORT). All state is in-memory and
 * synthetic; the transport is a scripted fake; the signing secret is generated
 * per boot (or passed via INQUIRY_SECRET for tests). Nothing here is a
 * production route and nothing reaches the network.
 *
 * Endpoints:
 *   GET  /                      → tiny index with links (fixture convenience)
 *   GET  /inquiry/apply?token=… → form page (fresh context token if none)
 *   POST /inquiry/submit        → runs the pipeline, renders the safe result
 *   GET  /inquiry/status?receipt=… → JSON delivery status (reference only)
 *   GET  /healthz               → { ok: true }
 *
 * Responses never contain: destinations, connection references, rate-limit
 * settings, the signing secret, stack traces or provider/commercial IDs.
 */

import { createServer } from 'node:http';
import {
    defaultInquiryConfiguration,
    inquiryConfigurationSchema,
    publicFormView,
} from './inquiry-schema.mjs';
import { issueInquiryContext } from './inquiry-context.mjs';
import { createFakeLeadStore } from './inquiry-store.mjs';
import { createFakeTransport, createFakeRateLimiter } from './inquiry-adapters.mjs';
import { createInquiryPipeline } from './inquiry-pipeline.mjs';
import { buildInquiryFormPage, buildInquiryResultPage } from './inquiry-form-page.mjs';
import { randomUUID } from 'node:crypto';

export function createFixtureState(options = {}) {
    const config = inquiryConfigurationSchema.parse(options.config ?? defaultInquiryConfiguration());
    config.enabled = options.enabled ?? true;

    // Synthetic directory — stands in for the owned directory datasource.
    const institutions = new Map(options.institutions ?? [
        ['inst-512', { title: 'Muhlenberg College (synthetic)', active: true }],
        ['inst-999', { title: 'Retired synthetic institution', active: false }],
    ]);
    const programs = new Map(options.programs ?? [
        ['prog-46188', { title: 'DMD program (synthetic)', institutionId: 'inst-512', active: true }],
        ['prog-777', { title: 'Inactive synthetic program', institutionId: 'inst-512', active: false }],
    ]);

    const store = options.store ?? createFakeLeadStore();
    const secret = options.secret ?? randomUUID(); // fixture-local; never persisted or logged

    const transport = options.transport ?? createFakeTransport('fake_destination', [{ ok: true }]);

    const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
    const rateLimiter = options.rateLimiter
        ?? createFakeRateLimiter({
            windowSeconds: config.abuse.rateLimit.windowSeconds,
            maxSubmissions: config.abuse.rateLimit.maxSubmissions,
            now: nowSeconds,
        });

    const pipeline = createInquiryPipeline({
        config, secret, store, rateLimiter, transport,
        contextRecords: { institutions, programs },
        now: nowSeconds,
        clockNow: options.clockNow ?? (() => Date.now() / 1000),
    });

    const issueToken = (request) => issueInquiryContext(secret, request, {
        nowSeconds: nowSeconds(),
        expiresInSeconds: options.tokenExpiresInSeconds ?? 3600,
        records: { institutions, programs },
    });

    return { config, view: publicFormView(config), institutions, programs, store, secret, transport, rateLimiter, pipeline, issueToken, nowSeconds };
}

function sendHtml(res, status, html) {
    res.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
        'referrer-policy': 'no-referrer',
    });
    res.end(html);
}

function sendJson(res, status, body) {
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
    });
    res.end(JSON.stringify(body));
}

function parseFormBody(body) {
    const params = new URLSearchParams(body);
    const values = {};
    for (const [key, value] of params.entries()) {
        if (key === 'formId' || key === 'contextToken') continue;
        values[key] = params.getAll(key).join(', ');
    }
    return { formId: params.get('formId') ?? '', contextToken: params.get('contextToken') ?? '', values };
}

function safeErrorPage(message) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Inquiry</title></head>`
        + `<body style="font-family:system-ui;padding:2rem"><h1>Inquiry unavailable</h1>`
        + `<p>${message}</p></body></html>`;
}

export function startInquiryServer(state, options = {}) {
    const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${options.port ?? 4394}`);
        try {
            if (req.method === 'GET' && url.pathname === '/healthz') {
                return sendJson(res, 200, { ok: true });
            }
            if (req.method === 'GET' && url.pathname === '/') {
                const { token } = state.issueToken({
                    formId: state.config.formId,
                    institution: 'inst-512',
                    program: 'prog-46188',
                    originalPath: '/explore/program/dmd-synthetic/',
                });
                return sendHtml(res, 200, `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Inquiry fixture</title></head>`
                    + `<body style="font-family:system-ui;padding:2rem"><h1>Inquiry fixture</h1>`
                    + `<ul><li><a href="/inquiry/apply?token=${encodeURIComponent(token)}">Program inquiry form (tokenized)</a></li>`
                    + `<li><a href="/inquiry/apply">Form without token (server issues one)</a></li></ul></body></html>`);
            }
            if (req.method === 'GET' && url.pathname === '/inquiry/apply') {
                let token = url.searchParams.get('token') ?? '';
                if (!token) {
                    // No token: the fixture issues one for the default synthetic context.
                    token = state.issueToken({
                        formId: state.config.formId,
                        institution: 'inst-512',
                        program: 'prog-46188',
                        originalPath: '/explore/program/dmd-synthetic/',
                    }).token;
                }
                const html = await buildInquiryFormPage({
                    view: state.view,
                    token,
                    contextLabels: { institution: 'Muhlenberg College (synthetic)', program: 'DMD program (synthetic)' },
                });
                return sendHtml(res, 200, html);
            }
            if (req.method === 'POST' && url.pathname === '/inquiry/submit') {
                let body = '';
                req.on('data', chunk => {
                    body += chunk;
                    if (body.length > 128 * 1024) req.destroy(); // bounded payload
                });
                req.on('end', async () => {
                    try {
                        const request = parseFormBody(body);
                        const meta = { clientKey: req.socket.remoteAddress ?? 'unknown' };
                        const result = state.pipeline.submit(request, meta);
                        if (result.status === 'validation_error') {
                            const submitted = { ...request.values };
                            for (const [key, message] of Object.entries(result.errors ?? {})) {
                                submitted[`__error_${key}`] = message;
                            }
                            const html = await buildInquiryFormPage({
                                view: state.view,
                                token: request.contextToken, // same token; it may still be valid
                                contextLabels: {},
                                status: { kind: 'error', title: 'Please check the form', message: 'Correct the highlighted fields and send again. Your entries are preserved.' },
                                submittedValues: submitted,
                            });
                            return sendHtml(res, 400, html);
                        }
                        const html = await buildInquiryResultPage({ view: state.view, result });
                        return sendHtml(res, result.httpStatus, html);
                    } catch (error) {
                        // Safe failure: no internals, no stack, honest retry copy.
                        return sendHtml(res, 503, safeErrorPage('A temporary problem prevented the inquiry from being recorded. Nothing was sent. Please try again shortly.'));
                    }
                });
                return;
            }
            if (req.method === 'GET' && url.pathname === '/inquiry/status') {
                const receipt = url.searchParams.get('receipt') ?? '';
                const lead = state.store.getByReceipt(receipt);
                if (!lead) return sendJson(res, 404, { status: 'unknown_reference' });
                return sendJson(res, 200, {
                    status: lead.delivery.state === 'delivered' ? 'delivered'
                        : lead.delivery.state === 'degraded' ? 'received_delivery_delayed'
                            : 'received_processing',
                    receivedAt: lead.receivedAt,
                });
            }
            return sendJson(res, 404, { error: 'not_found' });
        } catch {
            return sendJson(res, 500, { error: 'internal_error' });
        }
    });
    return server;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('inquiry-server.mjs')) {
    const port = Number(process.env.INQUIRY_PORT ?? 4394);
    const state = createFixtureState({});
    const server = startInquiryServer(state, { port });
    server.listen(port, '127.0.0.1', () => {
        console.log(`[inquiry-fixture] listening on http://127.0.0.1:${port} (synthetic data, fake transports, per-boot secret)`);
    });
}
