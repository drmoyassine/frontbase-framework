import {serve} from '@hono/node-server';
import {bullmqDriver} from '@frontbase/edge-infra';
import {createConfiguredNode} from './node-runtime.js';
const env=process.env;
const die=(msg:string):never=>{console.error('[frontbase] '+msg);process.exit(1);};
const {engine,stateDb,envServices,externalFetch}=await createConfiguredNode(env);
const port = Number(env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) die(`PORT is not a valid port number: ${env.PORT}`);
const server = serve(
    { fetch: (req) => engine.fetch(req), port, hostname: env.HOST ?? '0.0.0.0' },
    (info) => console.log(`[frontbase] CMS listening on http://${info.address}:${info.port} (db: ${stateDb.displayUrl})`),
);

// BullMQ consumer (node-only; env wiring decides). QStash delivers over HTTP by
// itself, but a BullMQ queue needs a long-running Worker — and its jobs ride
// the SAME receive endpoint, looped back over HTTP, so verification and
// idempotency live in one place. Authentication is the shared callback secret
// (in-process delivery carries no QStash signature). Without the secret the
// receive route would 401 its own jobs, so a BullMQ env without it is a
// misconfiguration — warn and stay direct-execution rather than fail the boot.
let queueWorker: Awaited<ReturnType<typeof bullmqDriver>> | null = null;
if (envServices.queue?.provider === 'bullmq' && envServices.queue.url) {
    if (!envServices.queueCallbackSecret) {
        console.warn('[frontbase] FRONTBASE_QUEUE=BullMQ without FRONTBASE_QUEUE_CALLBACK_SECRET — queue receive would reject its own jobs; staying direct-execution');
    } else {
        try {
            const driver = await bullmqDriver({ redisUrl: envServices.queue.url });
            await driver.start(async (job) => {
                const res = await fetch(`http://127.0.0.1:${port}/api/system/queue/receive`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-frontbase-callback-secret': envServices.queueCallbackSecret!,
                    },
                    body: JSON.stringify(job),
                });
                if (!res.ok) console.error(`[frontbase] queue receive answered ${res.status} — BullMQ will retry per its attempts policy`);
            });
            queueWorker = driver;
            console.log('[frontbase] BullMQ consumer started (loop-back to /api/system/queue/receive)');
        } catch (error) {
            console.warn(`[frontbase] BullMQ consumer unavailable (${(error as Error)?.message ?? error}) — direct execution`);
        }
    }
}

// Graceful shutdown: stop accepting, let in-flight requests drain, then exit.
// The bounded fallback exit covers a hung keep-alive connection.
const shutdown = (sig: string) => {
    console.log(`[frontbase] ${sig} — shutting down`);
    if (queueWorker) void queueWorker.close().catch(() => {});
    server.close(() => { void externalFetch.close().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(0), 5_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
