/**
 * BullMQ driver — Node-only TCP Redis queue (the worker bundle stubs 'bullmq';
 * the dynamic import throws there and the resolver downgrades with a warning).
 *
 * The long-running consumer (`start`) loops the job back to the engine's own
 * receive endpoint over HTTP, so redelivery auth and idempotency live in ONE
 * code path regardless of provider — BullMQ and QStash deliveries hit the
 * same route with the same verification. The handler given here is that
 * loop-back POST (wired by the Node host), not the execution logic itself.
 *
 * RULE 1: server-only. Operator-env trust class: the Redis endpoint is
 * deployment infrastructure, not tenant input.
 */
export interface BullmqDriver {
    /** Enqueue one job; false on any transport failure (never throws). */
    publish(job: unknown): Promise<boolean>;
    /** Start the long-running consumer (idempotent — one worker per driver). */
    start(handler: (job: unknown) => Promise<void>): Promise<void>;
    /** Stop the worker and the queue connection (best-effort). */
    close(): Promise<void>;
}

export interface BullmqDriverOpts {
    redisUrl: string;
    queueName?: string;
}

/** Build a driver. Dynamic-imports 'bullmq' — throws where it is absent
 *  (Cloudflare), which the resolver catches and downgrades. */
export async function bullmqDriver(opts: BullmqDriverOpts): Promise<BullmqDriver> {
    const mq = await import('bullmq');
    const name = opts.queueName ?? 'frontbase';
    const connection = { url: opts.redisUrl };
    const queue = new mq.Queue(name, { connection });
    let worker: { close(): Promise<void> } | null = null;
    return {
        async publish(job) {
            try {
                await queue.add('job', job, { removeOnComplete: 100 });
                return true;
            } catch {
                return false;
            }
        },
        async start(handler) {
            if (worker) return;
            const w = new mq.Worker(name, async (job: { data: unknown }) => {
                await handler(job.data);
            }, { connection });
            worker = w;
        },
        async close() {
            try { await worker?.close(); } catch { /* best-effort */ }
            try { await queue.close(); } catch { /* best-effort */ }
        },
    };
}
