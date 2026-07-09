/**
 * Component checker — validates a project: every `.tsx` under the source tree
 * must export an extractable `Schema`, extract without unsupported-Zod errors,
 * and typecheck. Produces a CommandResult (agent-shaped).
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import ts from 'typescript';
import { extractFromFile } from '../extractor/schema.js';
import type { CommandResult, Issue } from './types.js';

function walkTsx(root: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(root)) {
        if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
        const full = join(root, entry);
        const st = statSync(full);
        if (st.isDirectory()) walkTsx(full, acc);
        else if (extname(full) === '.tsx') acc.push(full);
    }
    return acc;
}

function lineOfSchema(source: string): number {
    const m = source.match(/\bexport\s+const\s+Schema\b/);
    return m && m.index !== undefined ? source.slice(0, m.index).split('\n').length : 1;
}

export interface CheckOptions {
    /** Run TypeScript typechecking (tsc --noEmit) in addition to schema checks. */
    typecheck?: boolean;
}

export async function runCheck(projectPath: string, opts: CheckOptions = {}): Promise<CommandResult> {
    const issues: Issue[] = [];
    const files = existsSync(projectPath) ? walkTsx(projectPath) : [];
    let passed = 0;

    for (const file of files) {
        const rel = relative(projectPath, file) || file;
        let source: string;
        try {
            // extractFromFile throws if no Schema export — that's a MISSING_SCHEMA issue
            const { diagnostics } = extractFromFile(file);
            // re-read to get the line number for the schema (extractor doesn't return it)
            const fs = await import('node:fs');
            source = fs.readFileSync(file, 'utf8');
            if (diagnostics.length) {
                for (const d of diagnostics) {
                    issues.push({
                        file: rel, line: lineOfSchema(source), code: d.code,
                        message: `${d.message}${d.path ? ` (at ${d.path})` : ''}`,
                        severity: 'error', fixable: false, fix: d.suggestion, path: d.path,
                    });
                }
            } else {
                passed++;
            }
        } catch (e) {
            const fs = await import('node:fs');
            source = fs.readFileSync(file, 'utf8');
            const isMissing = /No `export const Schema = z\.object/.test((e as Error).message);
            issues.push({
                file: rel, line: isMissing ? lineOfSchema(source) : 1,
                code: isMissing ? 'MISSING_SCHEMA' : 'EXTRACTION_ERROR',
                message: isMissing ? 'Component missing a `Schema` (Zod) export' : (e as Error).message,
                severity: 'error', fixable: isMissing,
                fix: isMissing ? 'Add `export const Schema = z.object({...})`' : undefined,
            });
        }
    }

    // Optional tsc --noEmit pass
    if (opts.typecheck) {
        const tsIssues = typecheck(projectPath);
        issues.push(...tsIssues);
    }

    const failed = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const total = files.length;
    const success = failed === 0;

    const recommendations: string[] = [];
    const missing = issues.filter((i) => i.code === 'MISSING_SCHEMA').length;
    if (missing > 0) recommendations.push(`${missing} component(s) missing a Schema export — add one to register them in the builder.`);

    return {
        command: 'check', success,
        summary: { total, passed: success ? passed : passed, failed, warnings },
        issues, recommendations,
    };
}

/** Run tsc --noEmit over the project; map diagnostics to issues. */
function typecheck(projectPath: string): Issue[] {
    const cfgPath = ts.findConfigFile(projectPath, ts.sys.fileExists, 'tsconfig.json');
    if (!cfgPath) return [];
    const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, projectPath, { noEmit: true }, cfgPath);
    const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
    const out: Issue[] = [];
    const diags = ts.getPreEmitDiagnostics(program);
    for (const d of diags) {
        if (!d.file || d.start === undefined) continue;
        const { line, character } = ts.getLineAndCharacterOfPosition(d.file, d.start);
        out.push({
            file: relative(projectPath, d.file.fileName), line: line + 1, column: character + 1,
            code: `TS${d.code}`, message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
            severity: d.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
            fixable: false,
        });
    }
    return out;
}
