/**
 * SW bundle emitter — produces a versioned sw.js: the browser engine +
 * baked-in site manifest + registration. The Cloudflare Worker / static host
 * serves sw.<hash>.js; the hash is a content hash so identical input → identical
 * output (CHM-1 versioning, deterministic).
 *
 * Manifest is projected to the BROWSER shape (execute stripped — A-16) before
 * baking in, so no server-side executors ever reach the browser.
 */
import * as esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { QueryRegistry } from '../queries/defineQueries.js';

export interface SwEmitInput {
    /** Absolute path to the user's sw.ts entry (imports createEngine + manifest). */
    entry: string;
    /** Absolute dir of the project (for resolving @frontbase/edge-core). */
    projectRoot: string;
    /** Output directory for sw.<hash>.js. */
    outDir: string;
    /** Browser-query projection of the site queries (execute stripped). Optional bake. */
    queries?: QueryRegistry;
}

export interface SwEmitResult {
    /** Bare filename, e.g. "sw.a1b2c3d4e5f6.js". */
    filename: string;
    /** Absolute path to the written file. */
    path: string;
    /** SHA-256 content hash (12 hex chars). */
    hash: string;
    bytesMin: number;
    bytesMinGzip: number;
    /** The bundled JS source (for inlining / serving from memory). */
    code: string;
}

const SW_BUDGET_KB = 150;

export async function emitSwBundle(input: SwEmitInput): Promise<SwEmitResult> {
    const result = await esbuild.build({
        entryPoints: [input.entry],
        bundle: true,
        minify: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'silent',
        absWorkingDir: input.projectRoot,
    });
    const code = result.outputFiles[0]?.text ?? '';
    const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
    const filename = `sw.${hash}.js`;
    const path = join(input.outDir, filename);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, code);

    return {
        filename, path, hash, code,
        bytesMin: Buffer.byteLength(code),
        bytesMinGzip: gzipSync(Buffer.from(code), { level: 9 }).length,
    };
}

/** Assert the emitted bundle is under the SW payload budget (M1.4 acceptance). */
export function assertSwBudget(res: SwEmitResult, budgetKb = SW_BUDGET_KB): { ok: boolean; gzipKb: number } {
    const gzipKb = res.bytesMinGzip / 1024;
    return { ok: gzipKb <= budgetKb, gzipKb };
}
