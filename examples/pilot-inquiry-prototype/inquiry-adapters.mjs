/**
 * Fake delivery transports and dispatcher — fixture prototype.
 *
 * NOTHING here sends real email, opens WhatsApp, calls a CRM or reaches the
 * network. A "transport" is a scripted function whose outcome the test chooses:
 * delivered, transient failure (retryable) or permanent rejection. This is
 * what makes the prototype able to prove retry/dedup/degraded behavior
 * deterministically, without any external dependency.
 *
 * The prototype dispatches each lead to at most ONE fake destination adapter
 * (the first enabled non-store destination of the configuration). Fan-out to
 * several destinations, per-destination dedupe and real backoff schedules are
 * production design questions for the primary session.
 *
 * Production adapters are a primary-reviewed design: outbound delivery must go
 * through the existing guarded outbound fetch / connected-account seams
 * (`checkedExternalUrl`, `guardedExternalFetch`, workflow `http_request`
 * providers, server-side email providers), never a template-owned bypass.
 */

export function createFakeTransport(name, script) {
    const outcomes = Array.isArray(script) ? [...script] : null;
    const calls = [];
    return {
        name,
        calls,
        /**
         * script: array of outcomes consumed in order (last one repeats), or a
         * function (lead, attempt) => outcome.
         * outcome: { ok: true } | { ok: false, retryable: boolean, error: string }
         */
        deliver(lead, attempt) {
            calls.push({ leadId: lead.leadId, attempt });
            const outcome = outcomes
                ? (outcomes.length > 1 ? outcomes.shift() : outcomes[0])
                : script(lead, attempt);
            return { ...outcome };
        },
    };
}

/**
 * Fixed-window fake rate limiter with an injected clock. Keyed by client IP
 * plus form id. Production reuses the existing `rateLimitGuard` seam
 * (CacheProvider over the durable counters table); this fake fixes the shape.
 */
export function createFakeRateLimiter({ windowSeconds, maxSubmissions, now }) {
    const windows = new Map(); // key -> { windowStart, count }
    return {
        check(key) {
            const t = now();
            const windowStart = Math.floor(t / windowSeconds) * windowSeconds;
            const entry = windows.get(key);
            if (!entry || entry.windowStart !== windowStart) {
                windows.set(key, { windowStart, count: 1 });
                return { allowed: true, retryAfterSeconds: 0 };
            }
            if (entry.count >= maxSubmissions) {
                return { allowed: false, retryAfterSeconds: entry.windowStart + windowSeconds - Math.floor(t) };
            }
            entry.count += 1;
            return { allowed: true, retryAfterSeconds: 0 };
        },
    };
}

export function defaultRetryPolicy() {
    // Bounded, deterministic retry. Production keeps the same shape with a
    // real backoff/sweep; unbounded retries are not part of the contract.
    return { maxAttempts: 3 };
}

/**
 * Deliver one stored lead to its destination adapter. The lead record is the
 * unit of dedupe: every attempt carries the same leadId so a downstream CRM
 * can dedupe on it too.
 *
 * Returns one of:
 *   { state: 'delivered', lastError: null }
 *   { state: 'pending_retry', lastError }   (transient failure; bounded retries remain)
 *   { state: 'degraded', lastError }        (permanent refusal or attempts exhausted;
 *                                            lead kept, honest copy, admin-visible)
 */
export function dispatchLead({ lead, transport, store, retryPolicy = defaultRetryPolicy(), now }) {
    const attempt = lead.delivery.attempts + 1;
    if (attempt > retryPolicy.maxAttempts) {
        store.markDelivery(lead.leadId, { state: 'degraded', lastError: 'max_attempts_reached' });
        return { state: 'degraded', lastError: 'max_attempts_reached' };
    }
    let outcome;
    try {
        outcome = transport?.deliver(lead, attempt);
    } catch {
        // Adapter exceptions never discard a recorded lead or expose provider details.
        outcome = { ok: false, retryable: true, error: 'adapter_failure' };
    }
    if (!outcome || typeof outcome.ok !== 'boolean' || typeof outcome.then === 'function') {
        outcome = { ok: false, retryable: false, error: 'adapter_invalid' };
    }
    if (outcome.ok) {
        store.markDelivery(lead.leadId, { attempts: attempt, state: 'delivered', lastError: null, deliveredAt: now() });
        return { state: 'delivered', lastError: null };
    }
    const lastError = outcome.error ?? 'delivery_failed';
    if (outcome.retryable) {
        store.markDelivery(lead.leadId, { attempts: attempt, state: 'pending', lastError });
        return { state: 'pending_retry', lastError };
    }
    store.markDelivery(lead.leadId, { attempts: attempt, state: 'degraded', lastError });
    return { state: 'degraded', lastError };
}
