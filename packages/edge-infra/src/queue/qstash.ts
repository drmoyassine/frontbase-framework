/**
 * QStash façade — publish + signed receive.
 *
 * Publish is hand-rolled on purpose: the SDK Client (2.x) exposes no
 * custom-fetch seam (only `baseUrl` for tests), and the wire format is one
 * POST — `POST https://qstash.upstash.io/v2/publish/{destination}` with the
 * Bearer token. Carrying an injected fetch keeps the SSRF guard over the
 * endpoint; everything else (jobs, DLQ, events) stays out of the bundle.
 *
 * Receive verification uses the SDK Receiver: signatures are v2 JWTs (HS256,
 * issuer "Upstash"; the `body` claim is base64url SHA-256 of the raw body).
 * The Receiver THROWS SignatureError on failure — this façade catches and
 * returns false. The URL (`sub`) claim is deliberately NOT checked: a worker
 * behind a URL-rewriting proxy would fail that equality forever, while the
 * body hash + issuer + expiry already carry the authentication. Deployments
 * whose proxy strips signature headers entirely use the shared callback
 * secret instead (system-services verifyInbound).
 *
 * RULE 1: server-only — the QStash token and signing keys never enter a
 * browser bundle.
 */
import { Receiver } from '@upstash/qstash';
import type { ServiceFetch } from '../cache/types.js';

const QSTASH_API = 'https://qstash.upstash.io';

export interface QstashPublishOpts {
    /** QStash token (Bearer). */
    token: string;
    /** The destination URL the message is delivered to (our receive endpoint). */
    url: string;
    /** Serialized job body. The signature is computed over exactly these bytes. */
    body: string;
    /** Headers forwarded to the destination (sent as Upstash-Forward-*). */
    headers?: Record<string, string>;
    /** QStash-side delivery retries (Upstash-Retries). */
    retries?: number;
    fetchImpl: ServiceFetch;
}

/** Publish one message. Throws on any transport/API failure — the queue
 *  resolver catches → false → the caller falls back to direct execution. */
export async function qstashPublish(opts: QstashPublishOpts): Promise<{ messageId?: string }> {
    const response = await opts.fetchImpl(
        `${QSTASH_API}/v2/publish/${encodeURIComponent(opts.url)}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${opts.token}`,
                'content-type': 'application/json',
                ...(opts.retries !== undefined ? { 'Upstash-Retries': String(opts.retries) } : {}),
                ...Object.fromEntries(
                    Object.entries(opts.headers ?? {}).map(([name, value]) => [`Upstash-Forward-${name}`, value]),
                ),
            },
            body: opts.body,
        },
    );
    if (!response.ok) throw new Error(`qstash_http_${response.status}`);
    return await response.json().catch(() => ({})) as { messageId?: string };
}

export interface QstashReceiverOpts {
    /** Current signing key (QStash console). */
    currentSigningKey: string;
    /** Next signing key — tried when the current fails (key rotation). */
    nextSigningKey?: string;
}

/** Build a verifier for `upstash-signature` headers. Never throws. */
export function makeQstashReceiver(opts: QstashReceiverOpts): {
    verify(signature: string, body: string): Promise<boolean>;
} {
    const receiver = new Receiver({
        currentSigningKey: opts.currentSigningKey,
        ...(opts.nextSigningKey ? { nextSigningKey: opts.nextSigningKey } : {}),
    });
    return {
        async verify(signature, body) {
            try {
                return await receiver.verify({ signature, body });
            } catch {
                return false;
            }
        },
    };
}
