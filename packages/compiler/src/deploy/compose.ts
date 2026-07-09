/**
 * Single-worker composer (M2.4). Assembles a deployable Cloudflare Worker from a
 * Frontbase project: the engine (createEngine with the real directProvider +
 * resolvePrincipal + console sub-router) as the fetch handler, and the versioned
 * /sw.js (the browser projection — execute-stripped) served alongside.
 *
 * THE critical composition boundary (RULE 1): the worker's SERVER code (edge-infra
 * drivers, secrets, the console) lives in the fetch handler ONLY. The /sw.js the
 * browser receives is the browser projection — it must contain no server code.
 * The deploy gate asserts this.
 */
import * as esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { emitSwBundle, type SwEmitResult } from '../emit/swBundle.js';

export interface ComposeInput {
    /** Absolute path to the project's SW entry (imports edge-core, browser-safe). */
    swEntry: string;
    /** Absolute path to the project's worker entry (imports edge-core + edge-infra + backend). */
    workerEntry: string;
    projectRoot: string;
    outDir: string;
}

export interface ComposeResult {
    worker: { filename: string; bytesMin: number; bytesMinGzip: number; hash: string };
    sw: SwEmitResult;
    totalGzipKb: number;
}

const WORKER_BUDGET_KB = 400;

export async function composeWorker(input: ComposeInput): Promise<ComposeResult> {
    // 1. The worker — server code (edge-infra, backend, the real directProvider +
    //    resolvePrincipal). Targets the Worker runtime (platform: browser, no nodejs_compat).
    const workerBuild = await esbuild.build({
        entryPoints: [input.workerEntry],
        bundle: true, minify: true, write: false,
        platform: 'browser', format: 'esm',
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'silent', absWorkingDir: input.projectRoot,
    });
    const workerCode = workerBuild.outputFiles[0]?.text ?? '';
    const workerHash = createHash('sha256').update(workerCode).digest('hex').slice(0, 12);
    const workerBytesMin = Buffer.byteLength(workerCode);
    const workerGzip = gzipSync(Buffer.from(workerCode), { level: 9 }).length;

    // 2. The SW bundle — browser projection (execute-stripped; engine + manifest only).
    const sw = await emitSwBundle({ entry: input.swEntry, projectRoot: input.projectRoot, outDir: input.outDir });

    return {
        worker: { filename: `worker.${workerHash}.mjs`, bytesMin: workerBytesMin, bytesMinGzip: workerGzip, hash: workerHash },
        sw,
        totalGzipKb: (workerGzip + sw.bytesMinGzip) / 1024,
    };
}

/** Assert the composition respects the size budget (< 400 KB gzip). */
export function assertWorkerBudget(res: ComposeResult, budgetKb = WORKER_BUDGET_KB): { ok: boolean; gzipKb: number } {
    const gzipKb = res.worker.bytesMinGzip / 1024;
    return { ok: gzipKb <= budgetKb, gzipKb };
}
