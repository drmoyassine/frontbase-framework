/**
 * AgentFormatter — serializes a CommandResult to the agent JSON output shape
 * (technical-specification.md §Agent Integration). Stable key order, no
 * timestamps in the issues array (deterministic for snapshot testing).
 */
import type { CommandResult, Issue } from './types.js';

export interface AgentOutput {
    version: '1.0';
    type: string;
    success: boolean;
    summary: CommandResult['summary'];
    issues: AgentIssue[];
    recommendations: string[];
    details?: Record<string, unknown>;
}

export interface AgentIssue {
    file: string;
    line: number;
    column?: number;
    code: string;
    message: string;
    severity: Issue['severity'];
    fixable: boolean;
    fix?: string;
    path?: string;
}

const SEVERITY_RANK: Record<Issue['severity'], number> = { error: 0, warning: 1 };

export function toAgentOutput(result: CommandResult): AgentOutput {
    const issues: AgentIssue[] = [...result.issues]
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
    return {
        version: '1.0',
        type: `${result.command}-results`,
        success: result.success,
        summary: result.summary,
        issues,
        recommendations: result.recommendations,
        ...(result.details ? { details: result.details } : {}),
    };
}

/** Deterministic JSON string (sorted keys) for snapshot/stable agent output. */
export function formatAgentJson(result: CommandResult): string {
    const out = toAgentOutput(result);
    return JSON.stringify(sortKeys(out), null, 2);
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
        const o: Record<string, unknown> = {};
        for (const k of Object.keys(value as Record<string, unknown>).sort()) o[k] = sortKeys((value as Record<string, unknown>)[k]);
        return o;
    }
    return value;
}

/** Human-readable rendering of a CommandResult for non-JSON mode. */
export function formatHuman(result: CommandResult): string {
    const lines: string[] = [];
    lines.push(`frontbase ${result.command}: ${result.success ? 'PASS ✅' : 'FAIL ❌'}`);
    lines.push(`  ${result.summary.passed}/${result.summary.total} passed · ${result.summary.failed} failed · ${result.summary.warnings} warnings`);
    if (result.issues.length) {
        lines.push('');
        for (const i of result.issues) {
            const where = i.path ? `${i.file}:${i.line} (${i.path})` : `${i.file}:${i.line}`;
            lines.push(`  ${i.severity === 'error' ? '✗' : '⚠'} [${i.code}] ${where}: ${i.message}`);
            if (i.fixable && i.fix) lines.push(`      fix: ${i.fix}`);
        }
    }
    if (result.recommendations.length) {
        lines.push('');
        for (const r of result.recommendations) lines.push(`  → ${r}`);
    }
    return lines.join('\n');
}
