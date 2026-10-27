/**
 * Dispatchers for async workflow execution (F3b-durable).
 *
 * The in-process dispatcher (used by tests + the boot recovery hook) runs a closure
 * directly. The QStash dispatcher is the distributed path: it doesn't try to
 * serialize the `work` closure (impossible — closures can't cross a network
 * boundary). Instead it publishes a RECOVERY-TRIGGER message to QStash, which
 * at-least-once redelivers it to `runUrl`. The worker's recovery endpoint
 * (POST /automations/_recover, or a dedicated /_run) then runs the idempotent
 * recovery sweep (recoverStuckExecutions) — THAT does the actual replay from
 * persisted input.
 *
 * Honest scope: the core durability (persisted input + recovery sweep + idempotent
 * completion) is fully tested locally with no creds. QStash is the "don't even rely
 * on the next inbound request to boot recovery" upgrade — the sweep runs even if the
 * isolate that kicked the work is gone and no traffic arrives.
 *
 * 🚩 ESCALATE (before hardening): the QStash callback (runUrl) must authenticate the
 * inbound request (signature verify or shared secret) so it's not trigger-able by
 * randoms. The existing /_recover is master_admin-gated (cookie auth) — a QStash
 * callback can't satisfy that, so a dedicated shared-secret /_run endpoint is the
 * follow-up. This dispatcher sends an optional `callbackSecret` header for that.
 *
 * RULE 1: server-only; the QStash token never enters a browser bundle.
 */

/** A dispatcher schedules background work. (The console's execute route + boot
 *  recovery hook both take this shape.) */
export type Dispatcher = (work: () => Promise<void>) => void;

export interface QstashDispatcherOpts {
    /** Upstash QStash token. */
    token: string;
    /** The worker URL QStash should POST the recovery trigger to (e.g.
     *  https://<worker>/automations/_recover or a dedicated /_run). */
    runUrl: string;
    /** Optional shared-secret sent as x-frontbase-callback-secret for the receiver
     *  to verify (see the escalate flag in the header). */
    callbackSecret?: string;
}

/**
 * Build a QStash-backed dispatcher. Each call publishes a recovery-trigger message
 * to QStash (the `work` closure is intentionally ignored — it can't be serialized).
 * QStash redelivers at-least-once; the receiving endpoint runs the idempotent sweep.
 */
export function qstashDispatcher(opts: QstashDispatcherOpts): Dispatcher {
    let clientPromise: Promise<{ publish: (msg: unknown) => Promise<unknown> }> | null = null;
    const getClient = async () => {
        if (!clientPromise) {
            clientPromise = import('@upstash/qstash').then((m) => {
                const Client = (m as unknown as { Client: new (o: { token: string }) => { publish: (msg: unknown) => Promise<unknown> } }).Client;
                return new Client({ token: opts.token });
            });
        }
        return clientPromise;
    };

    return async (_work: () => Promise<void>) => {
        // The closure can't be serialized — publish a recovery trigger instead.
        const client = await getClient();
        const headers: Record<string, string> = {};
        if (opts.callbackSecret) headers['x-frontbase-callback-secret'] = opts.callbackSecret;
        await client.publish({
            url: opts.runUrl,
            method: 'POST',
            headers,
            // No body needed — the receiver runs the sweep against current stuck rows.
            body: JSON.stringify({ trigger: 'qstash-recovery' }),
        });
    };
}
