/**
 * Linter — custom Frontbase rules over component `.tsx` files, AST-driven via
 * the TypeScript compiler API. Rules:
 *   FB001 no-browser-globals — engine components must not use window/document
 *          (they render server-side; Phase 1 input #3 surface).
 *   FB002 anchor-navigation   — page navigation must be <a href>, not a button
 *          relying solely on data-navigate-to (the Chimera ships no JS nav).
 *   FB003 describe-every-prop — every property in a Schema needs .describe()
 *          (builder property panels + agent diagnostics depend on it).
 *
 * ESLint wrapping is a thin layer on top (documented follow-up); the rule logic
 * and --json output are what's under test here.
 */
import ts from 'typescript';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { relative, extname, join } from 'node:path';
import { extractFromSource } from '../extractor/schema.js';
import type { CommandResult, Issue, Severity } from './types.js';

interface RuleDef {
    code: string;
    message: string;
    severity: Severity;
}

function createProgram(source: string, file: string): ts.SourceFile {
    return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function lineOf(sf: ts.SourceFile, pos: number): number {
    return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

/** FB001: no window/document in engine components. */
function ruleNoBrowserGlobals(sf: ts.SourceFile, rel: string): Issue[] {
    const issues: Issue[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && (node.text === 'window' || node.text === 'document')) {
            // skip property accesses where it's harmless (e.g. type annotations) — only flag value usage
            const parent = node.parent;
            const isQualifiedName = parent && (ts.isQualifiedName(parent));
            if (!isQualifiedName) {
                issues.push({
                    file: rel, line: lineOf(sf, node.getStart(sf)),
                    code: 'FB001', message: `\`${node.text}\` is not available in engine components — they render server-side (no React hydration)`,
                    severity: 'error', fixable: false,
                    fix: 'Move the logic into the client behaviors runtime (data-fb-* attributes), or guard with typeof checks.',
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return issues;
}

/** FB002: navigation must be <a href>. Flags Button-like components using data-navigate-to
 *  without rendering an anchor. Heuristic: a string literal "data-navigate-to" in the source
 *  implies a JS-driven nav the Chimera doesn't ship on published pages. */
function ruleAnchorNavigation(sf: ts.SourceFile, rel: string): Issue[] {
    const issues: Issue[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) && node.text === 'data-navigate-to') {
            issues.push({
                file: rel, line: lineOf(sf, node.getStart(sf)),
                code: 'FB002', message: 'JS-driven navigation (data-navigate-to) needs a client script the Chimera does not ship on published pages',
                severity: 'warning', fixable: false,
                fix: 'Render navigation as <a href> so the service worker intercepts it; reserve data-navigate-to for button-styled links only.',
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return issues;
}

/** FB003: every Schema property must have .describe(). */
function ruleDescribeEveryProp(source: string, sf: ts.SourceFile, rel: string): Issue[] {
    const issues: Issue[] = [];
    try {
        const { manifest } = extractFromSource(source, rel);
        const walk = (fields: typeof manifest.properties, pathPrefix: string) => {
            for (const f of fields) {
                const path = pathPrefix ? `${pathPrefix}.${f.name}` : f.name;
                if (!f.description) {
                    issues.push({
                        file: rel, line: lineOfSchema(source),
                        code: 'FB003', message: `Schema property \`${path}\` is missing .describe()`,
                        severity: 'warning', fixable: true,
                        fix: `Add .describe('...') to \`${f.name}\`.`,
                        path,
                    });
                }
                if (f.properties) walk(f.properties, path);
            }
        };
        walk(manifest.properties, '');
    } catch {
        // no Schema — check command reports MISSING_SCHEMA; lint skips
    }
    return issues;
}

function lineOfSchema(source: string): number {
    const m = source.match(/\bexport\s+const\s+Schema\b/);
    return m && m.index !== undefined ? source.slice(0, m.index).split('\n').length : 1;
}

export interface LintOptions {
    rules?: string[]; // restrict to these rule codes
}

export function runLint(projectPath: string, opts: LintOptions = {}): CommandResult {
    const allRules = ['FB001', 'FB002', 'FB003'];
    const active = opts.rules ?? allRules;

    const issues: Issue[] = [];
    let total = 0;

    const files = collectTsx(projectPath);
    for (const file of files) {
        total++;
        const rel = relative(projectPath, file) || file;
        const source = readFileSync(file, 'utf8');
        const sf = createProgram(source, file);
        if (active.includes('FB001')) issues.push(...ruleNoBrowserGlobals(sf, rel));
        if (active.includes('FB002')) issues.push(...ruleAnchorNavigation(sf, rel));
        if (active.includes('FB003')) issues.push(...ruleDescribeEveryProp(source, sf, rel));
    }

    const failed = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const recommendations: string[] = [];
    if (warnings > 0) recommendations.push(`${warnings} lint warning(s) — review with \`frontbase lint\`.`);

    return {
        command: 'lint',
        success: failed === 0,
        summary: { total, passed: total - issues.length, failed, warnings },
        issues, recommendations,
    };
}

function collectTsx(root: string): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
        for (const e of readdirSafe(d)) {
            if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue;
            const full = join(d, e);
            const st = statSafe(full);
            if (!st) continue;
            if (st.isDirectory()) walk(full);
            else if (extname(full) === '.tsx') out.push(full);
        }
    };
    if (existsSafe(root)) walk(root);
    return out;
}
function readdirSafe(d: string): string[] { try { return readdirSync(d); } catch { return []; } }
function statSafe(f: string) { try { return statSync(f); } catch { return undefined; } }
function existsSafe(f: string) { try { return existsSync(f); } catch { return false; } }
