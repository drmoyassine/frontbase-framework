/**
 * check --parity (M3.1.2) — render every manifest page through all three provider
 * modes (direct/proxy/draft) and report any byte-diff as a diagnostic. Reuses the
 * `simulate` harness so the parity check and `simulate` share one code path.
 *
 * RULE 8: the gate is mutation-proven (test/parity-check.mjs breaks a provider's
 * output and confirms --parity goes RED). The only allowed difference across
 * providers is none — they must be byte-identical (the provider is the only
 * variable; the render environment label is held constant by simulate).
 */
import { simulateRender, type ProviderMode } from './simulate.js';
import type { SiteManifest } from '../manifest/build.js';
import type { CommandResult, Issue } from './types.js';

const MODES: ProviderMode[] = ['direct', 'proxy', 'draft'];

export async function runParityCheck(manifest: SiteManifest): Promise<CommandResult> {
    const issues: Issue[] = [];
    const pages = Object.keys(manifest.pages).sort();
    let passed = 0;

    for (const path of pages) {
        const bodies: Record<ProviderMode, { status: number; body: string }> = {} as never;
        for (const mode of MODES) {
            const r = await simulateRender(manifest, path, mode);
            bodies[mode] = { status: r.status, body: r.body };
        }
        // compare: direct vs proxy vs draft (status + body)
        const ref = bodies.direct;
        const refs: ProviderMode[] = ['proxy', 'draft'];
        const divergences: string[] = [];
        let ok = true;
        for (const mode of refs) {
            if (bodies[mode].status !== ref.status) { divergences.push(`${mode} status ${bodies[mode].status} ≠ direct ${ref.status}`); ok = false; }
            if (bodies[mode].body !== ref.body) {
                const diff = firstDiff(ref.body, bodies[mode].body);
                divergences.push(`${mode} body differs from direct at offset ${diff}`);
                ok = false;
            }
        }
        if (ok) passed++;
        else {
            issues.push({
                file: path, line: 1, code: 'PARITY_DIFF',
                message: `Page "${path}" renders differently across providers: ${divergences.join('; ')}`,
                severity: 'error', fixable: false,
                fix: 'A provider-sensitive value (e.g. a non-deterministic executor or environment-coupled data) leaked into the render. Make the query executor provider-agnostic.',
            });
        }
    }

    const failed = issues.filter((i) => i.severity === 'error').length;
    return {
        command: 'check',
        success: failed === 0,
        summary: { total: pages.length, passed, failed, warnings: 0 },
        issues,
        recommendations: failed > 0 ? [`${failed} page(s) fail tri-provider parity.`] : [],
        details: { mode: 'parity', providers: MODES },
    };
}

function firstDiff(a: string, b: string): number {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
    return n;
}
